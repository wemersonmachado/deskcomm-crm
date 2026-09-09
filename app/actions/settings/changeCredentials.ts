"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { audit, hashEmail } from "@/lib/audit";
import {
  changeEmailSchema,
  changePasswordSchema,
  type ChangeEmailInput,
  type ChangePasswordInput,
} from "@/lib/auth/schemas";
import { AUTH_LIMITS, authRateLimited } from "@/lib/auth/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";

type CredentialResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "validation_error"
        | "unauthenticated"
        | "rate_limited"
        | "current_password_invalid"
        | "mfa_required"
        | "mfa_invalid"
        | "same_email"
        | "update_failed";
      details?: Record<string, unknown>;
    };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

/**
 * Confere a senha sem alterar os cookies da sessão atual. Usar
 * signInWithPassword no client de servidor renovaria/trocaria a própria sessão
 * no meio da operação; o password grant direto é usado só como prova efêmera e
 * a resposta jamais volta para o navegador.
 */
async function senhaAtualConfere(email: string, password: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        method: "POST",
        cache: "no-store",
        headers: {
          apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
          Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

/** Eleva a sessão a AAL2 antes de mudar uma credencial quando há MFA. */
async function elevarMfaSeNecessario(
  supabase: SupabaseServerClient,
  mfaCode: string | undefined,
): Promise<"ok" | "mfa_required" | "mfa_invalid"> {
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.currentLevel !== "aal1" || aal.nextLevel !== "aal2") return "ok";
  if (!mfaCode) return "mfa_required";

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = factors?.totp?.[0];
  if (!totp) return "mfa_invalid";
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: totp.id,
  });
  if (challengeError || !challenge) return "mfa_invalid";
  const { error } = await supabase.auth.mfa.verify({
    factorId: totp.id,
    challengeId: challenge.id,
    code: mfaCode,
  });
  return error ? "mfa_invalid" : "ok";
}

async function contextoAutenticado() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.email) return { supabase, user: null, context: null };

  const hdrs = await headers();
  return {
    supabase,
    user,
    context: {
      requestId: hdrs.get("x-request-id"),
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    },
  };
}

async function podeAlterarCredencial(
  supabase: SupabaseServerClient,
  email: string,
  currentPassword: string,
  mfaCode: string | undefined,
): Promise<CredentialResult | null> {
  if (await authRateLimited("credential_change", email, AUTH_LIMITS.credential_change)) {
    return { ok: false, error: "rate_limited" };
  }
  if (!(await senhaAtualConfere(email, currentPassword))) {
    return { ok: false, error: "current_password_invalid" };
  }
  const mfa = await elevarMfaSeNecessario(supabase, mfaCode);
  return mfa === "ok" ? null : { ok: false, error: mfa };
}

export async function changePassword(input: ChangePasswordInput): Promise<CredentialResult> {
  const parsed = changePasswordSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_error", details: parsed.error.flatten().fieldErrors };
  }

  const { supabase, user, context } = await contextoAutenticado();
  if (!user?.email || !context) return { ok: false, error: "unauthenticated" };
  const blocked = await podeAlterarCredencial(
    supabase,
    user.email,
    parsed.data.current_password,
    parsed.data.mfa_code,
  );
  if (blocked) return blocked;

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    await audit({
      action: "auth.password_change_failed",
      actorUserId: user.id,
      metadata: { reason: error.message },
      ...context,
    });
    return { ok: false, error: "update_failed" };
  }

  await audit({
    action: "auth.password_changed_from_settings",
    actorUserId: user.id,
    metadata: {},
    ...context,
  });
  revalidatePath("/app/settings/security");
  return { ok: true };
}

export async function requestEmailChange(input: ChangeEmailInput): Promise<CredentialResult> {
  const parsed = changeEmailSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "validation_error", details: parsed.error.flatten().fieldErrors };
  }

  const { supabase, user, context } = await contextoAutenticado();
  if (!user?.email || !context) return { ok: false, error: "unauthenticated" };
  const newEmail = parsed.data.email.trim().toLowerCase();
  if (newEmail === user.email.toLowerCase()) return { ok: false, error: "same_email" };

  const blocked = await podeAlterarCredencial(
    supabase,
    user.email,
    parsed.data.current_password,
    parsed.data.mfa_code,
  );
  if (blocked) return blocked;

  const { error } = await supabase.auth.updateUser(
    { email: newEmail },
    { emailRedirectTo: `${env.NEXT_PUBLIC_APP_URL}/auth/confirm?type=email_change` },
  );
  if (error) {
    await audit({
      action: "auth.email_change_request_failed",
      actorUserId: user.id,
      metadata: { new_email_hash: hashEmail(newEmail), reason: error.message },
      ...context,
    });
    return { ok: false, error: "update_failed" };
  }

  await audit({
    action: "auth.email_change_requested",
    actorUserId: user.id,
    metadata: { new_email_hash: hashEmail(newEmail) },
    ...context,
  });
  revalidatePath("/app/settings/security");
  return { ok: true };
}
