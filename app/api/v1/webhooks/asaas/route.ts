import { timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { audit, hashEmail } from "@/lib/audit";
import { getAsaasCustomerForAccess } from "@/lib/billing/asaas";
import { sendPaidAccess, type PaidAccessReceipt } from "@/lib/billing/paid-access";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

const eventSchema = z
  .object({
    id: z.string().min(1).max(160),
    event: z.string().min(1).max(100),
    dateCreated: z.string().max(40).optional(),
    payment: z
      .object({
        id: z.string().max(160).optional(),
        customer: z.string().max(160).optional(),
        paymentLink: z.string().max(160).nullable().optional(),
        subscription: z.string().max(160).nullable().optional(),
        value: z.number().nonnegative().optional(),
        status: z.string().max(80).optional(),
        billingType: z.string().max(80).optional(),
        dueDate: z.string().max(40).optional(),
      })
      .passthrough(),
  })
  .passthrough();

function validToken(received: string | null): boolean {
  if (!received || env.ASAAS_WEBHOOK_TOKEN.length < 32) return false;
  const expected = Buffer.from(env.ASAAS_WEBHOOK_TOKEN);
  const actual = Buffer.from(received);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request): Promise<Response> {
  if (!validToken(request.headers.get("asaas-access-token")))
    return fail("unauthorized", "Webhook não autorizado.", 401);
  const parsed = eventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return fail("validation_failed", "Evento inválido.", 422);
  const { payment } = parsed.data;
  const admin = createAdminClient();
  const occurredAt =
    parsed.data.dateCreated && !Number.isNaN(Date.parse(parsed.data.dateCreated))
      ? new Date(parsed.data.dateCreated).toISOString()
      : null;
  const { error } = await admin.rpc(
    "fn_record_asaas_event" as never,
    {
      p_event_id: parsed.data.id,
      p_event_type: parsed.data.event,
      p_payment_id: payment.id ?? null,
      p_customer_id: payment.customer ?? null,
      p_payment_link_id: payment.paymentLink ?? null,
      p_value_cents: payment.value == null ? null : Math.round(payment.value * 100),
      p_status: payment.status ?? null,
      p_occurred_at: occurredAt,
      p_payload_minimized: {
        billing_type: payment.billingType ?? null,
        due_date: payment.dueDate ?? null,
        subscription_id: payment.subscription ?? null,
      },
    } as never,
  );
  if (error) return fail("internal_error", "Evento não processado.", 500);

  if (!new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"]).has(parsed.data.event)) {
    return ok({ received: true, access_provisioned: false });
  }
  if (!payment.id || !payment.customer || !payment.paymentLink || payment.value == null) {
    return ok({ received: true, access_provisioned: false });
  }

  let customer;
  try {
    customer = await getAsaasCustomerForAccess(payment.customer);
  } catch (cause) {
    logger.error("[billing.asaas] não foi possível reler o pagador", {
      error: cause instanceof Error ? cause.message : "unknown",
      request_id: request.headers.get("x-request-id"),
    });
    return fail("upstream_unavailable", "Confirmação aguardando nova tentativa.", 503);
  }

  const { data: provisioned, error: provisionError } = await admin.rpc(
    "fn_provision_paid_checkout" as never,
    {
      p_payment_id: payment.id,
      p_subscription_id: payment.subscription ?? "",
      p_customer_id: payment.customer,
      p_payment_link_id: payment.paymentLink,
      p_value_cents: Math.round(payment.value * 100),
      p_customer_name: customer.name,
      p_email_hash: hashEmail(customer.email),
    } as never,
  );
  if (provisionError) return fail("internal_error", "Acesso não provisionado.", 500);

  const receiptSchema = z.object({
    eligible: z.literal(true),
    created: z.boolean(),
    organization_id: z.string().uuid(),
    organization_name: z.string().min(1),
    plan_name: z.string().min(1),
    invite_id: z.string().uuid(),
    issued_at: z.number().int().positive(),
    email_sent_at: z.string().nullable(),
  });
  const receipt = receiptSchema.safeParse(provisioned);
  if (!receipt.success) {
    return ok({ received: true, access_provisioned: false });
  }
  if (receipt.data.created) {
    await audit({
      action: "tenant.created_by_payment",
      organizationId: receipt.data.organization_id,
      resourceType: "organization",
      resourceId: receipt.data.organization_id,
      requestId: request.headers.get("x-request-id"),
      bypassedRls: true,
      metadata: { source: "asaas", plan_name: receipt.data.plan_name },
    });
  }
  let delivery;
  try {
    delivery = await sendPaidAccess({
      receipt: receipt.data as PaidAccessReceipt,
      email: customer.email,
      requestId: request.headers.get("x-request-id") ?? parsed.data.id,
    });
  } catch (cause) {
    logger.error("[billing.asaas] acesso criado, mas entrega ainda não foi confirmada", {
      error: cause instanceof Error ? cause.message : "unknown",
      request_id: request.headers.get("x-request-id"),
    });
    return fail("upstream_unavailable", "Acesso criado; e-mail aguardando nova tentativa.", 503);
  }
  if (!delivery.sent) {
    return fail("upstream_unavailable", "Acesso criado; e-mail aguardando nova tentativa.", 503);
  }
  return ok({ received: true, access_provisioned: true, email_dispatched: true });
}
