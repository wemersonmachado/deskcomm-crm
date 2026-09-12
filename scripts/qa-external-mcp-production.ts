import { chromium } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { validateExternalMcpFlow } from "./qa-external-mcp-flow";

async function main() {
  if (process.env.QA_ALLOW_PRODUCTION_FIXTURES !== "1") throw new Error("qa_explicit_opt_in_required");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ locale: "pt-BR" });
    page.setDefaultTimeout(20_000);
    const result = await validateExternalMcpFlow(page, db, "https://xgoos.com.br");
    process.stdout.write(`${JSON.stringify(result)}\nQA_CLEANUP=PASS\n`);
  } finally { await browser.close(); }
}
main().catch(error => {
  // Não imprimir payload, token, URL autenticada ou dados da conta de teste.
  process.stderr.write(`QA_EXTERNAL_MCP=FAIL:${error instanceof Error ? error.name : "unknown"}\n`);
  process.exitCode = 1;
});
