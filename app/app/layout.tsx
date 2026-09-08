import { InterfaceRefresh } from "@/hooks/auth/InterfaceRefresh";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { isMfaEnrolled, loadAuthUser, requiresMfa, resolveActiveOrg } from "@/lib/auth/server";
import { decidirAcessoSuspenso } from "@/lib/auth/suspensao";
import { DEFAULT_VISIBILITY_MODE, type VisibilityMode } from "@/lib/auth/types";
import { AuthProvider } from "@/hooks/auth/AuthProvider";
import { AppShell } from "./_components/AppShell";
import { EstiloDaMarcaDaOrganizacao } from "./_components/EstiloDaMarcaDaOrganizacao";
import { MfaEnrollGate } from "@/components/auth/MfaEnrollGate";
import { cssDaMarca, ESCOPO_DA_ORGANIZACAO } from "@/lib/branding/css";
import { marcaDaInstalacao } from "@/lib/branding/instalacao";
import { resolverMarcaDaOrganizacao } from "@/lib/branding/organizacao";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ImpersonateBanner,
} from "@/components/app/ImpersonateBanner";
import { ConexaoCaidaBanner } from "@/components/app/ConexaoCaidaBanner";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";
import { listarConexoesCaidas, type ConexaoCaida } from "@/lib/channels/health";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await loadAuthUser();
  if (!user) redirect("/login");

  let activeOrg = await resolveActiveOrg(user);

  /**
   * A cor desta organização, serializada, ou `null` quando ela não tem uma.
   *
   * Resolvida no MESMO `settings` que o gate de onboarding logo abaixo já lê —
   * zero consulta nova. A ordem das camadas (organização acima, instalação no
   * meio, arquivo de instalação embaixo) mora em `lib/branding/organizacao.ts`,
   * e não aqui: a precedência é regra do produto, não detalhe deste layout.
   */
  let cssDaOrganizacao: string | null = null;

  // EPIC-02: gate /app/* on completed onboarding.
  // EPIC-11: gate /app/* on org not being suspended (S-11.08).
  if (activeOrg) {
    const admin = createAdminClient();
    const { data: orgRow } = await admin
      .from("organizations")
      .select("onboarded_at, status, settings")
      .eq("id", activeOrg.orgId)
      .maybeSingle();
    if (orgRow && !orgRow.onboarded_at && !user.support) redirect("/onboarding");
    /**
     * Suspensão NÃO tranca quem tem saída — ver `lib/auth/suspensao.ts` para o
     * incidente que originou isto (dono da instalação perdeu o produto inteiro
     * ao suspender o segundo tenant dele).
     *
     * A segunda consulta só acontece quando a organização ativa está suspensa:
     * no caminho normal — todo render de todo tenant saudável — este bloco custa
     * exatamente o que custava antes, que é nada.
     *
     * Acompanhamento de suporte é exceção e continua caindo direto na tela: a
     * organização dele vem da sessão de impersonate, não do cookie, então
     * "trocar" não é uma saída que exista aqui.
     */
    if (orgRow?.status === "suspended") {
      if (user.support) redirect("/account-suspended");

      const idsDoUsuario = user.organizations.map((o) => o.organization_id);
      const { data: statusRows } = await admin
        .from("organizations")
        .select("id, status")
        .in("id", idsDoUsuario);

      // Ordem preservada: `decidirAcessoSuspenso` escolhe a PRIMEIRA saída, e a
      // ordem que vale é a de `user.organizations` (`accepted_at`, depois id) —
      // a mesma que decide a organização padrão. O `.in()` do PostgREST não
      // promete ordem nenhuma, então reordenar aqui não é preciosismo: sem isto,
      // para quem tem três empresas, a organização de destino mudaria entre uma
      // recuperação e outra sem nada ter mudado.
      const porId = new Map((statusRows ?? []).map((r) => [r.id, r.status]));
      const decisao = decidirAcessoSuspenso(
        activeOrg.orgId,
        user.organizations.map((o) => ({
          organization_id: o.organization_id,
          status: porId.get(o.organization_id),
        })),
        user.is_platform_admin,
      );

      if (decisao.acao === "trocar") {
        redirect(`/trocar-organizacao?org=${decisao.orgId}&next=%2Fapp`);
      }
      if (decisao.acao === "painel_plataforma") redirect("/admin");
      if (decisao.acao === "bloquear") redirect("/account-suspended");
    }
    // G4-02: expõe visibility_mode ao client (inbox decide visões visíveis).
    // Fonte confiável (admin client, org do cookie validado) — nunca do body.
    const mode = (orgRow?.settings as { visibility_mode?: VisibilityMode } | null)
      ?.visibility_mode;
    activeOrg = { ...activeOrg, visibility_mode: mode ?? DEFAULT_VISIBILITY_MODE };

    // `marcaDaInstalacao()` é memoizada por TTL no PROCESSO (`lib/branding/
    // instalacao.ts`), e a derivação da cor é cacheada por régua+semente em
    // `resolve.ts` — a marca custa uma consulta a cada 30s e um lookup de Map
    // por render, não uma derivação de rampa por requisição.
    const marca = resolverMarcaDaOrganizacao(
      orgRow?.settings ?? null,
      await marcaDaInstalacao(),
      env,
    );

    // SÓ quando a cor veio mesmo da organização. Se ela não configurou nada, a
    // resolução devolve a cor da instalação — e reemiti-la aqui, escopada no
    // `<body>`, seria repetir no documento um bloco que já vale pela raiz. Além
    // de bytes, custaria a única pergunta que a presença do bloco responde.
    if (marca.origens.cor === "organizacao") {
      // Os `motivos` de uma cor recusada NÃO são registrados aqui de propósito:
      // este caminho roda para todo tenant a cada render, e um aviso por
      // organização no log da instalação é como um alarme deixa de ser lido. O
      // laço de retorno desta feature é a tela `/app/settings/marca`, que mostra
      // os motivos para quem pode consertá-los — o admin daquela organização.
      cssDaOrganizacao = cssDaMarca(marca.cor, ESCOPO_DA_ORGANIZACAO).css;
    }

    // Desce para o menu CAMPO A CAMPO, e só o campo que a organização definiu.
    // Sem a condição por campo, `marca.name` seria o nome da instalação (ou o
    // padrão do produto) e o menu passaria a ler um caminho novo para exibir
    // exatamente o que já exibia — trocando a fonte sem trocar o valor, que é
    // como se cria uma regressão invisível. E, com o logo no mesmo objeto, uma
    // condição só (a do nome) faria a organização que definiu apenas a cor
    // arrastar junto um `logoUrl` que ela não escolheu.
    //
    // `origens` é a resposta de `primeiroDefinido` (`lib/branding/resolve.ts`),
    // que ignora valor vazio e desce: quando ele diz "organizacao", o valor é
    // não-vazio e já veio trimado — por isso a barra lateral nunca recebe `""`
    // desta origem.
    //
    // `origens.logoUrl === "organizacao"` passou a ser ALCANÇÁVEL na onda do
    // upload: `camadaDaOrganizacao` declara o logo a partir de
    // `settings.branding.logo_path`. A condição foi escrita aqui uma onda ANTES
    // do produtor existir, de propósito — foi o que fez o upload por organização
    // ser só a camada, sem mais uma passada pela casca inteira.
    const marcaDoTenant = {
      ...(marca.origens.nome === "organizacao" ? { nome: marca.name } : {}),
      ...(marca.origens.logoUrl === "organizacao" && marca.logoUrl !== null
        ? { logoUrl: marca.logoUrl }
        : {}),
    };
    if (Object.keys(marcaDoTenant).length > 0) {
      activeOrg = { ...activeOrg, marca: marcaDoTenant };
    }
  }

  // A conexão caiu? A consulta mora no seam (`lib/channels/health`), não aqui:
  // tela que monta o select de `channel_sessions` à mão foi o que deixou três
  // seletores oferecendo canal arquivado, e o invariante `canais-selecionaveis`
  // existe por causa disso. De quebra, o filtro de estados fica LITERALMENTE o
  // mesmo que decide o aviso da Central — duas listas divergiriam com o tempo.
  const conexoesCaidas: ConexaoCaida[] = activeOrg
    ? await listarConexoesCaidas(createAdminClient(), activeOrg.orgId)
    : [];

  // Read sidebar collapsed state SSR to avoid flash.
  const store = await cookies();
  const collapsed = store.get("sidebar_collapsed")?.value === "1";

  const impersonating = user.support ? {
    tenantId: user.support.organization_id, tenantName: user.support.name,
    expiresAt: user.support.expires_at, accessMode: user.support.access_mode,
  } : null;

  const enrolled = await isMfaEnrolled();
  // A decisão deixou de ser uma constante de papel: ela lê a política de quem
  // pode exigir (a plataforma e a empresa). Ver `lib/auth/politica-mfa.ts`.
  const needsMfaGate = await requiresMfa(
    activeOrg?.role,
    user.is_platform_admin,
    user.id,
    activeOrg?.orgId,
  );
  const shell = <AppShell sidebarCollapsed={collapsed}>{children}</AppShell>;

  return (
    // O idioma envolve a árvore inteira e recebe o código PRONTO — ele não
    // pergunta quem está logado. Ver `lib/i18n/IdiomaProvider`: foi o
    // acoplamento com a autenticação que derrubou 32 casos.
    <IdiomaProvider locale={user.idioma}>
    <AuthProvider user={user} activeOrg={activeOrg}>
      <InterfaceRefresh userId={user.id} org={activeOrg} support={!!user.support} />
      {/*
        O MARCADOR da marca da organização — o elemento cuja existência define o
        escopo `body:has([data-marca-org])` (lib/branding/css.ts).

        `contents` não gera caixa: no box tree os filhos continuam sendo filhos
        diretos do `<body>`, então nada de layout, `position` ou `flex` muda. O
        que este elemento existe para fazer é EXISTIR — e sumir junto com esta
        subárvore quando o logout navega para `/login`.

        Envolve TUDO, e não a div do `AppShell`, porque aquela div é irmã dos dois
        banners e é SUBSTITUÍDA quando o `MfaEnrollGate` bloqueia (ele renderiza
        um `fixed inset-0` no lugar dos children). O admin de tenant recém-criado
        veria a tela de cadastro de MFA — a PRIMEIRA tela dele — com a cor da
        instalação, e depois o resto do produto com a dele.
      */}
      <div data-marca-org="" className="contents">
        <EstiloDaMarcaDaOrganizacao css={cssDaOrganizacao} />
        <ImpersonateBanner impersonating={impersonating} />
        <ConexaoCaidaBanner caidas={conexoesCaidas} />
        {needsMfaGate ? (
          // Gate always mounted for MFA-required roles; it latches the blocking
          // decision client-side so the enroll Server Action's revalidation
          // can't tear down the recovery-codes screen mid-flow.
          <MfaEnrollGate enrolled={enrolled}>{shell}</MfaEnrollGate>
        ) : (
          shell
        )}
      </div>
    </AuthProvider>
    </IdiomaProvider>
  );
}
