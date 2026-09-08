"use server";

import { headers } from "next/headers";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { signupComConviteSchema, type SignupComConviteInput } from "@/lib/auth/schemas";
import { verifyInviteToken } from "@/lib/auth/invite-token";
import { audit, hashEmail } from "@/lib/audit";
import { authRateLimited, AUTH_LIMITS } from "@/lib/auth/rate-limit";

export type SignUpResult =
  | { ok: true; sessao_ativa: true }
  | {
      ok: false;
      error:
        | "validation_error"
        | "invite_required"
        | "account_exists"
        | "rate_limited"
        | "signup_failed";
      details?: Record<string, unknown>;
    };

/**
 * Cria uma conta somente quando há convite HMAC válido para o mesmo e-mail.
 *
 * O cadastro anônimo do GoTrue fica desativado. Por isso a criação usa a Admin
 * API no servidor, depois de validar o convite, e abre a sessão pelo cliente
 * normal. A conta nasce confirmada: a posse do convite enviado ao endereço é o
 * fator de entrada, e exigir um segundo e-mail de confirmação faria dois links
 * diferentes disputarem o mesmo primeiro acesso.
 *
 * Nenhuma organização nasce aqui. O token leva a pessoa ao aceite, que cria
 * somente o vínculo com a organização já criada pelo platform admin.
 */
export async function signUp(
  input: SignupComConviteInput,
  inviteToken?: string,
): Promise<SignUpResult> {
  if (typeof inviteToken !== "string" || inviteToken.trim() === "") {
    return { ok: false, error: "invite_required" };
  }

  const parsed = signupComConviteSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "validation_error",
      details: parsed.error.flatten().fieldErrors,
    };
  }

  const payload = verifyInviteToken(inviteToken);
  if (!payload) {
    return { ok: false, error: "validation_error", details: { invite: ["convite_invalido"] } };
  }
  const email = parsed.data.email.trim().toLowerCase();
  if (payload.email.trim().toLowerCase() !== email) {
    return { ok: false, error: "validation_error", details: { invite: ["email_divergente"] } };
  }

  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");
  const ip = hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = hdrs.get("user-agent") ?? null;

  if (await authRateLimited("signup", null, AUTH_LIMITS.signup)) {
    return { ok: false, error: "rate_limited" };
  }

  const admin = createAdminClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    user_metadata: { invite_token: inviteToken },
  });

  if (createError || !created.user) {
    const jaExiste =
      createError?.status === 422 || /already|registered|exists/i.test(createError?.message ?? "");
    await audit({
      action: "auth.signup_failed",
      metadata: {
        email_hash: hashEmail(email),
        reason: jaExiste ? "account_exists" : (createError?.message ?? "no_user"),
      },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: jaExiste ? "account_exists" : "signup_failed" };
  }

  const supabase = await createClient();
  const { data: sessionData, error: sessionError } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (sessionError || !sessionData.session) {
    await audit({
      action: "auth.signup_failed",
      actorUserId: created.user.id,
      metadata: {
        email_hash: hashEmail(email),
        reason: sessionError?.message ?? "session_not_created",
      },
      requestId,
      ip,
      userAgent,
    });
    return { ok: false, error: "signup_failed" };
  }

  await audit({
    action: "auth.signup_requested",
    actorUserId: created.user.id,
    metadata: { email_hash: hashEmail(email), source: "invite" },
    requestId,
    ip,
    userAgent,
  });

  return { ok: true, sessao_ativa: true };
}
