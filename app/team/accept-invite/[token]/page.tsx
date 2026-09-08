/**
 * /team/accept-invite/[token] — public route (added to PUBLIC_PATHS).
 *
 * Behavior matrix:
 *  - Invalid/expired token         → render error
 *  - Unauthenticated user          → render CTA → /login?next=...
 *  - Authenticated, email mismatch → render mismatch + sign-out CTA
 *  - Authenticated, email match    → form posts to Server Action which inserts
 *                                    membership and redirects to /app/inbox
 */
import Link from "next/link";

import { verifyInviteToken } from "@/lib/auth/invite-token";
import { authRateLimited, AUTH_LIMITS } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { AcceptInviteForm } from "./AcceptInviteForm";
import { SairParaTrocarConta } from "./SairParaTrocarConta";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ token: string }>;
}

export default async function AcceptInvitePage({ params }: PageProps) {
  const { token } = await params;

  // Rota pública, fora da árvore de `app/app/layout.tsx` — sem `IdiomaProvider`,
  // então resolve o idioma direto, como `admin/forbidden/page.tsx`. Buscado
  // ANTES do teto de tentativas e da validação do token porque toda ramificação
  // abaixo (inclusive as de erro) precisa do mesmo idioma — quem ainda não tem
  // conta cai no ramo sem `user` e cai no idioma padrão.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = normalizarIdioma(
    (user?.user_metadata?.locale as string | undefined) ?? null,
  );
  const t = (texto: string) => traduzir(texto, idioma);

  // O gargalo de enumeração é AQUI, não no aceite: a rota é pública e cada
  // GET testa um token. Sem teto, varrer o espaço de tokens sai de graça
  // (issue #64). Barrar antes de verificar mantém a resposta indistinguível
  // entre token válido e inválido para quem está varrendo.
  if (await authRateLimited("invite_accept", null, AUTH_LIMITS.invite_accept)) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{t("Muitas tentativas")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Aguarde alguns minutos e abra o link do convite de novo.")}
        </p>
      </Shell>
    );
  }

  const payload = verifyInviteToken(token);

  if (!payload) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{t("Convite inválido ou expirado")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Este link não é válido ou já passou da janela de 24h. Peça um novo convite ao admin do tenant.",
          )}
        </p>
      </Shell>
    );
  }

  if (!user) {
    const next = encodeURIComponent(`/team/accept-invite/${token}`);
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{t("Você foi convidado")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Para aceitar o convite como")} <strong>{payload.role}</strong>,{" "}
          {t("faça login com o email")} <strong>{payload.email}</strong>.
        </p>
        {/*
          "Criar conta" vem primeiro e cheio de propósito: quem é convidado
          quase sempre está abrindo a PRIMEIRA conta (dono de organização nova
          é sempre esse caso — a organização não existia até este convite).
          Antes "Fazer login" vinha primeiro e destacado, e essa pessoa clicava
          nele por hábito, caía num formulário pedindo uma senha que nunca foi
          enviada por e-mail (o cadastro é só-por-convite, sem senha
          provisória — a senha É a que a pessoa escolhe na tela de criar
          conta) e ficava travada sem entender por quê.
        */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Link
            href={`/signup?invite=${encodeURIComponent(token)}`}
            className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {t("Ainda não tenho conta")}
          </Link>
          <Link
            href={`/login?next=${next}`}
            className="text-sm underline underline-offset-4"
          >
            {t("Fazer login")}
          </Link>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {t(
            "Não existe senha enviada por e-mail: você cria a sua ao clicar em \"Ainda não tenho conta\". Use \"Fazer login\" só se já tinha conta antes deste convite.",
          )}
        </p>
      </Shell>
    );
  }

  const userEmail = (user.email ?? "").trim().toLowerCase();
  if (userEmail !== payload.email.trim().toLowerCase()) {
    return (
      <Shell>
        <h1 className="text-xl font-semibold">{t("Email não corresponde")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("Você está logado como")} <strong>{user.email}</strong>,{" "}
          {t("mas o convite foi enviado para")} <strong>{payload.email}</strong>.{" "}
          {t("Saia e faça login com o email correto.")}
        </p>
        <div className="mt-4">
          <SairParaTrocarConta
            label={t("Sair e entrar com outro email")}
            next={`/login?next=${encodeURIComponent(`/team/accept-invite/${token}`)}`}
          />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 className="text-xl font-semibold">{t("Aceitar convite")}</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {t("Você foi convidado para entrar como")} <strong>{payload.role}</strong>.{" "}
        {t("Confirme abaixo para ativar seu acesso.")}
      </p>
      <AcceptInviteForm token={token} label={t("Aceitar convite")} pendingLabel={t("Confirmando…")} failureLabel={t("Não foi possível aceitar este convite. Ele pode ter vencido ou seu acesso foi revogado. Peça um novo link ao administrador.")} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md rounded-lg border bg-card p-8 shadow-sm">{children}</div>
    </div>
  );
}
