import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { ApiTokensClient } from "./_components/ApiTokensClient";
import { traduzir } from "@/lib/i18n/dicionario";
import { Card } from "@/components/ui/card";
import { createAdminClient } from "@/lib/supabase/admin";
import { readExternalConfiguration } from "@/lib/mcp/external-configuration";
import { ExternalAgentForm } from "./_components/ExternalAgentForm";

export const dynamic = "force-dynamic";

export default async function ApiTokensPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;
  const db = createAdminClient();
  const [orgResult, agentsResult] = await Promise.all([
    db.from("organizations").select("settings").eq("id", activeOrg.orgId).single(),
    db.from("ai_agents").select("id, name").eq("organization_id", activeOrg.orgId).is("archived_at", null).not("published_version_id", "is", null).order("name"),
  ]);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">API Tokens</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir("Tokens server-to-server. Plaintext exibido", idioma)}{" "}
          <strong>{traduzir("uma única vez", idioma)}</strong>{" "}
          {traduzir("na criação.", idioma)}
        </p>
      </header>
      <Card className="p-4">
        <h2 className="font-medium">{traduzir("Conectar um agente externo por MCP", idioma)}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {traduzir("Use o endereço HTTPS desta instalação seguido de", idioma)}{" "}
          <code>/api/mcp</code>. {traduzir("Crie abaixo um token exclusivo para a organização e selecione somente os escopos necessários. O segredo aparece uma única vez.", idioma)}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {traduzir("Para leitura, habilite mcp:read. Para ações, acrescente mcp:write; use role:manager somente quando o agente realmente precisar criar ou atribuir registros.", idioma)}
        </p>
      </Card>
      <ApiTokensClient />
      {orgResult.data && <ExternalAgentForm initial={readExternalConfiguration(orgResult.data.settings)} agents={agentsResult.data ?? []} />}
    </div>
  );
}
