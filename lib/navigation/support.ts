import type { AuthUser, ActiveOrg } from "@/lib/auth/types";
import { NAV_DESTINATIONS, canSee } from "./registry";

/** Portas de supervisão vêm do catálogo; não alteram perfil salvo nem RBAC. */
const DESTINOS = new Set([
  "/app/ai/agents",
  "/app/ai/credentials",
  "/app/ai/knowledge/sources",
  "/app/ai/usage",
  "/app/connections",
  "/app/metrics",
  "/app/audit",
  "/app/team",
  "/app/settings/tenant",
]);

export function supportNavigation(
  user: Pick<AuthUser, "is_platform_admin" | "support">,
  org: Pick<ActiveOrg, "orgId" | "role"> | null,
  now = Date.now(),
) {
  const support = user.support;
  if (
    !user.is_platform_admin ||
    !org ||
    !support ||
    support.status !== "active" ||
    support.organization_id !== org.orgId ||
    !(Date.parse(support.expires_at) > now)
  )
    return [];
  // Somente leitura continua viewer: nunca use bypass de plataforma aqui.
  const role = support.access_mode === "full" ? org.role : "viewer";
  return NAV_DESTINATIONS.filter((d) => DESTINOS.has(d.href) && canSee(d, false, role));
}
