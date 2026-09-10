"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { mfaEmDivida } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { landingSchema } from "./schema";

export async function saveLanding(input: unknown) {
  const { user, platformAdmin } = await requirePlatformAdmin();
  if (platformAdmin.scope !== "full" || await mfaEmDivida()) return { error: "Acesso administrativo completo e sessão verificada são necessários." };
  const parsed = landingSchema.safeParse(input);
  if (!parsed.success) return { error: `Confira os campos: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}` };
  const { error } = await createAdminClient().from("platform_branding").update({ landing_page: parsed.data } as never).eq("id", 1).select("id").single();
  if (error) return { error: "Não foi possível salvar. Tente novamente; suas alterações continuam no formulário." };
  await audit({ action: "platform_branding.updated", actorUserId: user.id, resourceType: "platform_branding", actingAsPlatformAdmin: true, metadata: { area: "landing_page" } });
  revalidatePath("/");
  revalidatePath("/app/settings/landing-page");
  return { success: true };
}
