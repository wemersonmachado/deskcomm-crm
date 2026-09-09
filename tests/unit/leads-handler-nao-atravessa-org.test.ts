import { describe, expect, it, vi } from "vitest";

/**
 * `contact_id` e `owner_user_id` chegam do CHAMADOR (form, webhook, MCP) e,
 * antes deste conserto, nunca eram checados contra a organização ativa — só
 * `owner_agent_id` tinha o check (comentário do próprio arquivo já nomeava a
 * classe: "a FK garante que existe, não que é da MESMA org"). Achado pela
 * auditoria de segurança/RLS de 2026-09-08.
 *
 * Sem Docker neste ambiente não dá pra rodar `tests/invariants/` (Postgres
 * real). Esta sonda mocka o client e prova a REJEIÇÃO no nível do handler —
 * não substitui o invariante real, cobre o que dá pra cobrir aqui.
 */

const ORG = "22222222-2222-4222-8222-222222222222";
const STAGE = "44444444-4444-4444-8444-444444444444";
const FUNIL = "33333333-3333-4333-8333-333333333333";
const CONTATO_DA_ORG = "55555555-5555-4555-8555-555555555555";
const CONTATO_DE_FORA = "66666666-6666-4666-8666-666666666666";
const USUARIO_DA_ORG = "77777777-7777-4777-8777-777777777777";
const USUARIO_DE_FORA = "88888888-8888-4888-8888-888888888888";
const ATOR = "11111111-1111-4111-8111-111111111111";

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: () => Promise.resolve({ error: null }),
  }),
}));
vi.mock("@/lib/atendimento/origem", () => ({
  observeServiceOrigin: vi.fn(async () => "manual"),
}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

interface Linha {
  tabela: string;
  filtros: Record<string, unknown>;
  existe: boolean;
}

/** Dublê genérico: cada tabela responde conforme o mapa `respostas`. */
function fazerSupabase(contatosDaOrg: Set<string>, membrosDaOrg: Set<string>) {
  const linhasVistas: Linha[] = [];
  const from = (tabela: string) => {
    const filtros: Record<string, unknown> = {};
    const elo: Record<string, unknown> = {};
    elo.select = () => elo;
    elo.eq = (coluna: string, valor: unknown) => {
      filtros[coluna] = valor;
      return elo;
    };
    elo.is = () => elo;
    elo.not = () => elo;
    elo.order = () => elo;
    elo.limit = () => elo;
    elo.insert = (linha: Record<string, unknown>) => {
      const inserted = { id: "novo-lead", ...linha };
      return { select: () => ({ single: () => Promise.resolve({ data: inserted, error: null }) }) };
    };
    elo.single = () => Promise.resolve({ data: { id: "novo-lead" }, error: null });
    elo.maybeSingle = () => {
      if (tabela === "crm_stages") {
        const existe = filtros.id === STAGE;
        return Promise.resolve({
          data: existe ? { id: STAGE, pipeline_id: FUNIL, organization_id: ORG } : null,
          error: null,
        });
      }
      if (tabela === "crm_leads") {
        // max position_in_stage — vazio é suficiente pro teste
        return Promise.resolve({ data: null, error: null });
      }
      if (tabela === "contacts") {
        const id = filtros.id as string;
        const org = filtros.organization_id as string;
        linhasVistas.push({ tabela, filtros: { ...filtros }, existe: contatosDaOrg.has(id) && org === ORG });
        const existe = contatosDaOrg.has(id) && org === ORG;
        return Promise.resolve({ data: existe ? { id } : null, error: null });
      }
      if (tabela === "user_organizations") {
        const id = filtros.user_id as string;
        const org = filtros.organization_id as string;
        const existe = membrosDaOrg.has(id) && org === ORG;
        return Promise.resolve({ data: existe ? { user_id: id } : null, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    };
    return elo;
  };
  return { from, linhasVistas };
}

function ctx() {
  return {
    organization_id: ORG,
    actor: { type: "user" as const, id: ATOR },
    requestId: "req-1",
    idioma: "pt-BR" as const,
  };
}

function inputBase() {
  return {
    pipeline_id: FUNIL,
    stage_id: STAGE,
    title: "Negócio de teste",
    description: null,
    value_cents: null,
    currency: "BRL",
    tags: [],
    source: "manual",
  };
}

describe("createLeadHandler não atravessa organização", () => {
  it("contact_id de OUTRA organização é recusado com 422, não plantado no lead", async () => {
    const { createLeadHandler } = await import("@/app/api/v1/leads/_handler");
    const supabase = fazerSupabase(new Set([CONTATO_DA_ORG]), new Set([USUARIO_DA_ORG]));

    await expect(
      createLeadHandler(
        { from: supabase.from } as never,
        ctx(),
        { ...inputBase(), contact_id: CONTATO_DE_FORA },
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("contact_id da MESMA organização é aceito", async () => {
    const { createLeadHandler } = await import("@/app/api/v1/leads/_handler");
    const supabase = fazerSupabase(new Set([CONTATO_DA_ORG]), new Set([USUARIO_DA_ORG]));

    const lead = await createLeadHandler(
      { from: supabase.from } as never,
      ctx(),
      { ...inputBase(), contact_id: CONTATO_DA_ORG },
    );
    expect(lead).toMatchObject({ contact_id: CONTATO_DA_ORG });
  });

  it("owner_user_id que não é MEMBRO da organização é recusado com 422", async () => {
    const { createLeadHandler } = await import("@/app/api/v1/leads/_handler");
    const supabase = fazerSupabase(new Set([CONTATO_DA_ORG]), new Set([USUARIO_DA_ORG]));

    await expect(
      createLeadHandler(
        { from: supabase.from } as never,
        ctx(),
        { ...inputBase(), owner_user_id: USUARIO_DE_FORA },
      ),
    ).rejects.toMatchObject({ status: 422 });
  });

  it("owner_user_id MEMBRO da organização é aceito", async () => {
    const { createLeadHandler } = await import("@/app/api/v1/leads/_handler");
    const supabase = fazerSupabase(new Set([CONTATO_DA_ORG]), new Set([USUARIO_DA_ORG]));

    const lead = await createLeadHandler(
      { from: supabase.from } as never,
      ctx(),
      { ...inputBase(), owner_user_id: USUARIO_DA_ORG },
    );
    expect(lead).toMatchObject({ owner_user_id: USUARIO_DA_ORG, owner_kind: "user" });
  });
});
