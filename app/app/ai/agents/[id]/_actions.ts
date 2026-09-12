"use server";
/**
 * Server actions para o editor de agent (Spec 12 §3 / S-13.11).
 *
 * `saveAgentDraftAction`  — admin. Cria/atualiza version draft.
 *   Estratégia: se já existir uma draft pro agent, PATCH nela (evita explosão
 *   de versões para edits incrementais). Senão, POST cria nova draft com
 *   version_number = max+1.
 *
 * `publishAgentAction`    — admin. Publica via `fn_publish_ai_agent_version`.
 *
 * `createMcpAgentAction`  — admin. Cria agent kind=mcp_agent + v1 draft (rota
 *   POST /api/v1/ai/agents Modo B).
 *
 * Todos os actions devolvem o objeto de resultado simples `{ ok, data?, error?, message? }`
 * porque a UI consome direto. Audit é emitido pelas rotas REST onde aplicável;
 * aqui chamamos os handlers internos para reusar a lógica.
 */
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";

import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { mensagemDoEscopo, validarEscopoDaVersao } from "@/lib/ai/agents/escopo";
import {
  agentCreationDraftSchema,
  agentMcpCreateSchema,
  agentMcpPatchSchema,
  PUBLISH_ERROR_CODES,
  versionCreateSchema,
  versionPatchSchema,
  externalMcpVersionCreateSchema,
  externalMcpVersionPatchSchema,
} from "@/lib/ai/agents/validation";
import { isExternalMcpRegistration } from "@/lib/mcp/external-configuration";
import { publishAgentVersion } from "@/lib/ai/agents/publish";
import { escolherVersoesDaTela } from "@/lib/ai/agents/versoes-da-tela";
import { VALID_TOOL_IDS } from "@/lib/mcp/tools";

const UUID_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const VERSION_COLUMNS =
  "id, organization_id, agent_id, version_number, system_prompt, provider, model, credential_id, tool_ids, trigger_config, channel_session_id, max_steps, token_budget, cost_budget_cents, history_message_window, history_token_window, handoff_keywords, handoff_tool_enabled, cases_enabled, split_messages, split_max_chars, followup, operator_enabled, operator_model, operator_tool_ids, status, published_at, superseded_at, created_at, created_by,pipeline_ids,knowledge_source_ids,provisioning_origin";

const PROMPT_INICIAL = "Você é um atendente. Responda de forma educada e clara, em pt-BR.";
const NOME_INICIAL = "Novo agente";

type ActionResult<T = void> =
  | { ok: true; data?: T }
  | { ok: false; error: string; message?: string; details?: unknown };

async function ensureAdmin() {
  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false as const, error: "unauthenticated" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false as const, error: "forbidden_tenant" };
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false as const, error: "forbidden_role" };
  }
  return { ok: true as const, authUser, activeOrg };
}

// ---------------------------------------------------------------------------
// Rascunho da PRIMEIRA configuração
// ---------------------------------------------------------------------------

/**
 * Reabre o rascunho incompleto mais recente do mesmo autor ou cria um só.
 * Abrir /new repetidas vezes não espalha cartões vazios pela organização.
 */
export async function getOrCreateAgentCreationDraftAction(): Promise<
  ActionResult<{ agent_id: string }>
> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { authUser, activeOrg } = guard;
  const admin = createAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("ai_agents")
    .select("id")
    .eq("organization_id", activeOrg.orgId)
    .eq("created_by", authUser.id)
    .eq("kind", "mcp_agent")
    .is("archived_at", null)
    .contains("config", { creation_draft: { state: "incomplete" } })
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    return { ok: false, error: "internal_error", message: existingError.message };
  }

  if (existing?.id) return { ok: true, data: { agent_id: existing.id } };

  const initialForm = {
    name: "",
    description: "",
    priority: 0,
    version: { provider: "anthropic", system_prompt: PROMPT_INICIAL },
  };
  const { data: created, error: createError } = await admin
    .from("ai_agents")
    .insert({
      organization_id: activeOrg.orgId,
      name: NOME_INICIAL,
      description: null,
      model: "pending",
      system_prompt: PROMPT_INICIAL,
      kind: "mcp_agent",
      priority: 0,
      is_active: false,
      is_default: false,
      created_by: authUser.id,
    })
    .select("id, config")
    .single();
  if (createError || !created) {
    return { ok: false, error: "internal_error", message: createError?.message };
  }

  const config = {
    ...((created.config ?? {}) as Record<string, unknown>),
    creation_draft: { state: "incomplete", form: initialForm },
  };
  const { error: markError } = await admin
    .from("ai_agents")
    .update({ config })
    .eq("id", created.id)
    .eq("organization_id", activeOrg.orgId);
  if (markError) {
    await admin
      .from("ai_agents")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", created.id)
      .eq("organization_id", activeOrg.orgId);
    return { ok: false, error: "internal_error", message: markError.message };
  }

  void audit({
    action: "ai_agent.created",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "ai_agent",
    resourceId: created.id,
    requestId: randomUUID(),
    metadata: { kind: "mcp_agent", creation_state: "incomplete" },
  });
  return { ok: true, data: { agent_id: created.id } };
}

/** Persiste somente campos conhecidos do formulário; nenhum segredo viaja aqui. */
export async function saveAgentCreationDraftAction(
  agentId: string,
  payload: unknown,
): Promise<ActionResult<{ saved_at: string }>> {
  if (!UUID_RX.test(agentId)) return { ok: false, error: "invalid_request" };
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { activeOrg } = guard;
  const parsed = agentCreationDraftSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }
  const admin = createAdminClient();
  const [agentQuery, versionQuery] = await Promise.all([
    admin
      .from("ai_agents")
      .select("id, config, archived_at")
      .eq("id", agentId)
      .eq("organization_id", activeOrg.orgId)
      .maybeSingle(),
    admin
      .from("ai_agent_versions")
      .select("id", { count: "exact", head: true })
      .eq("agent_id", agentId)
      .eq("organization_id", activeOrg.orgId),
  ]);
  const { data: agent, error: agentError } = agentQuery;
  const { count: versionCount, error: versionError } = versionQuery;
  if (agentError || versionError) {
    return {
      ok: false,
      error: "internal_error",
      message: agentError?.message ?? versionError?.message,
    };
  }
  if (!agent) return { ok: false, error: "not_found" };
  if (agent.archived_at) return { ok: false, error: "agent_archived" };
  // Fecha a corrida com o salvamento definitivo: depois que existe versão, um
  // autosave atrasado jamais ressuscita o marcador de configuração incompleta.
  if ((versionCount ?? 0) > 0) return { ok: false, error: "draft_already_completed" };

  const form = parsed.data;
  const savedAt = new Date().toISOString();
  const config = {
    ...((agent.config ?? {}) as Record<string, unknown>),
    creation_draft: { state: "incomplete", saved_at: savedAt, form },
  };
  const { error } = await admin
    .from("ai_agents")
    .update({
      name: form.name.trim() || NOME_INICIAL,
      description: form.description.trim() || null,
      priority: form.priority,
      config,
      updated_at: savedAt,
    })
    .eq("id", agentId)
    .eq("organization_id", activeOrg.orgId);
  if (error) return { ok: false, error: "internal_error", message: error.message };

  // Segunda leitura fecha a corrida com "Concluir configuração". Se a versão
  // nasceu entre a primeira contagem e o UPDATE acima, este autosave remove o
  // marcador que acabou de gravar em vez de ressuscitar um rascunho concluído.
  const { count: completedCount, error: completedError } = await admin
    .from("ai_agent_versions")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", agentId)
    .eq("organization_id", activeOrg.orgId);
  if (completedError) {
    return { ok: false, error: "internal_error", message: completedError.message };
  }
  if ((completedCount ?? 0) > 0) {
    const clearError = await limparMarcadorDeCriacao(
      admin,
      agentId,
      activeOrg.orgId,
      config,
    );
    if (clearError) return { ok: false, error: "internal_error", message: clearError };
  }
  revalidatePath("/app/ai/agents");
  return { ok: true, data: { saved_at: savedAt } };
}

