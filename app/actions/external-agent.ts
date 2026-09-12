"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import {
  EXTERNAL_MCP_REGISTRATION_KEY,
  externalConfigurationSchema,
} from "@/lib/mcp/external-configuration";

const EXTERNAL_PROFILE_NAME = "Agente externo (MCP)";
const EXTERNAL_PROFILE_PROMPT = "Este perfil representa um agente executado fora da plataforma. Configure aqui as instruções, capacidades e memória que desejar manter no CRM.";

async function createExternalProfile(args: { orgId: string; userId: string }) {
  const db = createAdminClient();
  const config = {
    [EXTERNAL_MCP_REGISTRATION_KEY]: {
      state: "registered",
      created_by: "settings_api_tokens",
    },
  };
  const { data: agent, error: agentError } = await db
    .from("ai_agents")
    .insert({
      organization_id: args.orgId,
      name: EXTERNAL_PROFILE_NAME,
      description: "Runtime externo conectado por MCP.",
      model: "external-runtime",
      system_prompt: EXTERNAL_PROFILE_PROMPT,
      kind: "mcp_agent",
      priority: 0,
      is_active: false,
      is_default: false,
      created_by: args.userId,
      config,
    })
    .select("id")
    .single();
  if (agentError || !agent) {
    return { error: agentError?.message ?? "Não foi possível criar o perfil externo." } as const;
  }

  const { error: versionError } = await db.from("ai_agent_versions").insert({
    organization_id: args.orgId,
    agent_id: agent.id,
    version_number: 1,
    system_prompt: EXTERNAL_PROFILE_PROMPT,
    provider: "anthropic",
    model: "external-runtime",
    credential_id: null,
    channel_session_id: null,
    status: "draft",
    created_by: args.userId,
  } as never);
  if (versionError) {
    await db
      .from("ai_agents")
      .delete()
      .eq("id", agent.id)
      .eq("organization_id", args.orgId);
    return { error: versionError.message } as const;
  }
  return { id: agent.id } as const;
}

export async function saveExternalAgentConfiguration(input: unknown) {
  const auth = await requireRole("admin", { resource: "organizations" });
  if (!auth.ok) return { error: "Você precisa administrar esta organização com uma sessão verificada." };
  const parsed = externalConfigurationSchema.safeParse(input);
  if (!parsed.success) return { error: "Selecione uma configuração válida e, quando necessário, um agente publicado." };
  const db = createAdminClient();
  const value = parsed.data;
  if (value.configuration_source === "platform") {
    const { data: agent, error } = await db.from("ai_agents").select("published_version_id").eq("organization_id", auth.org.orgId).eq("id", value.agent_id!).is("archived_at", null).maybeSingle();
    if (error || !agent?.published_version_id) return { error: "O agente precisa estar publicado nesta organização." };
  }
  const { data: org, error: readError } = await db.from("organizations").select("settings").eq("id", auth.org.orgId).single();
  if (readError || !org) return { error: "Não foi possível carregar a organização." };
  const previous = org.settings ?? {};
  const previousExternal = (previous as Record<string, unknown>).external_agent;
  const previousAgentId =
    previousExternal &&
    typeof previousExternal === "object" &&
    typeof (previousExternal as Record<string, unknown>).agent_id === "string"
      ? ((previousExternal as Record<string, unknown>).agent_id as string)
      : null;
  let linkedAgentId = value.configuration_source === "platform" ? value.agent_id! : previousAgentId;
  let createdAgentId: string | null = null;

  // Ao voltar ao modo nativo, o perfil continua disponível para edição e para
  // uma reativação posterior. Apenas uma ativação externa sem perfil cria-o.
  if (value.dispatch_mode === "external" && value.configuration_source === "external" && !linkedAgentId) {
    const created = await createExternalProfile({ orgId: auth.org.orgId, userId: auth.user.id });
    if ("error" in created) return { error: "Não foi possível criar o perfil do agente externo." };
    linkedAgentId = created.id;
    createdAgentId = created.id;
  }
  const settings = {
    ...(previous as Record<string, unknown>),
    ai_dispatch_mode: value.dispatch_mode,
    // `agent_id` é o perfil exibível do runtime externo mesmo quando ele opta
    // por preservar o prompt da VPS. O bearer fica exclusivamente em api_tokens.
    external_agent: {
      configuration_source: value.configuration_source,
      agent_id: linkedAgentId,
    },
  };
  // Compare-and-swap preserva alterações concorrentes de marca/interface e outros campos.
  const query = db.from("organizations").update({ settings: settings as never }).eq("id", auth.org.orgId);
  const { data: updated, error } = await (org.settings === null ? query.is("settings", null) : query.eq("settings", JSON.stringify(previous))).select("id").maybeSingle();
  if (error || !updated) {
    // Quem perder o CAS em outra aba não deixa um perfil MCP órfão.
    if (createdAgentId) await db.from("ai_agents").delete().eq("id", createdAgentId).eq("organization_id", auth.org.orgId);
    return { error: "Não foi possível salvar ou a organização mudou em outra tela. Recarregue e tente novamente." };
  }
  await audit({
    action: "org.updated",
    actorUserId: auth.user.id,
    organizationId: auth.org.orgId,
    resourceType: "organizations",
    resourceId: auth.org.orgId,
    metadata: {
      area: "external_agent",
      dispatch_mode: value.dispatch_mode,
      configuration_source: value.configuration_source,
      agent_id: linkedAgentId,
    },
  });
  revalidatePath("/app/settings/api-tokens");
  revalidatePath("/app/ai/agents");
  return { success: true, agent_id: linkedAgentId };
}
