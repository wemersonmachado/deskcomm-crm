import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";

const eventSchema = z.object({
  id: z.string().min(1).max(160),
  event: z.string().min(1).max(100),
  dateCreated: z.string().datetime().optional(),
  payment: z.object({
    id: z.string().max(160).optional(),
    customer: z.string().max(160).optional(),
    paymentLink: z.string().max(160).nullable().optional(),
    subscription: z.string().max(160).nullable().optional(),
    value: z.number().nonnegative().optional(),
    status: z.string().max(80).optional(),
    billingType: z.string().max(80).optional(),
    dueDate: z.string().max(40).optional(),
  }).passthrough(),
}).passthrough();

function validToken(received: string | null): boolean {
  if (!received || env.ASAAS_WEBHOOK_TOKEN.length < 32) return false;
  const expected = Buffer.from(env.ASAAS_WEBHOOK_TOKEN);
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request): Promise<Response> {
  if (!validToken(request.headers.get("asaas-access-token"))) return fail("unauthorized", "Webhook não autorizado.", 401);
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Evento inválido.", 422);
  const { payment } = parsed.data;
  const { error } = await createAdminClient().rpc("fn_record_asaas_event" as never, {
    p_event_id: parsed.data.id,
    p_event_type: parsed.data.event,
    p_payment_id: payment.id ?? null,
    p_customer_id: payment.customer ?? null,
    p_payment_link_id: payment.paymentLink ?? null,
    p_value_cents: payment.value == null ? null : Math.round(payment.value * 100),
    p_status: payment.status ?? null,
    p_occurred_at: parsed.data.dateCreated ?? null,
    p_payload_minimized: { billing_type: payment.billingType ?? null, due_date: payment.dueDate ?? null, subscription_id: payment.subscription ?? null },
  } as never);
  if (error) return fail("internal_error", "Evento não processado.", 500);
  return ok({ received: true });
}
