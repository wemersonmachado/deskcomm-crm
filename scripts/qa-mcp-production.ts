import { createHash, randomUUID } from "node:crypto";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { createClient } from "@supabase/supabase-js";

if (process.env.QA_ALLOW_PRODUCTION_FIXTURES !== "1") {
  throw new Error("qa_explicit_opt_in_required");
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const appUrl = process.env.NEXT_PUBLIC_APP_URL;
if (!supabaseUrl || !serviceRole || !appUrl) throw new Error("qa_env_missing");

const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } });
const suffix = randomUUID();
const endpoint = new URL("/api/mcp", appUrl);
const bearer = `dsk_qa_${randomUUID()}`;
let organizationId = "";
let userId = "";

async function connect() {
  const client = new Client({ name: "qa-mcp-production", version: "1.0.0" });
  await client.connect(
    new StreamableHTTPClientTransport(endpoint, {
      requestInit: { headers: { Authorization: `Bearer ${bearer}` } },
    }),
  );
  return client;
}

async function main() {
  const user = await db.auth.admin.createUser({
    email: `qa-mcp-${suffix}@invariant.test`,
    password: `Qa-${randomUUID()}!9aA`,
    email_confirm: true,
  });
  if (user.error || !user.data.user) throw user.error ?? new Error("qa_user_create_failed");
  userId = user.data.user.id;

  const organization = await db
    .from("organizations")
    .insert({
      slug: `qa-mcp-${suffix}`,
      display_name: "QA MCP isolada",
      legal_name: "QA MCP isolada",
      settings: {
        ai_dispatch_mode: "external",
        external_agent: { configuration_source: "external" },
      },
    })
    .select("id")
    .single<{ id: string }>();
  if (organization.error || !organization.data) {
    throw organization.error ?? new Error("qa_org_create_failed");
  }
  organizationId = organization.data.id;

  const membership = await db.from("user_organizations").insert({
    user_id: userId,
    organization_id: organizationId,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  if (membership.error) throw membership.error;

  const token = await db.from("api_tokens").insert({
    organization_id: organizationId,
    created_by: userId,
    name: "QA MCP descartável",
    prefix: "dsk_qa",
    token_hash: `\\x${createHash("sha256").update(bearer).digest("hex")}`,
    scopes: ["mcp:read"],
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });
  if (token.error) throw token.error;

  const client = await connect();
  try {
    const tools = await client.listTools();
    if (!tools.tools.some((tool) => tool.name === "crm_get_agent_configuration")) {
      throw new Error("configuration_tool_missing");
    }
    const result = await client.callTool({
      name: "crm_get_agent_configuration",
      arguments: {},
    });
    if (result.isError || !JSON.stringify(result).includes("external")) {
      throw new Error("configuration_call_failed");
    }
  } finally {
    await client.close();
  }

  const revoked = await db
    .from("api_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("organization_id", organizationId)
    .eq("prefix", "dsk_qa");
  if (revoked.error) throw revoked.error;

  let rejected = false;
  try {
    const revokedClient = await connect();
    await revokedClient.close();
  } catch {
    rejected = true;
  }
  if (!rejected) throw new Error("revoked_token_was_accepted");

  process.stdout.write(`PRODUCTION_MCP_ENDPOINT=${endpoint.origin}/api/mcp\n`);
  process.stdout.write("PRODUCTION_MCP_TOOLS_LIST=PASS\n");
  process.stdout.write("PRODUCTION_MCP_CONFIGURATION=PASS\n");
  process.stdout.write("PRODUCTION_MCP_REVOCATION=PASS\n");
}

main()
  .finally(async () => {
    if (organizationId) {
      const cleanup = await db.from("organizations").delete().eq("id", organizationId);
      if (cleanup.error) throw new Error("qa_org_cleanup_failed");
    }
    if (userId) {
      const cleanup = await db.auth.admin.deleteUser(userId);
      if (cleanup.error) throw new Error("qa_user_cleanup_failed");
    }
    process.stdout.write("QA_CLEANUP=PASS\n");
  })
  .catch((error) => {
    process.stderr.write(`PRODUCTION_MCP_E2E=FAIL:${String(error)}\n`);
    process.exitCode = 1;
  });
