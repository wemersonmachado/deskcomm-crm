import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  support: vi.fn(),
  guard: vi.fn(),
  mfa: vi.fn(),
  issue: vi.fn(),
  eq: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/lib/impersonate/support", () => ({ requireSupportWrite: h.support }));
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: h.guard }));
vi.mock("@/lib/auth/server", () => ({ mfaEmDivida: h.mfa }));
vi.mock("@/lib/auth/issue-invite", () => ({ issueInvite: h.issue }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: h.eq,
      }),
    }),
  }),
}));

import { POST } from "@/app/api/v1/admin/tenants/[id]/invite-owner/route";

const actor = "a2320000-0000-4000-8000-000000000001";
const organization = "a2320000-0000-4000-8000-000000000002";

function request(email = "owner@example.test") {
  return new NextRequest(`http://localhost/api/v1/admin/tenants/${organization}/invite-owner`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  h.support.mockResolvedValue(null);
  h.guard.mockResolvedValue({
    user: { id: actor, email: "admin@example.test", user_metadata: {} },
    platformAdmin: { scope: "full" },
  });
  h.mfa.mockResolvedValue(false);
  h.eq.mockReturnValue({ maybeSingle: h.maybeSingle });
  h.maybeSingle.mockResolvedValue({
    data: {
      id: organization,
      display_name: "Organização",
      status: "active",
      settings: { interface_default: { preset: "simplificada" } },
    },
    error: null,
  });
  h.issue.mockResolvedValue({
    accept_url: "https://app.example/team/accept-invite/token",
    expires_at: "2026-09-09T00:00:00.000Z",
    email_dispatched: false,
  });
});

describe("reemitir convite do responsável", () => {
  it("usa organização do path e seu perfil visual padrão", async () => {
    const response = await POST(request(), { params: Promise.resolve({ id: organization }) });
    expect(response.status).toBe(201);
    expect(h.eq).toHaveBeenCalledWith("id", organization);
    expect(h.issue).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: organization,
      email: "owner@example.test",
      role: "admin",
      interfaceSettings: { preset: "simplificada" },
    }));
    expect((await response.json()).data.email_dispatched).toBe(false);
  });

  it("recusa id/e-mail inválidos, suporte readonly e organização inativa", async () => {
    expect((await POST(request(), { params: Promise.resolve({ id: "invalid" }) })).status).toBe(400);
    expect((await POST(request("bad"), { params: Promise.resolve({ id: organization }) })).status).toBe(400);
    h.support.mockResolvedValueOnce(new Response(null, { status: 403 }));
    expect((await POST(request(), { params: Promise.resolve({ id: organization }) })).status).toBe(403);
    h.maybeSingle.mockResolvedValueOnce({ data: { id: organization, status: "suspended" }, error: null });
    expect((await POST(request(), { params: Promise.resolve({ id: organization }) })).status).toBe(409);
  });
});
