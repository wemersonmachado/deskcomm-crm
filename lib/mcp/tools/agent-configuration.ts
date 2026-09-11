import type { McpToolDefinition } from "../types";
import { readExternalConfiguration } from "../external-configuration";

export const crmGetAgentConfiguration: McpToolDefinition = {
  name: "crm_get_agent_configuration",
  description: "Consulta a origem das instruções do agente externo. Configuração da plataforma retorna somente a versão publicada da organização; nunca credenciais. O cliente deve aplicar o contrato antes de atender e manter as proteções do CRM.",
  inputSchema: {}, category: "read", requiresRole: "agent", requiresScope: "mcp:read",
  handler: async (_input, ctx) => {
    const { data: org, error } = await ctx.supabase.from("organizations").select("settings").eq("id", ctx.organizationId).single();
    if (error || !org) throw new Error("organization_unavailable");
    const configuration = readExternalConfiguration(org.settings);
    if (configuration.configuration_source === "external") return { ...configuration, contract_version: 1, configuration: null, instruction: "Preserve suas instruções externas. As permissões e proteções do CRM continuam obrigatórias." };
    if (!configuration.agent_id) throw new Error("published_configuration_unavailable");
    const { data: agent, error: agentError } = await ctx.supabase.from("ai_agents").select("id, name, published_version_id").eq("organization_id", ctx.organizationId).eq("id", configuration.agent_id).is("archived_at", null).single();
    if (agentError || !agent?.published_version_id) throw new Error("published_configuration_unavailable");
    // Projeção explícita: não exportar config livre, tokens ou credential_id.
    const { data: version, error: versionError } = await ctx.supabase.from("ai_agent_versions").select("id, version_number, system_prompt, tool_ids, knowledge_source_ids, pipeline_ids, handoff_keywords, handoff_tool_enabled, max_steps, token_budget, history_message_window, history_token_window").eq("organization_id", ctx.organizationId).eq("agent_id", agent.id).eq("id", agent.published_version_id).eq("status", "published").single();
    if (versionError || !version) throw new Error("published_configuration_unavailable");
    return { ...configuration, contract_version: 1, agent_name: agent.name, configuration: version, instruction: "Aplique estas instruções no seu runtime. IDs são referências da organização, não arquivos ou credenciais. Ferramentas precisam respeitar os escopos do token e os guards do CRM." };
  },
};
