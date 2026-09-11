import { randomUUID, createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";

import { chromium, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Opt-in obrigatório: cria e remove fixtures reais, salva o editor sem mudar o conteúdo.
if (process.env.QA_ALLOW_PRODUCTION_FIXTURES !== "1") throw new Error("qa_explicit_opt_in_required");
if (!url || !serviceRole) throw new Error("supabase_env_missing");

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const suffix = randomUUID();
const email = `prova-rascunho-${suffix}@invariant.test`;
const password = `Prova-${randomUUID()}!Aa9`;
const nome = `Rascunho E2E ${suffix.slice(0, 8)}`;
let userId = "";
let organizationId = "";
let secondOrganizationId = "";

async function main() {
  const user = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (user.error || !user.data.user) throw user.error ?? new Error("user_create_failed");
  userId = user.data.user.id;

  const organization = await admin
    .from("organizations")
    .insert({
      slug: `prova-rascunho-${suffix}`,
      display_name: "Prova isolada de rascunho",
      legal_name: "Prova isolada de rascunho",
      locale: "pt-BR",
      timezone: "America/Sao_Paulo",
      onboarded_at: new Date().toISOString(),
    })
    .select("id")
    .single<{ id: string }>();
  if (organization.error || !organization.data) {
    throw organization.error ?? new Error("organization_create_failed");
  }
  organizationId = organization.data.id;

  const membership = await admin.from("user_organizations").insert({
    user_id: userId,
    organization_id: organizationId,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  if (membership.error) throw membership.error;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ locale: "pt-BR" });
  page.setDefaultTimeout(30_000);
  try {
    await page.goto("https://xgoos.com.br/login");
    await page.getByLabel(/e-?mail/i).fill(email);
    await page.getByLabel(/senha/i).fill(password);
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.waitForURL(/\/app(?:\/|$)/, { timeout: 60_000 });

    await page.goto("https://xgoos.com.br/app/ai/agents/new");
    await page.getByRole("heading", { name: /novo agent/i }).waitFor();
    const concluir = page.getByRole("button", { name: /concluir configura/i });
    if (!(await concluir.isDisabled())) throw new Error("completion_should_start_disabled");
    await page.getByText(/escolha o modelo/i).first().waitFor();
    await page.getByText(/escolha a chave de acesso/i).first().waitFor();
    await page.getByText(/escolha por qual número de whatsapp/i).first().waitFor();

    await page.locator("#name").fill(nome);
    // "Salvando" pode desaparecer antes do polling do browser. Provar o dado
    // durável evita tanto esse falso negativo quanto aceitar o "salvo" anterior.
    await expect.poll(async () => {
      const saved = await admin.from("ai_agents").select("id").eq("organization_id", organizationId).eq("name", nome);
      if (saved.error) throw new Error(`qa_draft_read:${saved.error.code}`);
      return saved.data.length;
    }, { timeout: 30_000 }).toBe(1);
    await page.getByText(/rascunho salvo/i).first().waitFor({ timeout: 20_000 });
    await page.goto("https://xgoos.com.br/app/ai/agents");
    await page.getByText(nome).filter({ visible: true }).first().waitFor({ timeout: 20_000 });
    await page.getByText(/configuração incompleta/i).filter({ visible: true }).first().waitFor();
    await page.goto("https://xgoos.com.br/app/ai/agents/new");
    if ((await page.locator("#name").inputValue()) !== nome) {
      throw new Error("draft_was_not_restored");
    }
    await mkdir("evidence/producao", { recursive: true });
    await page.screenshot({ path: "evidence/producao/agente-rascunho-persistente.png", fullPage: true });
    process.stdout.write("PRODUCTION_AGENT_DRAFT_E2E=PASS\n");
    await page.goto("https://xgoos.com.br/app/settings/api-tokens");
    await page.getByLabel("Responsável pela execução").selectOption("external");
    await page.getByRole("button", { name: "Salvar configuração de integração" }).click();
    await page.getByRole("status").filter({ hasText: "Configuração salva" }).waitFor();
    await page.reload();
    if (await page.getByLabel("Responsável pela execução").inputValue() !== "external") throw new Error("external_setting_not_persisted");
    const bearer = `dsk_qa_${randomUUID()}`;
    const { error: tokenError } = await admin.from("api_tokens").insert({ organization_id: organizationId, created_by: userId, name: "QA isolada", prefix: "dsk_qa", token_hash: `\\x${createHash("sha256").update(bearer).digest("hex")}`, scopes: ["mcp:read"], expires_at: new Date(Date.now() + 600000).toISOString() });
    if (tokenError) throw new Error("qa_token_seed_failed");
    const client = new Client({ name: "qa-config", version: "1.0" });
    try {
      await client.connect(new StreamableHTTPClientTransport(new URL("https://xgoos.com.br/api/mcp"), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
      const result = await client.callTool({ name: "crm_get_agent_configuration", arguments: {} });
      if (result.isError || !JSON.stringify(result).includes('external')) throw new Error("mcp_configuration_read_failed");
      process.stdout.write("PRODUCTION_MCP_CONFIGURATION=PASS\n");
    } finally { await client.close(); }
    await page.getByLabel("Configuração oferecida ao agente externo").selectOption("platform");
    await page.getByRole("button", { name: "Salvar configuração de integração" }).click();
    await page.getByRole("status").filter({ hasText: "Selecione uma configuração válida" }).waitFor();
    // Fixtures inertes: sem número, credencial de LLM ou tráfego externo.
    const second = await admin.from("organizations").insert({ slug: `qa-isolation-${suffix}`, display_name: "QA isolamento", legal_name: "QA isolamento" }).select("id").single();
    if (second.error) throw new Error(`qa_second_org:${second.error.code}`);
    secondOrganizationId = second.data.id;
    const agent = await admin.from("ai_agents").insert({ organization_id: organizationId, name: "QA contrato publicado", system_prompt: "QA", is_active: false }).select("id").single();
    if (agent.error) throw new Error(`qa_agent:${agent.error.code}`);
    const channel = await admin.from("channel_sessions").insert({ organization_id: organizationId, waha_session_name: `qa-${suffix}`, status: "STOPPED", webhook_secret_encrypted: "\\x00" }).select("id").single();
    if (channel.error) throw new Error(`qa_channel:${channel.error.code}`);
    const prompt = `Contrato isolado ${suffix}`;
    const version = await admin.from("ai_agent_versions").insert({ organization_id: organizationId, agent_id: agent.data.id, version_number: 1, system_prompt: prompt, provider: "openai", model: "gpt-4o-mini", channel_session_id: channel.data.id, status: "published", published_at: new Date().toISOString() }).select("id").single();
    if (version.error) throw new Error(`qa_version:${version.error.code}`);
    const published = await admin.from("ai_agents").update({ published_version_id: version.data.id }).eq("id", agent.data.id).eq("organization_id", organizationId);
    if (published.error) throw new Error(`qa_reference:${published.error.code}`);
    await page.reload();
    await page.getByLabel("Configuração oferecida ao agente externo").selectOption("platform");
    await page.getByLabel("Agente de referência").selectOption(agent.data.id);
    await page.getByRole("button", { name: "Salvar configuração de integração" }).click();
    await page.getByRole("status").filter({ hasText: "Configuração salva" }).waitFor();
    const platformClient = new Client({ name: "qa-platform-config", version: "1.0" });
    try {
      await platformClient.connect(new StreamableHTTPClientTransport(new URL("https://xgoos.com.br/api/mcp"), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
      const result = await platformClient.callTool({ name: "crm_get_agent_configuration", arguments: {} });
      const body = JSON.stringify(result);
      if (result.isError || !body.includes(prompt) || body.includes("credential_id")) throw new Error("published_contract_failed");
      process.stdout.write("PRODUCTION_MCP_PUBLISHED_CONFIGURATION=PASS\n");
      const foreign = await admin.from("ai_agents").insert({ organization_id: secondOrganizationId, name: "QA estrangeiro", system_prompt: "NAO_VAZAR", is_active: false }).select("id").single();
      if (foreign.error) throw new Error(`qa_foreign:${foreign.error.code}`);
      const foreignChannel = await admin.from("channel_sessions").insert({ organization_id: secondOrganizationId, waha_session_name: `qa-foreign-${suffix}`, status: "STOPPED", webhook_secret_encrypted: "\\x00" }).select("id").single();
      if (foreignChannel.error) throw new Error(`qa_foreign_channel:${foreignChannel.error.code}`);
      const foreignVersion = await admin.from("ai_agent_versions").insert({ organization_id: secondOrganizationId, agent_id: foreign.data.id, version_number: 1, system_prompt: "NAO_VAZAR", provider: "openai", model: "gpt-4o-mini", channel_session_id: foreignChannel.data.id, status: "published", published_at: new Date().toISOString() }).select("id").single();
      if (foreignVersion.error) throw new Error(`qa_foreign_version:${foreignVersion.error.code}`);
      const foreignPublished = await admin.from("ai_agents").update({ published_version_id: foreignVersion.data.id }).eq("id", foreign.data.id).eq("organization_id", secondOrganizationId);
      if (foreignPublished.error) throw new Error(`qa_foreign_reference:${foreignPublished.error.code}`);
      const poison = await admin.from("organizations").update({ settings: { ai_dispatch_mode: "external", external_agent: { configuration_source: "platform", agent_id: foreign.data.id } } }).eq("id", organizationId);
      if (poison.error) throw new Error(`qa_isolation_setup:${poison.error.code}`);
      const denied = await platformClient.callTool({ name: "crm_get_agent_configuration", arguments: {} });
      if (!denied.isError || JSON.stringify(denied).includes("NAO_VAZAR")) throw new Error("cross_tenant_contract_not_denied");
      process.stdout.write("PRODUCTION_MCP_CROSS_TENANT_DENIED=PASS\n");
    } finally { await platformClient.close(); }
    await page.screenshot({ path: "evidence/producao/mcp-configuracao.png", fullPage: true });
    await page.goto("https://xgoos.com.br/app/settings/landing-page");
    await page.waitForURL(/forbidden|403/);
    process.stdout.write("PRODUCTION_LANDING_TENANT_DENIED=PASS\n");
    const { error: grantError } = await admin.from("platform_admins").insert({ user_id: userId, granted_by: userId, scope: "full", mfa_required: false, reason: "QA temporária de edição da landing" });
    if (grantError) throw new Error("qa_platform_fixture_failed");
    await page.goto("https://xgoos.com.br/app/settings/landing-page");
    await page.getByRole("heading", { name: "Página de apresentação" }).waitFor();
    await page.getByRole("button", { name: "Salvar e publicar" }).click();
    await page.getByRole("status").filter({ hasText: "Página publicada" }).waitFor();
    await page.screenshot({ path: "evidence/producao/landing-editor.png", fullPage: true });
    process.stdout.write("PRODUCTION_LANDING_EDITOR_SAVE=PASS\n");
  } catch (error) {
    await mkdir("evidence/producao", { recursive: true });
    await page.screenshot({ path: "evidence/producao/rascunho-diagnostico.png", fullPage: true });
    process.stdout.write((await page.locator("body").innerText()).slice(-3500));
    throw error;
  } finally {
    await browser.close();
  }
}

main()
  .finally(async () => {
    if (userId) { const { error } = await admin.from("platform_admins").delete().eq("user_id", userId); if (error) throw new Error("qa_platform_cleanup_failed"); }
    if (organizationId) { const { error } = await admin.from("organizations").delete().eq("id", organizationId); if (error) throw new Error("qa_org_cleanup_failed"); }
    if (secondOrganizationId) { const { error } = await admin.from("organizations").delete().eq("id", secondOrganizationId); if (error) throw new Error("qa_second_org_cleanup_failed"); }
    if (userId) { const { error } = await admin.auth.admin.deleteUser(userId); if (error) throw new Error("qa_user_cleanup_failed"); }
    process.stdout.write("QA_CLEANUP=PASS\n");
  })
  .catch((error) => {
    process.stderr.write(`PRODUCTION_AGENT_DRAFT_E2E=FAIL:${String(error)}\n`);
    process.exitCode = 1;
  });
