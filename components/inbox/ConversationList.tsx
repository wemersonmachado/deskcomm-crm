"use client";
import { useEffect, useMemo, useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import type { InfiniteData, UseInfiniteQueryResult } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useChannelSessions } from "@/hooks/channels/useChannelSessions";

import { useAutomaticoAtivo } from "@/hooks/ai/useAutomaticoAtivo";

import { ConversationListItem } from "./ConversationListItem";
import { EmptyInbox } from "@/components/empty";
import type {
  ConversationsFilters,
  ConversationWithContact,
} from "@/hooks/inbox/useConversationsRealtime";
import { apiClient } from "@/lib/api/client";
import { alertasDeMensagemSilenciados, silenciarAlertasDeMensagem } from "@/lib/notifications/prefs";
import { BellSlash, Trash } from "@/lib/ui/icons";

interface ListResponse {
  data: ConversationWithContact[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

interface Props {
  /** Query já montada no pai — evita duplicar subscription Realtime + refetch. */
  listQuery: UseInfiniteQueryResult<InfiniteData<ListResponse>, Error>;
  filters: ConversationsFilters;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Optional client-side filter (e.g. only-unread). */
  clientFilter?: (c: ConversationWithContact) => boolean;
  /** Notifies parent when the visible list changes (used by keyboard nav). */
  onVisibleChange?: (ids: string[]) => void;
  supportReadonly?: boolean;
}

export function ConversationList({
  listQuery: q,
  filters,
  selectedId,
  onSelect,
  clientFilter,
  onVisibleChange,
  supportReadonly = false,
}: Props) {
  const t = useT();
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => setMuted(alertasDeMensagemSilenciados()), []);
  // Só mostra POR ONDE a conversa entrou quando há mais de um número. Com um
  // só, o rótulo seria a mesma palavra em toda linha — ruído que ensina o olho
  // a ignorar a área onde vivem os avisos que importam.
  //
  // `?? []` e não `undefined`: enquanto a lista de canais carrega, o certo é
  // NÃO mostrar. Mostrar e sumir depois é pior que aparecer um instante tarde.
  const canais = useChannelSessions().data ?? [];
  const maisDeUmCanal = canais.length > 1;

  // Fila (G5-03): a lista já vem ordenada por tempo de espera (server), então a
  // posição é o índice na lista visível. Só mostramos posição/espera nessa visão.
  // A Fila deixou de mandar `assigned_to=unassigned` (agora pede `comando`), e
  // sem esta linha a numeração "1º, 2º…" e o tempo de espera sumiriam da única
  // visão em que servem para alguma coisa — sem erro nenhum, só sumiriam.
  const isQueue =
    filters.comando?.includes("aguardando") ?? filters.assigned_to === "unassigned";
  // Uma leitura por lista, compartilhada por todas as linhas (react-query dedupa
  // com o cabeçalho, que faz a mesma pergunta).
  const automaticoDaOrg = useAutomaticoAtivo();

  const items = useMemo(() => {
    const all: ConversationWithContact[] = q.data?.pages.flatMap((p) => p.data) ?? [];
    return clientFilter ? all.filter(clientFilter) : all;
  }, [q.data, clientFilter]);

  // Notify parent of currently-visible IDs (for j/k nav). Must use effect
  // (not render-time call) — invoking onVisibleChange during render triggers
  // setState in InboxLayout from inside ConversationList's render phase,
  // which React 19 forbids.

  /**
   * O badge de atendente só entra quando DISCRIMINA — mesma regra do badge de
   * canal, e pelo mesmo motivo escrito lá: rótulo que se repete em toda linha
   * ensina o olho a ignorar a área onde vivem os avisos que importam.
   *
   * Medido nas abas: "Fila" pede `comando=aguardando` (nenhuma linha tem dono —
   * a régua põe quem tem dono em `humano`), "Minhas" filtra `assigned_to=me`
   * (todas têm o MESMO) e "Automático" pede `comando=automatico` (também sem
   * dono, pela mesma razão). Sobram "Todas" e "Fechadas" — e mesmo nelas, só
   * vale se a página realmente tiver mais de um dono distinto.
   *
   * O `filters.comando` entrou junto com as abas novas: sem ele, a Fila voltaria
   * a repetir o mesmo selo de atendente em cada uma das linhas.
   */
  const mostrarAtendente = useMemo(() => {
    if (filters.assigned_to) return false;
    if (filters.comando && !filters.comando.includes("humano")) return false;
    const donos = new Set(
      items.map((i) => i.assigned_to_user_id).filter((id): id is string => Boolean(id)),
    );
    return donos.size > 1;
  }, [filters.assigned_to, filters.comando, items]);

  /**
   * O ícone de robô, mesma regra dos dois badges acima: só entra quando
   * DISCRIMINA. A aba "Automático" pede `comando=["automatico"]` — toda linha
   * já é robô, e repetir o ícone em cada uma vira ruído. Nas outras abas a
   * lista é mista (ou pode ser), então o ícone segue dizendo algo.
   */
  const mostrarAutomatico =
    !(filters.comando?.length === 1 && filters.comando[0] === "automatico");

  const visibleContactIds = useMemo(
    () => [...new Set(items.map((item) => item.contact_id).filter((id): id is string => Boolean(id)))],
    [items],
  );

  async function deleteContacts(scope: "selected" | "all") {
    if (supportReadonly || deleting) return;
    const count = scope === "all" ? visibleContactIds.length : selectedContacts.size;
    const warning = scope === "all"
      ? "Excluir TODOS os contatos da organização, conversas e mensagens? Esta ação é permanente."
      : `Excluir definitivamente ${count} contato(s) selecionado(s), suas conversas e mensagens?`;
    if (!window.confirm(warning)) return;
    setDeleting(true);
    try {
      await apiClient.post("/api/v1/contacts/bulk-delete", scope === "all"
        ? { scope: "all", confirmation: "EXCLUIR_TODOS_OS_CONTATOS" }
        : { scope: "selected", contact_ids: [...selectedContacts] });
      setSelectedContacts(new Set());
      setSelectionMode(false);
      await q.refetch();
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (onVisibleChange) onVisibleChange(items.map((i) => i.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  if (q.isLoading) {
    return (
      <div className="space-y-3 p-3">
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  if (q.isError) {
    return (
      <div className="p-4 text-center text-sm text-muted-foreground">
        <p>{t("Erro ao carregar conversas.")}</p>
        <Button
          size="sm"
          variant="outline"
          className="mt-2"
          onClick={() => q.refetch()}
        >
          Tentar novamente
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <EmptyInbox />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {!supportReadonly && (
        <div className="flex flex-wrap items-center gap-2 border-b p-2 text-xs">
          <Button size="sm" variant={muted ? "secondary" : "outline"} onClick={() => { const next = !muted; silenciarAlertasDeMensagem(next); setMuted(next); }}>
            <BellSlash size={14} aria-hidden /> {muted ? t("Alertas silenciados") : t("Silenciar alertas")}
          </Button>
          <Button size="sm" variant="outline" onClick={() => { setSelectionMode((v) => !v); setSelectedContacts(new Set()); }}>
            {selectionMode ? t("Cancelar seleção") : t("Selecionar contatos")}
          </Button>
          {selectionMode && <>
            <label className="flex items-center gap-1"><input type="checkbox" checked={visibleContactIds.length > 0 && selectedContacts.size === visibleContactIds.length} onChange={(e) => setSelectedContacts(e.target.checked ? new Set(visibleContactIds) : new Set())} /> {t("Todos visíveis")}</label>
            <Button size="sm" variant="destructive" disabled={selectedContacts.size === 0 || deleting} onClick={() => void deleteContacts("selected")}><Trash size={14} /> {t("Excluir selecionados")} ({selectedContacts.size})</Button>
            <Button size="sm" variant="destructive" disabled={deleting} onClick={() => void deleteContacts("all")}><Trash size={14} /> {t("Excluir todos")}</Button>
          </>}
        </div>
      )}
      <div className="flex-1 overflow-y-auto">
        {items.map((c, i) => (
          <ConversationListItem
            key={c.id}
            conversation={c}
            isSelected={c.id === selectedId}
            onSelect={onSelect}
            queuePosition={isQueue ? i + 1 : undefined}
            mostrarCanal={maisDeUmCanal}
            mostrarAtendente={mostrarAtendente}
            mostrarAutomatico={mostrarAutomatico}
            automaticoDaOrg={automaticoDaOrg.data}
            selectionMode={selectionMode}
            contactSelected={Boolean(c.contact_id && selectedContacts.has(c.contact_id))}
            onToggleContact={(contactId) => setSelectedContacts((current) => { const next = new Set(current); if (next.has(contactId)) next.delete(contactId); else next.add(contactId); return next; })}
          />
        ))}
        {q.hasNextPage && (
          <div className="flex justify-center p-3">
            <Button
              size="sm"
              variant="outline"
              onClick={() => q.fetchNextPage()}
              disabled={q.isFetchingNextPage}
            >
              {q.isFetchingNextPage ? t("Carregando…") : t("Carregar mais")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
