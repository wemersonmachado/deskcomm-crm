import { randomUUID } from "node:crypto";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { requireSupportWrite } from "@/lib/impersonate/support";
import { createAdminClient } from "@/lib/supabase/admin";

const bodySchema = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("selected"), contact_ids: z.array(z.string().uuid()).min(1).max(200) }).strict(),
  z.object({ scope: z.literal("all"), confirmation: z.literal("EXCLUIR_TODOS_OS_CONTATOS") }).strict(),
]);

export async function POST(request: Request): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;
  const requestId = randomUUID();
  const raw = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return fail("validation_failed", "Confirmação ou contatos inválidos.", 422, { requestId });

  const role = parsed.data.scope === "all" ? "admin" : "agent";
  const authz = await requireRole(role, { requestId, resource: "contacts" });
  if (!authz.ok) return authz.response;

  const ids = parsed.data.scope === "selected" ? parsed.data.contact_ids : null;
  const admin = createAdminClient();
  const { data, error } = await admin.rpc(
    "fn_delete_contacts_bulk" as never,
    { p_organization_id: authz.org.orgId, p_contact_ids: ids } as never,
  );
  if (error) return fail("internal_error", "Não foi possível excluir os contatos.", 500, { requestId });

  await audit({
    action: "contact.deleted",
    actorUserId: authz.user.id,
    organizationId: authz.org.orgId,
    resourceType: "contact_batch",
    requestId,
    metadata: { scope: parsed.data.scope, result: data },
  });
  return ok(data, { requestId });
}
