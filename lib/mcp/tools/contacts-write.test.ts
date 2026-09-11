import { describe, expect, it, vi } from "vitest";

const mocked = vi.hoisted(() => ({
  createContactHandler: vi.fn(),
  patchContactHandler: vi.fn(),
}));

vi.mock("@/app/api/v1/contacts/_handler", () => ({
  listContactsHandler: vi.fn(),
  getContactHandler: vi.fn(),
  createContactHandler: mocked.createContactHandler,
  patchContactHandler: mocked.patchContactHandler,
}));
vi.mock("@/lib/contacts/proposta-de-dado", () => ({
  CAMPOS_PROPONIVEIS: ["email", "name", "phone_number"],
  proporDadoDoContato: vi.fn(),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

import { crmCreateContact, crmUpdateContact } from "./contacts";

const ctx = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  actor: { type: "ai_agent", id: "agent", role: "agent", api_token_id: "token" },
  requestId: "request",
  supabase: {} as never,
};

describe("escrita de contatos por MCP", () => {
  it("cria um contato no handler canônico, com origem do agente e escopo de escrita", async () => {
    mocked.createContactHandler.mockResolvedValue({ contact: { id: "contact" }, action: "created" });

    await expect(
      crmCreateContact.handler(
        { display_name: "Welzimm", phone_number: "+5522999947228" },
        ctx as never,
      ),
    ).resolves.toEqual({ contact: { id: "contact" }, action: "created" });

    expect(crmCreateContact.requiresScope).toBe("mcp:write");
    expect(mocked.createContactHandler).toHaveBeenCalledWith(
      ctx.supabase,
      expect.objectContaining({ organization_id: ctx.organizationId, actor: ctx.actor }),
      expect.objectContaining({ source: "ai_agent", display_name: "Welzimm" }),
    );
  });

  it("atualiza somente o contato pertencente ao contexto confiável do token", async () => {
    mocked.patchContactHandler.mockResolvedValue({ id: "contact", display_name: "Welzimm" });

    await crmUpdateContact.handler(
      { contact_id: "33333333-3333-4333-8333-333333333333", display_name: "Welzimm" },
      ctx as never,
    );

    expect(crmUpdateContact.requiresScope).toBe("mcp:write");
    expect(mocked.patchContactHandler).toHaveBeenCalledWith(
      ctx.supabase,
      expect.objectContaining({ organization_id: ctx.organizationId, actor: ctx.actor }),
      "33333333-3333-4333-8333-333333333333",
      expect.objectContaining({ display_name: "Welzimm" }),
    );
  });
});
