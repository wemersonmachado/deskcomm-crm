/**
 * O que fazer quando a organização ATIVA está suspensa.
 *
 * ## Por que esta regra existe (o incidente que a criou)
 *
 * `app/app/layout.tsx` tinha uma linha só:
 *
 *     if (orgRow?.status === "suspended") redirect("/account-suspended");
 *
 * Ela é correta para o caso que a Spec 11 §S-11.08 tinha em mente — o cliente
 * final de um revendedor, que pertence a UMA organização e não deve entrar
 * enquanto ela estiver suspensa. E é uma ARMADILHA para todos os outros casos,
 * porque não pergunta se existe saída antes de fechar a porta.
 *
 * Medido em produção (2026-09-08, instalação real): o dono da instalação —
 * platform admin, membro de DUAS organizações — abriu o tenant `rafael` (o que
 * deixou `active_org=rafael` no cookie), suspendeu esse tenant pelo painel de
 * plataforma, e perdeu o acesso ao produto inteiro. A outra organização dele
 * estava `active`, e ele era platform admin: havia DUAS saídas, e o gate não
 * consultou nenhuma das duas.
 *
 * O que fechou a armadilha em vez de só apertá-la: `/account-suspended` oferecia
 * um único botão, "Sair", e ele era um `<Link href="/login">` — navegação pura,
 * que NÃO executa `app/actions/auth/signOut.ts` e portanto **não apaga o cookie
 * `active_org`**. Sair e entrar de novo devolvia a pessoa ao mesmo cookie, ao
 * mesmo redirect e à mesma tela. Sem console e sem `psql`, não havia saída pelo
 * produto.
 *
 * ## A regra, e por que nesta ordem
 *
 * 1. **Org ativa não suspensa → segue.** O caso normal, e o mais barato.
 * 2. **Existe outra organização ativa → troca para ela.** Quem administra duas
 *    empresas não perde a segunda porque a primeira foi suspensa. A suspensão é
 *    da ORGANIZAÇÃO, nunca da PESSOA — e tratá-la como se fosse da pessoa é
 *    exatamente o defeito acima.
 * 3. **É platform admin → painel de plataforma.** Quem suspende é quem
 *    reativa; trancar essa pessoa do lado de fora é trancar a chave junto. O
 *    `/admin` nunca esteve bloqueado (só `requirePlatformAdmin()`), mas nada na
 *    tela dizia isso — informação que não aparece não é saída.
 * 4. **Senão → bloqueia.** O caso legítimo da Spec 11: uma organização só, sem
 *    poder de plataforma. Mesmo aqui a tela ganhou um `signOut` de verdade, que
 *    é o que faltava para o bloqueio ser um FIM e não um LAÇO.
 *
 * A troca vem antes do painel de propósito: continuar trabalhando na empresa que
 * está no ar é melhor desfecho do que cair numa tela de administração, mesmo
 * para quem tem as duas saídas.
 *
 * ## Pura de propósito
 *
 * Nenhum `cookies()`, nenhum `redirect()`, nenhum acesso a banco — só dados de
 * entrada e a decisão. É o que permite `tests/unit/suspensao-nao-tranca.test.ts`
 * exercitar os quatro ramos sem subir Next, banco nem sessão. O layout continua
 * dono do EFEITO (redirecionar); esta função é dona da ESCOLHA.
 */

/** Uma organização do usuário, do ponto de vista desta decisão. */
export interface OrgDoUsuario {
  organization_id: string;
  /** `status` da linha em `organizations`. Suspensa é `"suspended"`. */
  status: string | null | undefined;
}

export type DecisaoDeSuspensao =
  /** A organização ativa está de pé — nada a fazer. */
  | { acao: "seguir" }
  /** Há outra organização ativa; o cookie deve apontar para ela. */
  | { acao: "trocar"; orgId: string }
  /** Sem outra organização, mas é platform admin: manda para o painel. */
  | { acao: "painel_plataforma" }
  /** Não há saída legítima: a tela de conta suspensa. */
  | { acao: "bloquear" };

export const STATUS_SUSPENSO = "suspended";

/**
 * @param orgAtivaId      organização que o cookie/`resolveActiveOrg` escolheu
 * @param organizacoes    TODAS as organizações do usuário, já na ordem de
 *                        preferência que `loadAuthUser` estabelece
 *                        (`accepted_at`, depois `organization_id`) — a troca
 *                        segue essa mesma ordem para ser determinística
 * @param ehPlatformAdmin `AuthUser.is_platform_admin`
 */
export function decidirAcessoSuspenso(
  orgAtivaId: string,
  organizacoes: readonly OrgDoUsuario[],
  ehPlatformAdmin: boolean,
): DecisaoDeSuspensao {
  const ativa = organizacoes.find((o) => o.organization_id === orgAtivaId);

  // Organização ativa não suspensa — inclui o caso de ela não estar na lista,
  // que não é desta função resolver (quem cuida disso é `resolveActiveOrg`).
  if (!ativa || ativa.status !== STATUS_SUSPENSO) return { acao: "seguir" };

  // Falha ABERTA na saída: qualquer status que não seja `suspended` conta como
  // destino válido. Um status novo no futuro (`trial`, `past_due`) não pode
  // nascer trancando quem tem para onde ir — se ele precisar bloquear, isso é
  // uma decisão explícita, escrita aqui, e não um efeito colateral de string.
  const outra = organizacoes.find(
    (o) => o.organization_id !== orgAtivaId && o.status !== STATUS_SUSPENSO,
  );
  if (outra) return { acao: "trocar", orgId: outra.organization_id };

  if (ehPlatformAdmin) return { acao: "painel_plataforma" };

  return { acao: "bloquear" };
}
