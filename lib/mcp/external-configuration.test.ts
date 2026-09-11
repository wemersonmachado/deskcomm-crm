import { describe, expect, it, vi } from "vitest";
import { readExternalConfiguration, externalConfigurationSchema } from "./external-configuration";
import { crmGetAgentConfiguration } from "./tools/agent-configuration";
import type { McpContext } from "./types";
function context(results: unknown[]) {
  const chain = { select: vi.fn(), eq: vi.fn(), is: vi.fn(), single: vi.fn() };
  chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.is.mockReturnValue(chain);
  for (const data of results) chain.single.mockResolvedValueOnce({ data, error: null });
  return { chain, ctx: { organizationId: "org-a", supabase: { from: vi.fn(() => chain) } } as unknown as McpContext };
}
describe("contrato de configuração externa", () => {
  it("preserva external mesmo com configuração incompleta", () => {
    expect(readExternalConfiguration({ ai_dispatch_mode: "external", external_agent: { configuration_source: "platform" } })).toEqual({ dispatch_mode: "external", configuration_source: "platform", agent_id: null });
  });
  it("exige referência para plataforma e recusa campos extras", () => {
    expect(externalConfigurationSchema.safeParse({ dispatch_mode: "external", configuration_source: "platform", agent_id: null }).success).toBe(false);
    expect(externalConfigurationSchema.safeParse({ dispatch_mode: "external", configuration_source: "external", agent_id: null, organization_id: "outro" }).success).toBe(false);
  });
  it("não exporta instruções quando o dono escolheu preservar o externo", async () => {
    const { ctx } = context([{ settings: { ai_dispatch_mode: "external" } }]);
    const result = await crmGetAgentConfiguration.handler({}, ctx) as Record<string, unknown>;
    expect(result.configuration).toBeNull();
  });
  it("cerca agente e versão na organização e usa projeção sem credenciais", async () => {
    const { ctx, chain } = context([{ settings: { external_agent: { configuration_source: "platform", agent_id: "agent-a" } } }, { id: "agent-a", name: "Assistente", published_version_id: "v1" }, { id: "v1", system_prompt: "Instrução publicada" }]);
    await crmGetAgentConfiguration.handler({}, ctx);
    expect(chain.eq).toHaveBeenCalledWith("id", "org-a");
    expect(chain.eq.mock.calls.filter(c => c[0] === "organization_id")).toEqual([["organization_id", "org-a"], ["organization_id", "org-a"]]);
    expect(chain.eq).toHaveBeenCalledWith("status", "published");
    expect(chain.select.mock.calls.flat().join(" ")).not.toContain("credential_id");
  });
  it("falha fechada se referência foi arquivada ou removida", async () => {
    const { ctx } = context([{ settings: { external_agent: { configuration_source: "platform", agent_id: "agent-a" } } }, null]);
    await expect(crmGetAgentConfiguration.handler({}, ctx)).rejects.toThrow("published_configuration_unavailable");
  });
});
