import { test } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { validateExternalMcpFlow } from "../../scripts/qa-external-mcp-flow";

test("perfil MCP aparece, permite edição e escreve contatos com isolamento", async ({ page, baseURL }) => {
  test.setTimeout(120_000);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  if (!["localhost", "127.0.0.1"].includes(new URL(url).hostname)) throw new Error("local_database_required");
  const db = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  await validateExternalMcpFlow(page, db, baseURL!);
});
