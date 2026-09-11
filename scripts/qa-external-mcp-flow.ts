import { createHash, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/** Mesma jornada em CI e produção, com organização isolada e sem mensagens. */
export async function validateExternalMcpFlow(page: Page, db: SupabaseClient, baseUrl: string) {
  const host = new URL(baseUrl).hostname;
  if (!["localhost", "127.0.0.1"].includes(host) &&
      !(host === "xgoos.com.br" && process.env.QA_ALLOW_PRODUCTION_FIXTURES === "1")) {
    throw new Error("qa_destination_not_authorized");
  }
  const suffix = randomUUID();
  const email = `qa-mcp-profile-${suffix}@invariant.test`;
  const password = `Qa-${randomUUID()}!9aA`;
  const name = `QA externo ${suffix.slice(0, 8)}`;
  const prompt = "Instruções de teste isolado: apenas consultar e manter os contatos autorizados.";
  const organizationIds: string[] = [];
  let userId = "";
  let client: Client | undefined;
  const checked = (error: { code?: string } | null, step: string) => {
    if (error) throw new Error(`${step}:${error.code ?? "failed"}`);
  };
  try {
    const user = await db.auth.admin.createUser({ email, password, email_confirm: true });
    checked(user.error, "qa_user");
    userId = user.data.user!.id;
    for (let index = 0; index < 2; index++) {
      const org = await db.from("organizations").insert({
        slug: `qa-mcp-profile-${suffix}-${index}`, display_name: `QA MCP ${index}`,
        legal_name: "QA MCP isolada", onboarded_at: new Date().toISOString(),
        locale: "pt-BR", timezone: "America/Sao_Paulo",
      }).select("id").single();
      checked(org.error, "qa_org");
      organizationIds.push(org.data!.id);
    }
    const orgId = organizationIds[0]!;
    checked((await db.from("user_organizations").insert({ user_id: userId,
      organization_id: orgId, role: "admin", accepted_at: new Date().toISOString() })).error, "qa_member");
    await page.goto(`${baseUrl}/login`);
    await page.getByLabel(/^e-?mail$/i).fill(email);
    await page.getByLabel(/^senha$/i).fill(password);
    await page.getByRole("button", { name: /^entrar$/i }).click();
    await page.waitForURL(/\/app(?:\/|$)/);
    await page.goto(`${baseUrl}/app/settings/api-tokens`);
    await page.getByLabel("Responsável pela execução").selectOption("external");
    await page.getByRole("button", { name: "Salvar configuração de integração" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Configuração salva" })).toBeVisible();
    const readProfiles = async () => {
      const result = await db.from("ai_agents").select("id, name, is_active")
        .eq("organization_id", orgId).contains("config", { external_mcp_registration: { state: "registered" } });
      checked(result.error, "qa_profiles");
      return result.data!;
    };
    await expect.poll(async () => (await readProfiles()).length).toBe(1);
    const profileId = (await readProfiles())[0]!.id;
    // Salvar duas vezes não duplica o perfil.
    await page.getByRole("button", { name: "Salvar configuração de integração" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Configuração salva" })).toBeVisible();
    expect((await readProfiles()).length).toBe(1);
    await page.goto(`${baseUrl}/app/ai/agents`);
    await expect(page.getByRole("heading", { name: "Agente externo (MCP)", exact: true })).toBeVisible();
    await expect(page.getByText("Externo via MCP", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Editar", exact: true }).click();
    await page.locator("#name").fill(name);
    // Campo semântico próprio; há outro textarea para a descrição do agente.
    const promptField = page.getByTestId("agent-system-prompt");
    await promptField.fill(prompt);
    await page.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
    await expect.poll(async () => {
      const result = await db.from("ai_agent_versions").select("system_prompt")
        .eq("organization_id", orgId).eq("agent_id", profileId).eq("status", "draft")
        .order("version_number", { ascending: false }).limit(1).single();
      checked(result.error, "qa_draft");
      return result.data!.system_prompt;
    }).toBe(prompt);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator("#name")).toHaveValue(name);
    await expect(promptField).toHaveValue(prompt);
    // Perfil configurado não é prova de runtime online; publicação nativa segue protegida.
    await expect(page.getByRole("button", { name: /^Publicar/ })).toBeDisabled();
    expect((await readProfiles())[0]!.is_active).toBe(false);

    const bearer = `dsk_qa_${randomUUID()}`;
    const token = await db.from("api_tokens").insert({ organization_id: orgId, created_by: userId,
      name: "QA externo descartável", prefix: "dsk_qa",
      token_hash: `\\x${createHash("sha256").update(bearer).digest("hex")}`,
      scopes: ["mcp:read", "mcp:write", "role:manager"],
      expires_at: new Date(Date.now() + 600_000).toISOString(),
    }).select("id").single();
    checked(token.error, "qa_token");
    client = new Client({ name: "qa-external-profile", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(new URL("/api/mcp", baseUrl), {
      requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    }));
    const tools = await client.listTools();
    for (const tool of ["crm_get_agent_configuration", "crm_create_contact", "crm_update_contact", "crm_create_lead"]) {
      expect(tools.tools.some(entry => entry.name === tool), tool).toBe(true);
    }
    const configuration = await client.callTool({ name: "crm_get_agent_configuration", arguments: {} });
    expect(configuration.isError).not.toBe(true);
    const created = await client.callTool({ name: "crm_create_contact", arguments: { name: "QA contato externo", phone_number: "+5511999990000" } });
    expect(created.isError, "criação MCP deve concluir no banco real").not.toBe(true);
    const text = (created.content as { type: string; text?: string }[]).find(item => item.type === "text")!.text!;
    const contactId = JSON.parse(text).contact.id as string;
    expect(text).not.toContain("cpf_hash");
    const contact = await db.from("contacts").select("id, created_by_user_id")
      .eq("organization_id", orgId).eq("id", contactId).single();
    checked(contact.error, "qa_contact");
    expect(contact.data!.created_by_user_id).toBe(userId);
    const updated = await client.callTool({ name: "crm_update_contact", arguments: { contact_id: contactId, display_name: "QA contato atualizado" } });
    expect(updated.isError).not.toBe(true);
    await page.goto(`${baseUrl}/app/contacts`);
    await expect(page.getByText("QA contato atualizado", { exact: true }).first()).toBeVisible();
    const other = await db.from("contacts").insert({ organization_id: organizationIds[1], name: "QA outro tenant" }).select("id").single();
    checked(other.error, "qa_other_contact");
    const denied = await client.callTool({ name: "crm_update_contact", arguments: { contact_id: other.data!.id, name: "Não deve gravar" } });
    expect(denied.isError, "cross-tenant deve recusar").toBe(true);
    checked((await db.from("api_tokens").update({ scopes: ["mcp:read", "role:manager"] })
      .eq("organization_id", orgId).eq("id", token.data!.id)).error, "qa_remove_write");
    const noScope = await client.callTool({ name: "crm_create_contact", arguments: { name: "Não deve criar" } });
    expect(noScope.isError, "sem mcp:write deve recusar").toBe(true);
    await mkdir(".superpowers/evidence/mcp-profile", { recursive: true });
    await page.goto(`${baseUrl}/app/ai/agents`);
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await page.screenshot({ path: ".superpowers/evidence/mcp-profile/externo-visivel.png", fullPage: true });
    return { profile_visible: true, draft_editable: true, contact_create_update: true, tenant_isolation: true, write_scope_enforced: true };
  } finally {
    await client?.close();
    for (const id of organizationIds) checked((await db.from("organizations").delete().eq("id", id).like("slug", `qa-mcp-profile-${suffix}-%`)).error, "qa_cleanup_org");
    if (userId) checked((await db.auth.admin.deleteUser(userId)).error, "qa_cleanup_user");
  }
}
