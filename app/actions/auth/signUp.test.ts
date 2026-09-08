import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { signInviteToken } from "@/lib/auth/invite-token";

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: vi.fn(async () => undefined),
}));

const email = "convidado@empresa.test";
const input = {
  email,
  password: "SenhaForte!2026",
  password_confirm: "SenhaForte!2026",
};
const token = () =>
  signInviteToken({
    invite_id: "11111111-1111-4111-8111-111111111111",
    email,
    organization_id: "22222222-2222-4222-8222-222222222222",
    role: "admin",
    exp: Math.floor(Date.now() / 1000) + 3600,
  });

const createUser = vi.fn();
const signInWithPassword = vi.fn();

describe("signUp — somente convite", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(headers).mockResolvedValue({ get: () => null } as never);
    vi.mocked(createAdminClient).mockReturnValue({
      auth: { admin: { createUser } },
    } as never);
    vi.mocked(createClient).mockResolvedValue({ auth: { signInWithPassword } } as never);
    createUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
    signInWithPassword.mockResolvedValue({
      data: { session: { access_token: "token" } },
      error: null,
    });
  });

  it("recusa antes de tocar o provedor quando não há convite", async () => {
    const { signUp } = await import("./signUp");
    await expect(signUp(input)).resolves.toEqual({ ok: false, error: "invite_required" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("convite válido cria usuário confirmado no servidor e abre sessão", async () => {
    const invite = token();
    const { signUp } = await import("./signUp");
    await expect(signUp(input, invite)).resolves.toEqual({ ok: true, sessao_ativa: true });
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email,
        email_confirm: true,
        user_metadata: { invite_token: invite },
      }),
    );
    expect(signInWithPassword).toHaveBeenCalledWith({ email, password: input.password });
  });

  it("token emitido para outro e-mail não cria usuário", async () => {
    const outro = signInviteToken({
      invite_id: "11111111-1111-4111-8111-111111111111",
      email: "outra@empresa.test",
      organization_id: "22222222-2222-4222-8222-222222222222",
      role: "admin",
      exp: Math.floor(Date.now() / 1000) + 3600,
    });
    const { signUp } = await import("./signUp");
    const result = await signUp(input, outro);
    expect(result).toMatchObject({ ok: false, error: "validation_error" });
    expect(createUser).not.toHaveBeenCalled();
  });

  it("conta existente orienta login e não tenta abrir sessão com a nova senha", async () => {
    createUser.mockResolvedValue({
      data: { user: null },
      error: { status: 422, message: "User already registered" },
    });
    const { signUp } = await import("./signUp");
    await expect(signUp(input, token())).resolves.toEqual({ ok: false, error: "account_exists" });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
