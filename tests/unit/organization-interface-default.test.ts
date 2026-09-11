import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/auth/server", () => ({ loadAuthUser: vi.fn(), resolveActiveOrg: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import { updateTenant } from "@/app/actions/settings/updateTenant";
import { tenantSchema } from "@/lib/schemas/settings";
vi.mock("@/lib/auth/requirePlatformAdmin", () => ({ requirePlatformAdmin: vi.fn() }));
import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";

const input = tenantSchema.parse({
  display_name: "Loja",
  legal_name: "Loja",
  timezone: "UTC",
  locale: "pt-BR",
  currency: "BRL",
  media_retention_days: 365,
  interface_default: { preset: "simplificada", destinos: ["/app/ai/agents"] },
});
const saved = { branding: { name: "Marca" }, interface_default: { preset: "completa" } };
const from = vi.fn();
const rpc = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePlatformAdmin).mockResolvedValue({
    user: { id: "super" },
    platformAdmin: { scope: "full" },
  } as never);
  vi.mocked(loadAuthUser).mockResolvedValue({ id: "super", is_platform_admin: true } as never);
  vi.mocked(resolveActiveOrg).mockResolvedValue({ orgId: "org-b", role: "admin" } as never);
  rpc.mockResolvedValue({ data: { members_updated: 1 }, error: null });
  from.mockImplementation((table) => {
    expect(table).toBe("organizations"); // Nunca escreve nos vínculos individuais.
    return {
      select: () => ({
        eq: (column: string, id: string) => {
          expect([column, id]).toEqual(["id", "org-b"]);
          return { maybeSingle: async () => ({ data: { settings: saved }, error: null }) };
        },
      }),
    };
  });
  vi.mocked(createAdminClient).mockReturnValue({
    from,
    rpc,
  } as never);
});
describe("padrão organizacional preserva indivíduos", () => {
  it("escopo transversal readonly não altera padrão fora do acompanhamento", async () => {
    vi.mocked(requirePlatformAdmin).mockResolvedValue({
      user: { id: "super" },
      platformAdmin: { scope: "support_readonly" },
    } as never);
    expect(await updateTenant(input)).toMatchObject({ ok: false, error: "forbidden_role" });
    expect(from).not.toHaveBeenCalled();
  });
  it("troca padrão e propaga só os vínculos que ainda o herdavam", async () => {
    expect(await updateTenant(input)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      "fn_update_organization_with_interface_default",
      expect.objectContaining({
        p_organization_id: "org-b",
        p_settings: { ...saved, lost_reasons_extra: [], interface_default: input.interface_default },
        p_propagate_interface_default: true,
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "org.updated", organizationId: "org-b" }),
    );
  });
  it("admin do tenant não pode forjar padrão reservado ao super admin", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue({ id: "member", is_platform_admin: false } as never);
    expect(await updateTenant(input)).toMatchObject({ ok: false, error: "forbidden_role" });
    expect(from).not.toHaveBeenCalled();
  });
  it("readonly não escreve mesmo sendo super admin", async () => {
    vi.mocked(loadAuthUser).mockResolvedValue({
      id: "super",
      is_platform_admin: true,
      support: { status: "active", access_mode: "support_readonly" },
    } as never);
    expect(await updateTenant(input)).toMatchObject({ ok: false });
    expect(from).not.toHaveBeenCalled();
  });
  it("campo omitido preserva padrão existente", async () => {
    const { interface_default: _ignored, ...ordinary } = input;
    expect(await updateTenant(ordinary)).toEqual({ ok: true });
    expect(rpc).toHaveBeenCalledWith(
      "fn_update_organization_with_interface_default",
      expect.objectContaining({
        p_settings: { ...saved, lost_reasons_extra: [] },
        p_propagate_interface_default: false,
      }),
    );
  });
  it("recusa áreas desconhecidas ou sem destino operacional", async () => {
    for (const destinos of [["https://example.com"], [], ["/app/settings/profile"]]) {
      expect(
        await updateTenant({
          ...input,
          interface_default: { preset: "completa", destinos },
        } as never),
      ).toMatchObject({ ok: false, error: "validation_failed" });
    }
    expect(from).not.toHaveBeenCalled();
  });
});
