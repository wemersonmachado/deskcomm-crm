"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { saveExternalAgentConfiguration } from "@/app/actions/external-agent";
import type { ExternalConfiguration } from "@/lib/mcp/external-configuration";

export function ExternalAgentForm({ initial, agents }: { initial: ExternalConfiguration; agents: { id: string; name: string }[] }) {
  const [value, setValue] = useState(initial);
  const [status, setStatus] = useState("");
  const [pending, start] = useTransition();
  return <form className="space-y-4 rounded-lg border p-4" onSubmit={e => { e.preventDefault(); start(async () => { try { const result = await saveExternalAgentConfiguration(value); setStatus(result.error ?? "Configuração salva. O agente externo precisa consultar e aplicar o contrato descrito abaixo."); } catch { setStatus("Falha ao salvar. Tente novamente."); } }); }}>
    <h2 className="font-medium">Quem atende e de onde vêm as instruções</h2>
    <fieldset disabled={pending} className="space-y-4">
      <label className="block text-sm">Responsável pela execução<select className="mt-1 block w-full rounded border bg-background p-2" value={value.dispatch_mode} onChange={e => setValue({ ...value, dispatch_mode: e.target.value as ExternalConfiguration["dispatch_mode"] })}><option value="native">Agentes da plataforma</option><option value="external">Agente externo (VPS, nuvem ou worker)</option></select></label>
      <label className="block text-sm">Configuração oferecida ao agente externo<select className="mt-1 block w-full rounded border bg-background p-2" value={value.configuration_source} onChange={e => setValue({ ...value, configuration_source: e.target.value as ExternalConfiguration["configuration_source"] })}><option value="external">Manter as instruções e fluxos externos existentes</option><option value="platform">Usar a configuração publicada na plataforma</option></select></label>
      {value.configuration_source === "platform" && <label className="block text-sm">Agente de referência<select className="mt-1 block w-full rounded border bg-background p-2" value={value.agent_id ?? ""} onChange={e => setValue({ ...value, agent_id: e.target.value || null })}><option value="">Selecione um agente publicado</option>{agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>{!agents.length && <span>Publique um agente em <Link className="underline" href="/app/ai/agents">Agentes de IA</Link> primeiro.</span>}</label>}
      {value.dispatch_mode === "external" && <p className="rounded border border-amber-500 p-3 text-sm">Ao salvar, o atendimento automático nativo deixa de processar novas mensagens desta organização. Prepare o agente externo antes de ativar. Ele precisa buscar eventos/conversas e executar o atendimento; MCP não inicia nem hospeda seu agente.</p>}
      <p className="text-sm text-muted-foreground">O cliente externo deve chamar <code>crm_get_agent_configuration</code> com <code>mcp:read</code> antes de atender. No modo plataforma, recebe instruções, ferramentas e referências da versão publicada, sem credenciais. Ele deve interpretar esse contrato; a plataforma não altera automaticamente o código da sua VPS. Permissões, limites e proteções de envio continuam obrigatórios.</p>
      <button className="rounded bg-primary px-4 py-2 text-primary-foreground" disabled={pending}>{pending ? "Salvando…" : "Salvar configuração de integração"}</button>
    </fieldset><p role="status" className="text-sm">{status}</p>
  </form>;
}