async function limparMarcadorDeCriacao(
  admin: ReturnType<typeof createAdminClient>,
  agentId: string,
  orgId: string,
  configAtual: unknown,
): Promise<string | null> {
  const config = { ...((configAtual ?? {}) as Record<string, unknown>) };
  if (!("creation_draft" in config)) return null;
  delete config.creation_draft;
  const { error } = await admin
    .from("ai_agents")
    .update({ config, updated_at: new Date().toISOString() })
    .eq("id", agentId)
    .eq("organization_id", orgId);
  return error?.message ?? null;
}

// ---------------------------------------------------------------------------
// saveAgentDraftAction
// ---------------------------------------------------------------------------

/**
 * Grava as colunas de cadastro em `ai_agents` — e só quando alguma mudou.
 *
 * Uma rodada que não mudou nada não é mutação, e auditar todo "Salvar rascunho"
 * encheria `api_audit_log` de linha sem efeito. A comparação é contra a linha
 * lida no mesmo request.
 */
async function gravarCadastroDoAgente(
  admin: ReturnType<typeof createAdminClient>,
  args: {
    agentId: string;
    orgId: string;
    actorUserId: string;
    requestId: string;
    atual: { name?: unknown; description?: unknown; priority?: unknown };
    pedido: { name?: string; description?: string | null; priority?: number };
  },
): Promise<{ erro: string } | { mudou: string[] }> {
  const patch: Record<string, unknown> = {};
  for (const campo of ["name", "description", "priority"] as const) {
    const novo = args.pedido[campo];
    if (novo === undefined) continue;
    if ((args.atual[campo] ?? null) === (novo ?? null)) continue;
    patch[campo] = novo ?? null;
  }
  if (Object.keys(patch).length === 0) return { mudou: [] };

  // Service role bypassa RLS: o filtro de organização é manual e obrigatório.
  const { error } = await admin
    .from("ai_agents")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", args.agentId)
    .eq("organization_id", args.orgId);
  if (error) return { erro: error.message };

  void audit({
    action: "ai_agent.updated",
    actorUserId: args.actorUserId,
    organizationId: args.orgId,
    resourceType: "ai_agent",
    resourceId: args.agentId,
    requestId: args.requestId,
    metadata: { fields: Object.keys(patch) },
  });
  return { mudou: Object.keys(patch) };
}

