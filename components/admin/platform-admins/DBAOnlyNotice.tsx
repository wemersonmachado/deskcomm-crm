"use client";
import { Info } from "@/lib/ui/icons";
import { useT } from "@/hooks/i18n/useT";

const SQL_PROMOVER = `insert into platform_admins (user_id, granted_by, scope, mfa_required, reason)
select u.id, u.id, 'full', false, 'motivo da promoção'
from auth.users u where u.email = 'pessoa@empresa.com';`;

const SQL_REVOGAR = `update platform_admins set revoked_at = now()
where user_id = (select id from auth.users where email = 'pessoa@empresa.com');`;

/**
 * Por que esta tela é somente leitura — e como fazer a mudança mesmo assim.
 *
 * ## Os dois defeitos que este componente tinha
 *
 * 1. **O link não ia a lugar nenhum.** Apontava para
 *    `/runbook/platform-admin-management.md`, e esse arquivo não existe no repo
 *    — não há `public/runbook/`, e nenhum arquivo com esse nome em lugar
 *    nenhum. A única saída acionável da tela dava 404. É a falha-em-verde da
 *    doutrina na forma mais pura: a página parece completa, o aviso parece
 *    responsável, e quem seguisse a instrução batia numa parede.
 *
 * 2. **Falava a língua errada.** "Conforme Spec 01 §3.4 T-04" e
 *    `api_audit_log` são vocabulário de quem ESCREVE o produto. Quem lê esta
 *    tela instalou o CRM numa VPS — e, em self-host, essa pessoa É o DBA.
 *    Mandá-la "falar com o DBA" é mandá-la falar consigo mesma, e citar o
 *    número de uma spec que ela não tem acesso não explica nada.
 *
 * ## O que continua igual, e por quê
 *
 * A tela segue sem botão de escrita, e isso é decisão, não pendência.
 * `platform_admins` é a raiz da confiança da instalação inteira: quem está nela
 * atravessa a RLS de todo tenant. Uma sessão roubada com um botão aqui promove
 * o atacante a dono da plataforma com um clique. Exigir `psql` não é burocracia
 * — é exigir uma credencial que o navegador não tem, e que um XSS não alcança.
 *
 * O que muda é que agora a tela ENTREGA o comando em vez de apontar para um
 * documento que não existe. Controle ausente com caminho explicado é honesto;
 * controle ausente com link quebrado é abandono.
 */
export function DBAOnlyNotice() {
  const t = useT();
  return (
    <div
      role="note"
      className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900 dark:border-blue-900/50 dark:bg-blue-950/40 dark:text-blue-100"
    >
      <Info size={20} className="mt-0.5 shrink-0 text-blue-600" aria-hidden />
      <div className="min-w-0 space-y-2">
        <p className="text-sm font-semibold">
          {t("Esta lista é somente leitura — por segurança")}
        </p>
        <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">
          {t(
            "Quem está nesta lista enxerga os dados de todas as organizações da instalação. Por isso promover ou remover alguém não se faz pela tela: exige acesso direto ao banco, que é uma credencial que o navegador não tem — e que um site malicioso não alcança.",
          )}
        </p>
        <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">
          {t("Você tem esse acesso: é a mesma conexão do seu")}{" "}
          <code className="rounded-md bg-blue-100 px-1 font-mono text-xs dark:bg-blue-900/60">
            SUPABASE_DB_URL
          </code>
          {t(". Para promover alguém que já tem conta no sistema:")}
        </p>
        {/*
          `overflow-x-auto` no bloco de código: no celular esta linha é mais
          larga que a tela, e sem o contêiner rolável ela empurraria a página
          inteira para o lado — o defeito que a doutrina de layout chama de
          "o corpo nunca rola na horizontal".
        */}
        <pre className="overflow-x-auto rounded-md bg-blue-100 p-3 text-xs leading-relaxed dark:bg-blue-900/60">
          <code>{SQL_PROMOVER}</code>
        </pre>
        <p className="text-sm leading-relaxed text-blue-800 dark:text-blue-200">
          {t("Para remover, revogue em vez de apagar — o histórico de quem teve o acesso importa:")}
        </p>
        <pre className="overflow-x-auto rounded-md bg-blue-100 p-3 text-xs leading-relaxed dark:bg-blue-900/60">
          <code>{SQL_REVOGAR}</code>
        </pre>
        <p className="text-xs leading-relaxed text-blue-700 dark:text-blue-300">
          {t(
            "Mantenha sempre mais de uma pessoa nesta lista. Com uma só, perder essa conta significa perder a administração da instalação — e a recuperação volta a ser um acesso manual ao banco.",
          )}
        </p>
      </div>
    </div>
  );
}
