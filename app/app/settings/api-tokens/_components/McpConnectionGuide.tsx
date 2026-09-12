"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { copyToClipboard } from "@/lib/clipboard";

function CopyButton({ value, label }: { value: string; label: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        if (await copyToClipboard(value)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1800);
        }
      }}
    >
      {copied ? t("Copiado") : label}
    </Button>
  );
}

export function McpConnectionGuide({ endpoint }: { endpoint: string }) {
  const t = useT();
  const config = JSON.stringify(
    {
      mcpServers: {
        xgo: {
          type: "http",
          url: endpoint,
          headers: { Authorization: "Bearer COLE_AQUI_O_TOKEN_DSK" },
        },
      },
    },
    null,
    2,
  );
  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="font-medium">{t("Dados exatos para Hermes ou outro agente externo")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("Esta é uma conexão de programa para programa. Não use")} <code>/app/connections</code>
          , {t("login, senha humana nem URL do Supabase.")}
        </p>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("Endpoint MCP Streamable HTTP")}</p>
        <div className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between">
          <code className="text-sm break-all">{endpoint}</code>
          <CopyButton value={endpoint} label={t("Copiar endpoint")} />
        </div>
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">{t("Autenticação e permissões mínimas")}</p>
        <p className="text-sm text-muted-foreground">
          {t("Envie")} <code>Authorization: Bearer dsk_...</code>{" "}
          {t("em toda chamada. Para consultar a configuração, marque")} <code>mcp:read</code>.{" "}
          {t("Para executar ações, marque também")} <code>mcp:write</code>{" "}
          {t("e somente os escopos específicos usados pelo agente.")}
        </p>
      </div>
      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t("Configuração genérica pronta para copiar")}
        </summary>
        <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 text-xs">{config}</pre>
        <div className="mt-3">
          <CopyButton value={config} label={t("Copiar configuração")} />
        </div>
      </details>
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>{t("Crie um token e copie o segredo exibido uma única vez.")}</li>
        <li>{t("Configure endpoint e header no processo que roda na VPS, worker ou nuvem.")}</li>
        <li>
          {t("Inicialize o cliente MCP e execute")} <code>tools/list</code>.
        </li>
        <li>
          {t("Antes de atender, chame")} <code>crm_get_agent_configuration</code>.
        </li>
        <li>
          {t(
            "Se o agente for o executor externo, ele próprio deve buscar conversas/eventos e chamar as tools; a plataforma não inicia o processo da VPS.",
          )}
        </li>
      </ol>
    </Card>
  );
}
