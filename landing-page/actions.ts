"use server";
import { revalidatePath } from "next/cache";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { mfaEmDivida } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { landingSchema } from "./schema";
import { syncPaymentLink } from "@/lib/billing/asaas";
import { env } from "@/lib/env";

export async function saveLanding(input: unknown) {
  const { user, platformAdmin } = await requirePlatformAdmin();
  if (platformAdmin.scope !== "full" || await mfaEmDivida()) return { error: "Acesso administrativo completo e sessão verificada são necessários." };
  const parsed = landingSchema.safeParse(input);
  if (!parsed.success) return { error: `Confira os campos: ${parsed.error.issues.map(i => i.path.join(".")).join(", ")}` };
  const syncedPlans = [];
  try {
    for (const plan of parsed.data.plans) {
      const link = await syncPaymentLink({
        id: plan.payment_link_id || null,
        name: plan.name,
        priceCents: plan.price_cents,
        callbackUrl: `${env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "")}/checkout/sucesso`,
      });
      syncedPlans.push({ ...plan, payment_link_id: link.id, checkout_url: link.url });
    }
  } catch {
    return { error: "Os preços não foram publicados porque o Asaas não confirmou todos os checkouts. Nenhuma configuração local foi substituída; tente novamente." };
  }
  const published = { ...parsed.data, plans: syncedPlans };
  const admin = createAdminClient();
  const { error: planError } = await admin.from("platform_billing_plans" as never).upsert(
    syncedPlans.map((plan) => ({ slug: plan.slug, name: plan.name, price_cents: plan.price_cents, currency: "BRL", billing_cycle: "MONTHLY", asaas_payment_link_id: plan.payment_link_id, checkout_url: plan.checkout_url, active: true, synced_at: new Date().toISOString(), sync_error: null })) as never,
    { onConflict: "slug" } as never,
  );
  if (planError) return { error: "Os checkouts foram sincronizados, mas o painel não conseguiu registrar o estado. Publique novamente para reconciliar." };
  const { error } = await admin.from("platform_branding").update({ landing_page: published } as never).eq("id", 1).select("id").single();
  if (error) return { error: "Não foi possível salvar. Tente novamente; suas alterações continuam no formulário." };
  await audit({ action: "platform_branding.updated", actorUserId: user.id, resourceType: "platform_branding", actingAsPlatformAdmin: true, metadata: { area: "landing_page" } });
  revalidatePath("/");
  revalidatePath("/app/settings/landing-page");
  return { success: true };
}
