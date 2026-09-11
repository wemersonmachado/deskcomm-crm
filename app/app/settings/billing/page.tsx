import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { emailDeSuporte } from "@/lib/branding/saida";
import { Card } from "@/components/ui/card";
import { traduzir } from "@/lib/i18n/dicionario";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * A tela de dinheiro entregava o nosso contato ao cliente do revendedor, e ela
 * tem porta de 1ª classe no menu. Mesmo tratamento da tela de conta suspensa:
 * o endereço é o de quem opera a instalação (`SUPPORT_EMAIL`) e, sem ele
 * configurado, nenhum endereço aparece.
 */
export default async function BillingPage() {
  // spec 13 §4: billing é admin-only (viewer/agent/manager = none).
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const suporte = emailDeSuporte();
  const idioma = user.idioma;
  const { data: subscriptionData } = await createAdminClient()
    .from("organization_subscriptions" as never)
    .select("plan_slug,status,value_cents,current_period_end" as never)
    .eq("organization_id" as never, activeOrg.orgId)
    .maybeSingle();
  const subscription = subscriptionData as unknown as { plan_slug: string; status: string; value_cents: number; current_period_end: string | null } | null;
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Plano e cobrança</h1>
        <p className="text-sm text-muted-foreground">
          {traduzir("Planos, faturas e cobrança.", idioma)}
        </p>
      </header>
      <Card className="max-w-xl p-6">
        <h2 className="text-sm font-semibold">{subscription ? traduzir("Assinatura atual", idioma) : traduzir("Nenhuma assinatura vinculada", idioma)}</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {subscription ? <>{subscription.plan_slug.toUpperCase()} · {new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(subscription.value_cents/100)} · {subscription.status}</> : <>{traduzir("Escolha um plano na página inicial. Após a confirmação, o pagamento será conciliado com esta organização.", idioma)}</>} {" "}
          {suporte ? (
            <>
              {traduzir("Para questões de pagamento, contate", idioma)}{" "}
              <a className="underline" href={`mailto:${suporte}`}>
                {suporte}
              </a>
              .
            </>
          ) : (
            <>{traduzir("Para questões de pagamento, fale com quem administra este sistema.", idioma)}</>
          )}
        </p>
      </Card>
    </div>
  );
}