export async function saveAgentDraftAction(
  agentId: string,
  payload: unknown,
  /**
   * Nome, descrição e ordem de preferência — as três colunas que moram em
   * `ai_agents` e que `ai_agent_versions` NÃO tem. Elas viajavam só na criação;
   * em modo edição, `toVersionPayload` era o único construtor do envio e não as
   * incluía. A pessoa digitava o nome, via "Rascunho vN salvo.", publicava com
   * sucesso — e o cartão da lista seguia com o nome antigo, porque nada daquilo
   * era mentira: tudo se referia à VERSÃO, a única coisa realmente gravada.
   * (issue #463)
   */
  cadastro?: unknown,
): Promise<ActionResult<{ version_id: string; version_number: number }>> {
  if (!UUID_RX.test(agentId)) return { ok: false, error: "invalid_request" };
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { authUser, activeOrg } = guard;

  // Validado ANTES de qualquer escrita, junto do resto. Se o cadastro fosse
  // conferido depois, uma ordem inválida devolveria erro com a versão já
  // gravada; se fosse GRAVADO antes, um escopo inválido devolveria erro com o
  // nome já trocado — a lista mostrando o novo e o editor o velho.
  // `agentMcpPatchSchema` é a régua que a rota REST já usa: uma quarta régua
  // para o mesmo campo é o defeito seguinte.
  const cadastroParsed =
    cadastro === undefined ? null : agentMcpPatchSchema.safeParse(cadastro);
  if (cadastroParsed && !cadastroParsed.success) {
    return { ok: false, error: "validation_failed", details: cadastroParsed.error.flatten() };
  }

  const requestId = randomUUID();
  const admin = createAdminClient();

  // Sanity: o agent existe e é da org? não está arquivado?
  const { data: agent } = await admin
    .from("ai_agents")
    .select("id, kind, archived_at, name, description, priority, published_version_id, config")
    .eq("id", agentId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (!agent) return { ok: false, error: "not_found" };
  if (agent.archived_at) return { ok: false, error: "agent_archived" };

  // Só o marcador lido do banco autoriza rascunho externo sem canal local.
  // O cliente não pode converter um agente nativo por campos do payload.
  const external = isExternalMcpRegistration(agent.config);
  const schema = external ? externalMcpVersionCreateSchema : versionCreateSchema;
  const parsed = schema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }
  const v = parsed.data;

  // O escopo aponta para coisas que EXISTEM nesta organização. Marcar um
  // material apagado (ou de outra organização) produz uma configuração muda: a
  // tela mostra a marcação, o assistente não acha nada, e ninguém vê erro.
  const escopo = await validarEscopoDaVersao(admin, activeOrg.orgId, {
    pipeline_ids: v.pipeline_ids,
    knowledge_source_ids: v.knowledge_source_ids,
  });
  if (!escopo.ok) {
    return { ok: false, error: "validation_failed", message: mensagemDoEscopo(escopo) };
  }

  // Em QUAL rascunho esta escrita cai — pela MESMA régua que a tela usa para
  // decidir qual versão abrir (`escolherVersoesDaTela`, chamada em `page.tsx`).
  // Uma segunda régua aqui é o defeito, não uma economia de consulta.
  //
  // Era "o rascunho de maior version_number, sem perguntar se ainda vale", e as
  // duas respostas divergiam no rascunho SUPERADO — o rascunho ANTERIOR à
  // publicada, estado que `revertToVersionAction` cria toda vez que alguém com
  // trabalho em andamento reverte pelo Histórico. Medido com [v5 draft, v6
  // publicada]: a tela responde `draft = null` (e chama a v5 de
  // `draftObsoleto`), o servidor respondia `draft = v5`. Dois estragos de uma
  // vez:
  //
  //   1. O trabalho ia para uma versão que a tela não reabre e o botão não
  //      publica (`props.draft` é nulo enquanto o rascunho for superado). Aviso
  //      verde "Rascunho v5 salvo.", recarrega, e a tela volta a mostrar a v6 —
  //      o mesmo desfecho do defeito que o PR #502 consertou, por outra porta.
  //   2. O rascunho superado é um RETRATO. A tela promete "ele continua no
  //      Histórico" (`AgentForm.tsx`, `title` do badge) e o `VersionHistory` o
  //      lista. Regravá-lo trocava o conteúdo daquela linha por um texto que
  //      ninguém rascunhou ali, sem erro e sem volta — e o gatilho
  //      `fn_ai_agent_version_content_immutable` não pega este caso, porque ele
  //      congela conteúdo de `status <> 'draft'` e o rascunho superado ainda é
  //      `draft`.
  const { data: versoes } = await admin
    .from("ai_agent_versions")
    .select("id, version_number, status")
    .eq("organization_id", activeOrg.orgId)
    .eq("agent_id", agentId)
    .order("version_number", { ascending: false });

  const { draft: existingDraft } = escolherVersoesDaTela(
    versoes ?? [],
    // MEDIDA, não palpite. O ponteiro é o que o motor executa (`agent-config.ts`
    // faz `join … on v.id = a.published_version_id`); `status = 'published'` é
    // rótulo, e os dois já divergem em produção. `?? null` é obrigatório e não
    // enfeite: no schema a coluna é `uuid` NULL sem default (procure por
    // `"published_version_id" "uuid"` em `supabase/baseline.sql`; a FK é `on
    // delete set null`), então `null` é o dado "não há publicada" —
    // enquanto `undefined` faria a régua cair no palpite. Medido com [v8
    // published, v7 draft, v6 published] e ponteiro em v6: pela medida o
    // rascunho vigente é a v7; pelo palpite não há rascunho vigente nenhum, e
    // cada salvamento nasceria uma versão nova.
    agent.published_version_id ?? null,
  );

  if (existingDraft) {
    // PATCH na draft existente — não infla a sequência de versions.
    const patchValidated = (external ? externalMcpVersionPatchSchema : versionPatchSchema).safeParse(payload);
    if (!patchValidated.success) {
      return { ok: false, error: "validation_failed", details: patchValidated.error.flatten() };
    }
    const update: Record<string, unknown> = { ...patchValidated.data };
    const { data: updated, error } = await admin
      .from("ai_agent_versions")
      .update(update)
      .eq("id", existingDraft.id)
      .eq("organization_id", activeOrg.orgId)
      .select(VERSION_COLUMNS)
      .single();

    if (error || !updated) {
      return { ok: false, error: "internal_error", message: error?.message };
    }

    void audit({
      action: "ai_agent.version_updated",
      actorUserId: authUser.id,
      organizationId: activeOrg.orgId,
      resourceType: "ai_agent_version",
      resourceId: existingDraft.id,
      requestId,
      metadata: { agent_id: agentId, fields: Object.keys(update) },
    });

    if (cadastroParsed?.success) {
      const r = await gravarCadastroDoAgente(admin, {
        agentId,
        orgId: activeOrg.orgId,
        actorUserId: authUser.id,
        requestId,
        atual: agent,
        pedido: cadastroParsed.data,
      });
      // As duas escritas não são atômicas. O desfecho tem de dizer o que
      // gravou: um toast verde genérico aqui reproduz o defeito com outra cara.
      if ("erro" in r) {
        return {
          ok: false,
          error: "internal_error",
          message: `O rascunho foi salvo, mas o cadastro do agente não: ${r.erro}`,
        };
      }
      if (r.mudou.length > 0) revalidatePath("/app/ai/agents");
    }

    const clearError = await limparMarcadorDeCriacao(
      admin,
      agentId,
      activeOrg.orgId,
      agent.config,
    );
    if (clearError) {
      return {
        ok: false,
        error: "internal_error",
        message: `A versão foi salva, mas o marcador de criação não foi encerrado: ${clearError}`,
      };
    }

    revalidatePath(`/app/ai/agents/${agentId}`);
    return {
      ok: true,
      data: {
        version_id: existingDraft.id,
        version_number: existingDraft.version_number,
      },
    };
  }

  // Cria draft v(max+1) com retry em 23505.
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: maxRow } = await admin
      .from("ai_agent_versions")
      .select("version_number")
      .eq("agent_id", agentId)
      .eq("organization_id", activeOrg.orgId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNumber = (maxRow?.version_number ?? 0) + 1;

    const { data: created, error } = await admin
      .from("ai_agent_versions")
      .insert({
        organization_id: activeOrg.orgId,
        agent_id: agentId,
        version_number: nextNumber,
        system_prompt: v.system_prompt,
        provider: v.provider,
        model: v.model,
        credential_id: v.credential_id,
        tool_ids: v.tool_ids,
        trigger_config: v.trigger_config ?? undefined,
        channel_session_id: v.channel_session_id,
        max_steps: v.max_steps,
        token_budget: v.token_budget,
        cost_budget_cents: v.cost_budget_cents,
        history_message_window: v.history_message_window,
        history_token_window: v.history_token_window,
        handoff_keywords: v.handoff_keywords,
        handoff_tool_enabled: v.handoff_tool_enabled,
        cases_enabled: v.cases_enabled,
        operator_enabled: v.operator_enabled,
        operator_model: v.operator_model,
        operator_tool_ids: v.operator_tool_ids,
        pipeline_ids: v.pipeline_ids,
        knowledge_source_ids: v.knowledge_source_ids,
        split_messages: v.split_messages,
        split_max_chars: v.split_max_chars,
        followup: v.followup,
        status: "draft",
        created_by: authUser.id,
      })
      .select("id, version_number")
      .single();

    if (!error && created) {
      void audit({
        action: "ai_agent.version_created",
        actorUserId: authUser.id,
        organizationId: activeOrg.orgId,
        resourceType: "ai_agent_version",
        resourceId: created.id,
        requestId,
        metadata: { agent_id: agentId, version_number: created.version_number },
      });
      if (cadastroParsed?.success) {
        const r = await gravarCadastroDoAgente(admin, {
          agentId,
          orgId: activeOrg.orgId,
          actorUserId: authUser.id,
          requestId,
          atual: agent,
          pedido: cadastroParsed.data,
        });
        if ("erro" in r) {
          return {
            ok: false,
            error: "internal_error",
            message: `O rascunho foi salvo, mas o cadastro do agente não: ${r.erro}`,
          };
        }
        if (r.mudou.length > 0) revalidatePath("/app/ai/agents");
      }

      const clearError = await limparMarcadorDeCriacao(
        admin,
        agentId,
        activeOrg.orgId,
        agent.config,
      );
      if (clearError) {
        return {
          ok: false,
          error: "internal_error",
          message: `A versão foi salva, mas o marcador de criação não foi encerrado: ${clearError}`,
        };
      }

      revalidatePath(`/app/ai/agents/${agentId}`);
      return { ok: true, data: { version_id: created.id, version_number: created.version_number } };
    }
    if (error?.code !== "23505") {
      return { ok: false, error: "internal_error", message: error?.message };
    }
  }
  return { ok: false, error: "internal_error", message: "Conflito de versionamento." };
}

