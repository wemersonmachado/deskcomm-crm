"use server";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth/require-role";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { externalConfigurationSchema } from "@/lib/mcp/external-configuration";

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
  const settings = { ...(previous as Record<string, unknown>), ai_dispatch_mode: value.dispatch_mode, external_agent: { configuration_source: value.configuration_source, agent_id: value.configuration_source === "platform" ? value.agent_id : null } };
  // Compare-and-swap preserva alterações concorrentes de marca/interface e outros campos.
  const query = db.from("organizations").update({ settings: settings as never }).eq("id", auth.org.orgId);
  const { data: updated, error } = await (org.settings === null ? query.is("settings", null) : query.eq("settings", JSON.stringify(previous))).select("id").maybeSingle();
  if (error || !updated) return { error: "Não foi possível salvar ou a organização mudou em outra tela. Recarregue e tente novamente." };
  await audit({ action: "org.updated", actorUserId: auth.user.id, organizationId: auth.org.orgId, resourceType: "organizations", resourceId: auth.org.orgId, metadata: { area: "external_agent", ...value } });
  revalidatePath("/app/settings/api-tokens");
  return { success: true };
}
