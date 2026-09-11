import "server-only";

import { z } from "zod";

import { env } from "@/lib/env";

export type PlanSlug = "standard" | "pro" | "enterprise";

interface PaymentLink {
  id: string;
  url: string;
  active: boolean;
  value: number | null;
  chargeType: string;
  subscriptionCycle?: string | null;
}

export interface AsaasCustomerForAccess {
  id: string;
  name: string;
  email: string;
}

function configured(): boolean {
  return Boolean(env.ASAAS_API_KEY && env.ASAAS_API_BASE_URL);
}

async function asaas<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!configured()) throw new Error("asaas_not_configured");
  const response = await fetch(`${env.ASAAS_API_BASE_URL}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      "content-type": "application/json",
      access_token: env.ASAAS_API_KEY,
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`asaas_http_${response.status}`);
  return response.json() as Promise<T>;
}

function payload(name: string, priceCents: number, callbackUrl: string) {
  return {
    name,
    description: `Plano ${name} — assinatura mensal`,
    endDate: null,
    value: priceCents / 100,
    billingType: "UNDEFINED",
    chargeType: "RECURRENT",
    subscriptionCycle: "MONTHLY",
    dueDateLimitDays: 7,
    notificationEnabled: true,
    callback: { successUrl: callbackUrl, autoRedirect: true },
  };
}

export async function syncPaymentLink(input: {
  id?: string | null;
  name: string;
  priceCents: number;
  callbackUrl: string;
}): Promise<PaymentLink> {
  if (input.id) {
    return asaas<PaymentLink>(`/paymentLinks/${encodeURIComponent(input.id)}`, {
      method: "PUT",
      body: JSON.stringify(payload(input.name, input.priceCents, input.callbackUrl)),
    });
  }
  return asaas<PaymentLink>("/paymentLinks", {
    method: "POST",
    body: JSON.stringify(payload(input.name, input.priceCents, input.callbackUrl)),
  });
}

export async function createAsaasWebhook(url: string): Promise<{ id: string }> {
  return asaas<{ id: string }>("/webhooks", {
    method: "POST",
    body: JSON.stringify({
      name: "Pagamentos da plataforma",
      url,
      enabled: true,
      interrupted: false,
      authToken: env.ASAAS_WEBHOOK_TOKEN,
      sendType: "SEQUENTIALLY",
      events: [
        "PAYMENT_CREATED",
        "PAYMENT_CONFIRMED",
        "PAYMENT_RECEIVED",
        "PAYMENT_OVERDUE",
        "PAYMENT_REFUNDED",
        "PAYMENT_DELETED",
        "PAYMENT_CREDIT_CARD_CAPTURE_REFUSED",
      ],
    }),
  });
}

/** O webhook traz somente o ID. Nome e e-mail são relidos da fonte de verdade. */
export async function getAsaasCustomerForAccess(
  customerId: string,
): Promise<AsaasCustomerForAccess> {
  const customer = await asaas<unknown>(`/customers/${encodeURIComponent(customerId)}`);
  const parsed = z
    .object({
      id: z.string().min(1).max(160),
      name: z.string().trim().min(2).max(120),
      email: z.string().trim().email().max(320),
    })
    .safeParse(customer);
  if (!parsed.success) throw new Error("asaas_customer_missing_access_data");
  return { ...parsed.data, email: parsed.data.email.toLowerCase() };
}

export function asaasConfigured(): boolean {
  return configured();
}