// ---------------------------------------------------------------------------
// publishAgentAction
// ---------------------------------------------------------------------------

export async function publishAgentAction(
  agentId: string,
  versionId: string,
): Promise<ActionResult<{ version_id: string; previous_version_id: string | null }>> {
  if (!UUID_RX.test(agentId) || !UUID_RX.test(versionId)) {
    return { ok: false, error: "invalid_request" };
  }
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { authUser, activeOrg } = guard;

  const requestId = randomUUID();
  const admin = createAdminClient();

  // Tool ids check (espelha publish/route.ts).
  const valid = new Set<string>(VALID_TOOL_IDS as readonly string[]);
  const { data: targetV } = await admin
    .from("ai_agent_versions")
    .select("id, agent_id, tool_ids")
    .eq("id", versionId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (!targetV || targetV.agent_id !== agentId) {
    return { ok: false, error: "version_not_found" };
  }
  const tools = (targetV.tool_ids ?? []) as string[];
  const invalid = tools.filter((t) => !valid.has(t));
  if (invalid.length > 0) {
    return { ok: false, error: "tool_id_invalid", details: { invalid } };
  }

  const result = await publishAgentVersion(admin, {
    orgId: activeOrg.orgId,
    agentId,
    versionId,
  });

  if (!result.ok) {
    if (PUBLISH_ERROR_CODES.has(result.code as string)) {
      return { ok: false, error: result.code };
    }
    return { ok: false, error: "internal_error" };
  }

  void admin
    .from("event_log")
    .insert({
      organization_id: activeOrg.orgId,
      event_type: "ai_agent.published",
      payload: {
        agent_id: result.agent_id,
        version_id: result.version_id,
        previous_version_id: result.previous_version_id,
        published_at: result.published_at,
      },
    })
    .then(({ error }) => {
      if (error) console.error("[saveAgentDraftAction/publish] event_log error", error.message);
    });

  void audit({
    action: "ai_agent.published",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "ai_agent",
    resourceId: agentId,
    requestId,
    metadata: { version_id: result.version_id, previous_version_id: result.previous_version_id },
  });

  revalidatePath(`/app/ai/agents/${agentId}`);
  revalidatePath("/app/ai/agents");
  return {
    ok: true,
    data: { version_id: result.version_id, previous_version_id: result.previous_version_id },
  };
}

// ---------------------------------------------------------------------------
// revertToVersionAction
// ---------------------------------------------------------------------------
//
// Cria uma nova draft idêntica a `versionId` e a publica imediatamente. O
// fluxo é: clone → INSERT draft v(max+1) → publishAgentVersion. Audit
// `ai_agent.reverted` registra a ponta original. Mesma validação de tools do
// publish original (espelha publish/route.ts).

export async function revertToVersionAction(
  agentId: string,
  versionId: string,
): Promise<
  ActionResult<{
    new_version_id: string;
    new_version_number: number;
    previous_version_id: string | null;
  }>
> {
  if (!UUID_RX.test(agentId) || !UUID_RX.test(versionId)) {
    return { ok: false, error: "invalid_request" };
  }
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { authUser, activeOrg } = guard;

  const requestId = randomUUID();
  const admin = createAdminClient();

  const { data: agent } = await admin
    .from("ai_agents")
    .select("id, archived_at")
    .eq("id", agentId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (!agent) return { ok: false, error: "not_found" };
  if (agent.archived_at) return { ok: false, error: "agent_archived" };

  const { data: source } = await admin
    .from("ai_agent_versions")
    .select(VERSION_COLUMNS)
    .eq("id", versionId)
    .eq("organization_id", activeOrg.orgId)
    .eq("agent_id", agentId)
    .maybeSingle();
  if (!source) return { ok: false, error: "version_not_found" };

  // Espelha tool_id check do publish.
  const tools = ((source as { tool_ids: string[] | null }).tool_ids ?? []) as string[];
  const valid = new Set<string>(VALID_TOOL_IDS as readonly string[]);
  const invalid = tools.filter((t) => !valid.has(t));
  if (invalid.length > 0) {
    return { ok: false, error: "tool_id_invalid", details: { invalid } };
  }

  // Cria draft idêntica com retry em 23505 (race no version_number).
  type SourceRow = {
    system_prompt: string;
    provider: string;
    model: string;
    credential_id: string;
    tool_ids: string[];
    trigger_config: Record<string, unknown> | null;
    channel_session_id: string;
    max_steps: number;
    token_budget: number;
    cost_budget_cents: number;
    history_message_window: number;
    history_token_window: number;
    handoff_keywords: string[];
    handoff_tool_enabled: boolean;
    cases_enabled: boolean;
    operator_enabled: boolean;
    operator_model: string | null;
    operator_tool_ids: string[];
    pipeline_ids: string[];
    knowledge_source_ids: string[];
    split_messages: boolean;
    split_max_chars: number;
  };
  const src = source as unknown as SourceRow;

  let createdId: string | null = null;
  let createdNumber: number | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data: maxRow } = await admin
      .from("ai_agent_versions")
      .select("version_number")
      .eq("agent_id", agentId)
      .eq("organization_id", activeOrg.orgId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();
    const nextNumber = (maxRow?.version_number ?? 0) + 1;

    const { data: created, error } = await admin
      .from("ai_agent_versions")
      .insert({
        organization_id: activeOrg.orgId,
        agent_id: agentId,
        version_number: nextNumber,
        system_prompt: src.system_prompt,
        provider: src.provider,
        model: src.model,
        credential_id: src.credential_id,
        tool_ids: src.tool_ids,
        trigger_config: src.trigger_config ?? undefined,
        channel_session_id: src.channel_session_id,
        max_steps: src.max_steps,
        token_budget: src.token_budget,
        cost_budget_cents: src.cost_budget_cents,
        history_message_window: src.history_message_window,
        history_token_window: src.history_token_window,
        handoff_keywords: src.handoff_keywords,
        handoff_tool_enabled: src.handoff_tool_enabled,
        cases_enabled: src.cases_enabled,
        operator_enabled: src.operator_enabled,
        operator_model: src.operator_model,
        operator_tool_ids: src.operator_tool_ids,
        // O revert leva o escopo junto: voltar para uma versão e NÃO voltar a
        // permissão dela seria publicar uma configuração que nunca existiu.
        // Vale igual para o acervo: reverter e o assistente esquecer o material
        // que aquela versão consultava é publicar uma configuração inventada.
        pipeline_ids: src.pipeline_ids,
        knowledge_source_ids: src.knowledge_source_ids ?? [],
        split_messages: src.split_messages,
        split_max_chars: src.split_max_chars,
        status: "draft",
        created_by: authUser.id,
      })
      .select("id, version_number")
      .single();

    if (!error && created) {
      createdId = created.id;
      createdNumber = created.version_number;
      break;
    }
    if (error?.code !== "23505") {
      return { ok: false, error: "internal_error", message: error?.message };
    }
  }
  if (!createdId || createdNumber == null) {
    return { ok: false, error: "internal_error", message: "Conflito de versionamento." };
  }

  const result = await publishAgentVersion(admin, {
    orgId: activeOrg.orgId,
    agentId,
    versionId: createdId,
  });
  if (!result.ok) {
    // Rollback: remove draft órfã para não deixar lixo (a draft só existe
    // como veículo do publish; sem publish, não tem razão de ser).
    await admin
      .from("ai_agent_versions")
      .delete()
      .eq("id", createdId)
      .eq("organization_id", activeOrg.orgId)
      .eq("status", "draft");
    if (PUBLISH_ERROR_CODES.has(result.code as string)) {
      return { ok: false, error: result.code };
    }
    return { ok: false, error: "internal_error" };
  }

  void admin
    .from("event_log")
    .insert({
      organization_id: activeOrg.orgId,
      event_type: "ai_agent.published",
      payload: {
        agent_id: result.agent_id,
        version_id: result.version_id,
        previous_version_id: result.previous_version_id,
        published_at: result.published_at,
      },
    })
    .then(({ error }) => {
      if (error) console.error("[revertToVersionAction/event_log] error", error.message);
    });

  void audit({
    action: "ai_agent.reverted",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "ai_agent",
    resourceId: agentId,
    requestId,
    metadata: {
      from_version_id: versionId,
      new_version_id: createdId,
      new_version_number: createdNumber,
      previous_version_id: result.previous_version_id,
    },
  });

  revalidatePath(`/app/ai/agents/${agentId}`);
  revalidatePath("/app/ai/agents");
  return {
    ok: true,
    data: {
      new_version_id: createdId,
      new_version_number: createdNumber,
      previous_version_id: result.previous_version_id,
    },
  };
}

// ---------------------------------------------------------------------------
// createMcpAgentAction (página /ai/agents/new)
// ---------------------------------------------------------------------------

export async function createMcpAgentAction(
  payload: unknown,
): Promise<ActionResult<{ agent_id: string }>> {
  const guard = await ensureAdmin();
  if (!guard.ok) return guard;
  const { authUser, activeOrg } = guard;

  const parsed = agentMcpCreateSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }

  const requestId = randomUUID();
  const admin = createAdminClient();

  // Cria agent kind='mcp_agent' + v1 draft. Compensa rollback se versão falhar.
  const { data: agentRow, error: agentErr } = await admin
    .from("ai_agents")
    .insert({
      organization_id: activeOrg.orgId,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      model: parsed.data.version.model,
      system_prompt: parsed.data.version.system_prompt,
      kind: "mcp_agent",
      priority: parsed.data.priority,
      is_active: false,
      is_default: false,
      created_by: authUser.id,
    })
    .select("id")
    .single();

  if (agentErr || !agentRow) {
    return { ok: false, error: "internal_error", message: agentErr?.message };
  }

  const v = parsed.data.version;
  const { error: versionErr } = await admin.from("ai_agent_versions").insert({
    organization_id: activeOrg.orgId,
    agent_id: agentRow.id,
    version_number: 1,
    system_prompt: v.system_prompt,
    provider: v.provider,
    model: v.model,
    credential_id: v.credential_id,
    tool_ids: v.tool_ids,
    trigger_config: v.trigger_config ?? undefined,
    channel_session_id: v.channel_session_id,
    max_steps: v.max_steps,
    token_budget: v.token_budget,
    cost_budget_cents: v.cost_budget_cents,
    history_message_window: v.history_message_window,
    history_token_window: v.history_token_window,
    handoff_keywords: v.handoff_keywords,
    handoff_tool_enabled: v.handoff_tool_enabled,
    cases_enabled: v.cases_enabled,
    split_messages: v.split_messages,
    split_max_chars: v.split_max_chars,
    // O corpo ACEITAVA estes cinco e o INSERT os descartava: criar o assistente
    // pela tela com papel Operador, escopo de funil ou material marcado produzia
    // uma versão com tudo no default do banco — desligado e vazio.
    operator_enabled: v.operator_enabled,
    operator_model: v.operator_model,
    operator_tool_ids: v.operator_tool_ids,
    pipeline_ids: v.pipeline_ids,
    knowledge_source_ids: v.knowledge_source_ids,
    status: "draft",
    created_by: authUser.id,
  });

  if (versionErr) {
    // Compensação — archiva o agent recém criado para evitar lixo.
    await admin
      .from("ai_agents")
      .update({ archived_at: new Date().toISOString() })
      .eq("id", agentRow.id)
      .eq("organization_id", activeOrg.orgId);
    return { ok: false, error: "internal_error", message: versionErr.message };
  }

  void audit({
    action: "ai_agent.created",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "ai_agent",
    resourceId: agentRow.id,
    requestId,
    metadata: { kind: "mcp_agent" },
  });

  revalidatePath("/app/ai/agents");
  return { ok: true, data: { agent_id: agentRow.id } };
}
