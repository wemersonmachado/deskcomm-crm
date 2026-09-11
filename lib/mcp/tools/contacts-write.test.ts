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

const contactCompleto = {
  id: "44444444-4444-4444-8444-444444444444",
  organization_id: "organization-interno",
  name: "Contato de teste",
  display_name: "Contato de teste",
  email: "contato.teste@example.invalid",
  email_normalized: "contato.teste@example.invalid",
  phone_number: "+5511999990001",
  cpf_hash: "hash-que-nao-pode-sair",
  birthdate: "1990-01-01",
  is_blocked: false,
  blocked_reason: null,
  is_anonymized: false,
  anonymized_at: null,
  is_merged_into: null,
  merged_at: null,
  consent: { marketing: true },
  tags: ["teste"],
  source: "ai_agent",
  source_metadata: { origem_interna: true },
  custom_fields: { segredo_operacional: "nao-expor" },
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  last_activity_at: null,
};

const ctx = {
  organizationId: "22222222-2222-4222-8222-222222222222",
  actor: { type: "ai_agent", id: "agent", role: "agent", api_token_id: "token" },
  requestId: "request",
  supabase: {} as never,
};

describe("escrita de contatos por MCP", () => {
  it("cria um contato no handler canônico, com origem do agente e escopo de escrita", async () => {
    mocked.createContactHandler.mockResolvedValue({ contact: contactCompleto, action: "created" });

    await expect(
      crmCreateContact.handler(
        { display_name: "Contato de teste", phone_number: "+5511999990001" },
        ctx as never,
      ),
    ).resolves.toMatchObject({ contact: { id: contactCompleto.id }, action: "created" });

    expect(crmCreateContact.requiresScope).toBe("mcp:write");
    expect(mocked.createContactHandler).toHaveBeenCalledWith(
      ctx.supabase,
      expect.objectContaining({ organization_id: ctx.organizationId, actor: ctx.actor }),
      expect.objectContaining({ source: "ai_agent", display_name: "Contato de teste" }),
    );
  });

  it("atualiza somente o contato pertencente ao contexto confiável do token", async () => {
    mocked.patchContactHandler.mockResolvedValue(contactCompleto);

    await crmUpdateContact.handler(
      { contact_id: "33333333-3333-4333-8333-333333333333", display_name: "Contato de teste" },
      ctx as never,
    );

    expect(crmUpdateContact.requiresScope).toBe("mcp:write");
    expect(mocked.patchContactHandler).toHaveBeenCalledWith(
      ctx.supabase,
      expect.objectContaining({ organization_id: ctx.organizationId, actor: ctx.actor }),
      "33333333-3333-4333-8333-333333333333",
      expect.objectContaining({ display_name: "Contato de teste" }),
    );
  });

  it("não retorna dados internos ou sensíveis após criar ou atualizar", async () => {
    mocked.createContactHandler.mockResolvedValue({ contact: contactCompleto, action: "created" });
    mocked.patchContactHandler.mockResolvedValue(contactCompleto);

    const criado = await crmCreateContact.handler({ display_name: "Contato de teste" }, ctx as never);
    const atualizado = await crmUpdateContact.handler(
      { contact_id: "33333333-3333-4333-8333-333333333333", display_name: "Contato de teste" },
      ctx as never,
    );

    for (const result of [criado, atualizado] as Array<{ contact: Record<string, unknown> }>) {
      expect(result.contact).not.toHaveProperty("cpf_hash");
      expect(result.contact).not.toHaveProperty("organization_id");
      expect(result.contact).not.toHaveProperty("source_metadata");
      expect(result.contact).not.toHaveProperty("custom_fields");
      expect(result.contact).not.toHaveProperty("birthdate");
    }
  });
});
