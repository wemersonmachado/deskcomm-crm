"use server";
import { cookies } from "next/headers";
import { z } from "zod";
import { loadAuthUser, mfaEmDivida } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { audit } from "@/lib/audit";

export async function setActiveOrg(orgId: string): Promise<{ ok: boolean; error?: string }> {
  if (!z.string().uuid().safeParse(orgId).success) return { ok: false, error: "invalid_organization" };
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "auth_required" };
  if (user.support) return { ok: false, error: "Encerre o acompanhamento antes de trocar de organização." };
  if (await mfaEmDivida()) return { ok: false, error: "mfa_required" };
  // Consulta fresca: não usa status de membership serializado no browser.
  //
  // ⚠️ SEM o filtro de status aqui — de propósito. A versão anterior filtrava
  // `organizations.status = 'active'` NA MESMA query que checa membership, e as
  // duas causas de falha (não é membro / é membro mas a org está suspensa)
  // colapsavam no mesmo `maybeSingle() === null`. O chamador (`TenantSwitcher`)
  // não tinha como diferenciar e mostrava sempre "seu acesso pode ter mudado" —
  // frase correta para a primeira causa e ENGANOSA para a segunda: quem acabou
  // de suspender a própria organização lia isso como sintoma de conta
  // comprometida. O status é conferido DEPOIS, com o código de erro certo para
  // cada ramo.
  const db = await createClient();
  const { data: membership, error } = await db.from("user_organizations")
    .select("organization_id, organizations!inner(status)")
    .eq("organization_id", orgId).eq("user_id", user.id)
    .is("revoked_at", null).not("accepted_at", "is", null)
    .maybeSingle();
  if (error || !membership) return { ok: false, error: "forbidden" };
  const orgJoin = membership.organizations as unknown as { status: string } | { status: string }[];
  const status = Array.isArray(orgJoin) ? orgJoin[0]?.status : orgJoin?.status;
  if (status === "suspended") return { ok: false, error: "organization_suspended" };
  const store = await cookies();
  const previous = store.get("active_org")?.value;
  store.set("active_org", orgId, {
    httpOnly: true, sameSite: "strict", secure: cookieSecure(), path: "/", maxAge: 60 * 60 * 24 * 30,
  });
  await audit({ action: "organization.switched", actorUserId: user.id,
    organizationId: orgId, resourceType: "organization", resourceId: orgId,
    metadata: { previous_organization_id: z.string().uuid().safeParse(previous).success ? previous : null } });
  return { ok: true };
}
