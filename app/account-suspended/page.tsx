import Link from "next/link";
import { emailDeSuporte } from "@/lib/branding/saida";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadAuthUser } from "@/lib/auth/server";
import { STATUS_SUSPENSO } from "@/lib/auth/suspensao";
import { signOut } from "@/app/actions/auth/signOut";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";

export const metadata = {
  title: "Conta suspensa",
};

/**
 * Esta tela entregava o NOSSO endereço de suporte ao cliente de um revendedor —
 * e aqui isso é ativamente errado: quem suspendeu a conta foi o revendedor, e
 * escrever para nós não desbloqueia nada. O endereço agora sai de
 * `SUPPORT_EMAIL` (o do operador) e, quando ninguém configurou, o parágrafo do
 * contato simplesmente NÃO renderiza. Cair de volta num endereço do produto
 * seria o defeito de volta, com o agravante de parecer resolvido.
 *
 * ## O "Sair" que não saía (2026-09-08)
 *
 * O botão era `<Link href="/login">`. Navegação pura: não executa
 * `app/actions/auth/signOut.ts`, não encerra a sessão do Supabase e — o que
 * transformava a tela em armadilha — **não apaga o cookie `active_org`**. Quem
 * chegasse aqui saía para `/login` ainda autenticado, com o cookie intacto,
 * voltava para `/app` e era mandado de volta para cá. Um laço fechado, sem
 * saída pelo produto: o dono da instalação só recuperou o acesso por `psql`.
 *
 * Agora o botão é um `<form action={signOut}>` de verdade. E a tela deixou de
 * ser só um aviso: ela MOSTRA as saídas que existem (outra organização ativa, o
 * painel de plataforma), porque uma saída que ninguém vê não é uma saída — é o
 * invariante 6 da doutrina (`docs/doctrine/sistema-vivo.md`), o mesmo que a
 * `lista-de-conferencia.ts` dos guardrails cita.
 *
 * A recuperação AUTOMÁTICA mora em `lib/auth/suspensao.ts` + `app/app/layout.tsx`
 * e normalmente ninguém com saída chega até aqui. Esta tela é a segunda camada:
 * se a decisão de lá mudar, ou se a pessoa chegar por link direto, a saída
 * continua visível em vez de depender daquele acerto.
 */
export default async function AccountSuspendedPage() {
  const suporte = emailDeSuporte();
  // Rota fora da árvore de `app/app/layout.tsx` — sem `IdiomaProvider`, então
  // resolve o idioma direto, como `admin/forbidden/page.tsx`. Quem chega aqui
  // normalmente tem sessão do Supabase Auth (a suspensão é regra do produto,
  // não um ban de autenticação), mas `user` fica opcional por segurança.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = normalizarIdioma(
    (user?.user_metadata?.locale as string | undefined) ?? null,
  );

  /**
   * As saídas desta pessoa. Só são consultadas quando há sessão — esta rota é
   * pública (`lib/auth/public-paths.ts`) e quem cai aqui deslogado não tem
   * organização nenhuma para oferecer.
   */
  let outrasAtivas: { id: string; nome: string }[] = [];
  let ehPlatformAdmin = false;

  const authUser = user ? await loadAuthUser() : null;
  if (authUser && !authUser.support) {
    ehPlatformAdmin = authUser.is_platform_admin;
    const ids = authUser.organizations.map((o) => o.organization_id);
    if (ids.length > 0) {
      const { data: rows } = await createAdminClient()
        .from("organizations")
        .select("id, status")
        .in("id", ids);
      const ativas = new Set(
        (rows ?? [])
          .filter((r) => r.status !== STATUS_SUSPENSO)
          .map((r) => r.id as string),
      );
      // A ordem é a de `authUser.organizations` (`accepted_at`, depois id) — a
      // mesma que decide a organização padrão em `lib/auth/server.ts`. Assim a
      // primeira opção da tela é a que o produto escolheria sozinho.
      outrasAtivas = authUser.organizations
        .filter((o) => ativas.has(o.organization_id))
        .map((o) => ({ id: o.organization_id, nome: o.organization_name }));
    }
  }

  const temSaida = outrasAtivas.length > 0 || ehPlatformAdmin;

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        <h1 className="text-2xl font-semibold">{traduzir("Conta suspensa", idioma)}</h1>
        {suporte ? (
          <p className="text-sm text-muted-foreground">
            {traduzir("Sua conta está suspensa. Entre em contato com", idioma)}{" "}
            <a
              href={`mailto:${suporte}`}
              className="underline underline-offset-4 hover:text-foreground transition-colors"
            >
              {suporte}
            </a>{" "}
            {traduzir("para mais informações.", idioma)}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {traduzir(
              "Sua conta está suspensa. Fale com quem administra este sistema para saber o motivo e como reativá-la.",
              idioma,
            )}
          </p>
        )}

        {temSaida ? (
          <div className="space-y-2 pt-2 text-left">
            <p className="text-center text-xs font-medium text-muted-foreground">
              {traduzir("A suspensão é desta organização, não da sua conta.", idioma)}
            </p>
            {outrasAtivas.map((org) => (
              <Button key={org.id} asChild className="w-full" variant="default">
                <Link href={`/trocar-organizacao?org=${org.id}&next=%2Fapp`}>
                  {traduzir("Entrar em", idioma)} {org.nome}
                </Link>
              </Button>
            ))}
            {ehPlatformAdmin ? (
              <Button asChild className="w-full" variant="secondary">
                <Link href="/admin/tenants">
                  {traduzir("Abrir o painel da plataforma", idioma)}
                </Link>
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="pt-2">
          {/*
            `form action` e não `<Link href="/login">`: o link não encerrava a
            sessão nem apagava `active_org`, e era isso que fechava o laço.
          */}
          <form action={signOut}>
            <Button type="submit" variant="outline">
              {traduzir("Sair", idioma)}
            </Button>
          </form>
        </div>
      </Card>
    </main>
  );
}
