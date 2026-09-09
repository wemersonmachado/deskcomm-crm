import { describe, it, expect } from "vitest";
import { supportNavigation } from "@/lib/navigation/support";
import { sidebarGroups } from "@/lib/navigation/registry";
import type { AuthUser } from "@/lib/auth/types";

const user: Pick<AuthUser, "is_platform_admin" | "support"> = {
  is_platform_admin: true,
  support: {
    id: "s",
    organization_id: "rafael",
    actor_user_id: "admin",
    auth_session_id: "session",
    previous_organization_id: "xgo",
    expires_at: "2030-01-01T00:00:00Z",
    name: "Rafael",
    locale: "pt-BR",
    access_mode: "full",
    status: "active",
  },
};
const org = { orgId: "rafael", role: "admin" as const };
const links = (u = user, o: typeof org | null = org, now = 0) =>
  supportNavigation(u, o, now).map((d) => d.href);

describe("administração durante acompanhamento", () => {
  it("oferece agentes, custos, conexões e equipe sem mudar o perfil simplificado", () => {
    expect(links()).toEqual(
      expect.arrayContaining(["/app/ai/agents", "/app/ai/usage", "/app/connections", "/app/team"]),
    );
    expect(
      sidebarGroups(false, "admin", { preset: "simplificada" })
        .flatMap((g) => g.items)
        .map((d) => d.href),
    ).not.toContain("/app/ai/agents");
  });
  it("some fora do suporte, em outro tenant, revogado ou expirado", () => {
    expect(links({ ...user, is_platform_admin: false })).toEqual([]);
    expect(links({ ...user, support: null })).toEqual([]);
    expect(links(user, { ...org, orgId: "outra" })).toEqual([]);
    expect(links(user, null)).toEqual([]);
    expect(links({ ...user, support: { ...user.support!, status: "revoked" } })).toEqual([]);
    expect(links(user, org, Date.parse("2031-01-01"))).toEqual([]);
  });
  it("não oferece edição de IA para acompanhamento somente leitura", () => {
    expect(
      links({ ...user, support: { ...user.support!, access_mode: "support_readonly" } }),
    ).not.toContain("/app/ai/agents");
  });
  it("preserva IA selecionável no menu simplificado do administrador do tenant", () => {
    const groups = sidebarGroups(false, "admin", {
      preset: "simplificada",
      destinos: ["/app/inbox", "/app/ai/agents"],
    });
    expect(groups.flatMap((g) => g.items).map((d) => d.href)).toContain("/app/ai/agents");
  });
});
