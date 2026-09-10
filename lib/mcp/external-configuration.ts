import { z } from "zod";

export const externalConfigurationSchema = z.object({
  dispatch_mode: z.enum(["native", "external"]),
  configuration_source: z.enum(["external", "platform"]),
  agent_id: z.string().uuid().nullable(),
}).strict().refine(v => v.configuration_source !== "platform" || !!v.agent_id, { path: ["agent_id"], message: "Selecione um agente publicado." });
export type ExternalConfiguration = z.infer<typeof externalConfigurationSchema>;
export function readExternalConfiguration(settings: unknown): ExternalConfiguration {
  const raw = settings && typeof settings === "object" ? settings as Record<string, unknown> : {};
  const external = raw.external_agent && typeof raw.external_agent === "object" ? raw.external_agent as Record<string, unknown> : {};
  // Estado incompleto nunca devolve o atendimento ao nativo silenciosamente.
  return {
    dispatch_mode: raw.ai_dispatch_mode === "external" ? "external" : "native",
    configuration_source: external.configuration_source === "platform" ? "platform" : "external",
    agent_id: typeof external.agent_id === "string" ? external.agent_id : null,
  };
}
