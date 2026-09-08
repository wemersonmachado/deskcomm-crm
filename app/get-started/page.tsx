import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { branding } from "@/lib/branding";
import { traduzir } from "@/lib/i18n/dicionario";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

/**
 * Estado seguro para uma conta legada sem organização. Ela não pode criar um
 * tenant: somente o platform admin cria organizações e emite convites.
 *
 * FORA de `app/app/**`, como `/login` e `/team/accept-invite` — por isso não
 * entra em `lib/navigation/registry.ts` nem na allowlist de
 * `tests/unit/navegacao-completude.test.ts`, cujo escopo é a navegação do
 * tenant. As portas são os três desvios que levam até aqui: os dois de
 * `app/onboarding/` e o estado vazio do Inbox.
 */
export const dynamic = "force-dynamic";

export default async function GetStartedPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // Quem já tem organização não passa por aqui: sem isto, a tela viraria um
  // "abra outra empresa" alcançável por quem digitasse a URL.
  if (activeOrg) redirect("/app/inbox");

  // Fora da árvore de `app/app/layout.tsx`, como as telas públicas: o idioma
  // vem do próprio usuário, e o formulário precisa do provider para o `useT()`.
  const t = (texto: string) => traduzir(texto, user.idioma);

  return (
    <IdiomaProvider locale={user.locale}>
      <main className="bg-muted/40 flex min-h-screen items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-6 rounded-lg border bg-background p-6 shadow-sm">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">
              {branding().name}
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("Aguardando convite")}
            </h1>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                "Sua conta não pertence a uma organização ativa. Peça ao administrador da plataforma um novo link de convite e abra esse link com este e-mail.",
              )}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t(
              "Por segurança, contas sem convite não podem criar organizações.",
            )}
          </p>
        </div>
      </main>
    </IdiomaProvider>
  );
}
