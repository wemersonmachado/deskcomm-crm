import { createAdminClient } from "@/lib/supabase/admin";
import { asaasConfigured } from "@/lib/billing/asaas";

export const dynamic = "force-dynamic";

type PlanRow = { slug: string; name: string; price_cents: number; checkout_url: string | null; synced_at: string | null; sync_error: string | null };
type EventRow = { event_id: string; event_type: string; plan_slug: string | null; value_cents: number | null; status: string | null; created_at: string };

export default async function PlatformBillingPage() {
  const admin = createAdminClient();
  const plansQuery = await admin.from("platform_billing_plans" as never).select("slug,name,price_cents,checkout_url,synced_at,sync_error").order("price_cents" as never);
  const eventsQuery = await admin.from("platform_payment_events" as never).select("event_id,event_type,plan_slug,value_cents,status,created_at").order("created_at" as never, { ascending: false }).limit(30);
  const plans = (plansQuery.data ?? []) as unknown as PlanRow[];
  const events = (eventsQuery.data ?? []) as unknown as EventRow[];
  return <div className="space-y-6 p-6">
    <header><h1 className="text-2xl font-semibold">Pagamentos</h1><p className="text-sm text-muted-foreground">Checkouts dinâmicos, sincronização Asaas e eventos recebidos.</p></header>
    <p className="rounded-md border p-3 text-sm">Asaas: <strong>{asaasConfigured() ? "configurado" : "não configurado"}</strong>. Os valores são alterados em Configurações da landing e publicados nos mesmos links.</p>
    <section className="grid gap-4 md:grid-cols-3">{plans.map((plan) => <article className="rounded-lg border p-4" key={plan.slug}><h2 className="font-semibold">{plan.name}</h2><p className="text-2xl">{new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(plan.price_cents/100)}</p><p className="mt-2 text-xs text-muted-foreground">{plan.synced_at ? `Sincronizado em ${new Date(plan.synced_at).toLocaleString("pt-BR")}` : "Aguardando publicação"}</p>{plan.checkout_url && <a className="mt-3 inline-block underline" href={plan.checkout_url} target="_blank" rel="noreferrer">Abrir checkout ↗</a>}{plan.sync_error && <p className="text-sm text-destructive">{plan.sync_error}</p>}</article>)}</section>
    <section><h2 className="mb-3 font-semibold">Eventos recentes</h2><div className="overflow-x-auto rounded-lg border"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Evento</th><th className="p-3">Plano</th><th className="p-3">Valor</th><th className="p-3">Status</th><th className="p-3">Recebido</th></tr></thead><tbody>{events.map((event) => <tr className="border-b" key={event.event_id}><td className="p-3">{event.event_type}</td><td className="p-3">{event.plan_slug ?? "A conciliar"}</td><td className="p-3">{event.value_cents == null ? "—" : new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(event.value_cents/100)}</td><td className="p-3">{event.status ?? "—"}</td><td className="p-3">{new Date(event.created_at).toLocaleString("pt-BR")}</td></tr>)}</tbody></table>{events.length===0&&<p className="p-4 text-sm text-muted-foreground">Nenhum evento recebido.</p>}</div></section>
  </div>;
}
