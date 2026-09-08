import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { issueInvite } from "@/lib/auth/issue-invite";
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { mfaEmDivida } from "@/lib/auth/server";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { lerInterface } from "@/lib/navigation/interface";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.object({ email: z.string().trim().email() }).strict();

/** Reemite o convite do responsável sem depender do recibo da tela de criação. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const requestId = randomUUID();
  const { id: organizationId } = await params;
  if (!z.string().uuid().safeParse(organizationId).success) {
    return fail("validation_error", "Organização inválida", 400, { requestId });
  }
  const supportDenied = await requireSupportWrite(organizationId);
  if (supportDenied) return supportDenied;

  let adminCtx: Awaited<ReturnType<typeof requirePlatformAdmin>>;
  try {
    adminCtx = await requirePlatformAdmin();
  } catch {
    return fail("forbidden", "Platform admin required", 403, { requestId });
  }
  if (adminCtx.platformAdmin.scope !== "full") {
    return fail("forbidden", "Seu acesso não permite emitir convites", 403, { requestId });
  }
  if (await mfaEmDivida()) {
    return fail("mfa_required", "Confirme a verificação em duas etapas", 403, { requestId });
  }

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await req.json());
  } catch {
    return fail("validation_error", "E-mail inválido", 400, { requestId });
  }

  const admin = createAdminClient();
  const { data: organization, error } = await admin
    .from("organizations")
    .select("id, display_name, status, settings")
    .eq("id", organizationId)
    .maybeSingle();
  if (error || !organization) {
    return fail("not_found", "Organização não encontrada", 404, { requestId });
  }
  if (organization.status !== "active") {
    return fail("state_conflict", "A organização precisa estar ativa", 409, { requestId });
  }

  const settings = organization.settings;
  const rawDefault =
    settings && typeof settings === "object" && !Array.isArray(settings)
      ? (settings as Record<string, unknown>).interface_default
      : undefined;
  const invitation = await issueInvite({
    email: parsed.email,
    role: "admin",
    interfaceSettings: lerInterface(rawDefault).settings,
    organizationId,
    orgName: organization.display_name,
    inviterId: adminCtx.user.id,
    inviterName: adminCtx.user.user_metadata?.full_name ?? adminCtx.user.email ?? "Administrador",
    requestId,
  });
  return ok(invitation, { status: 201, requestId });
}
