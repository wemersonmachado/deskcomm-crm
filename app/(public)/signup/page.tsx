import Link from "next/link";

import { SignupForm } from "@/components/auth/SignupForm";
import { verifyInviteToken } from "@/lib/auth/invite-token";
import { createClient } from "@/lib/supabase/server";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";

export const metadata = { title: "Criar conta" };

/**
 * A única entrada é `?invite=<token>`. A página pode continuar pública porque
 * o token HMAC, o prazo e o e-mail são revalidados pelo Server Action; sem um
 * convite válido ela não renderiza formulário nem oferece criação de conta.
 *
 * O token só é lido aqui para MONTAR a tela (esconder o nome da empresa, travar
 * o e-mail). Quem decide o que ele vale é o servidor, duas vezes: ao criar a
 * conta e ao confirmar o e-mail.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const { invite } = await searchParams;
  const payload = invite ? verifyInviteToken(invite) : null;
  const convite = invite && payload ? { token: invite, email: payload.email } : undefined;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = normalizarIdioma(
    (user?.user_metadata?.locale as string | undefined) ?? null,
  );
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{t("Criar conta")}</h1>
        <p className="text-sm text-muted-foreground">
          {convite
            ? t("Crie sua senha para entrar na empresa que te convidou")
            : t("O acesso é liberado somente por convite.")}
        </p>
      </div>

      {!convite && (
        <p
          role="alert"
          className="rounded-md border border-amber-300/60 bg-amber-50 px-4 py-3 text-sm dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          {invite
            ? t("Esse convite expirou ou não é mais válido. Peça um novo a quem administra seu acesso.")
            : t("Peça ao administrador da plataforma o link de acesso da sua organização.")}
        </p>
      )}

      {convite && <SignupForm convite={convite} />}

      <p className="text-center text-sm text-muted-foreground">
        {t("Já tem conta?")}{" "}
        <Link href="/login" className="font-medium text-foreground underline underline-offset-4">
          {t("Entrar")}
        </Link>
      </p>
    </div>
  );
}
