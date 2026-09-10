import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ guard: vi.fn(), db: vi.fn(), audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth/require-role", () => ({ requireRole: mocks.guard }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.db }));
vi.mock("@/lib/audit", () => ({ audit: mocks.audit }));
import { saveExternalAgentConfiguration } from "@/app/actions/external-agent";
describe("gravação das opções MCP", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.guard.mockResolvedValue({ ok: true, user: { id: "u" }, org: { orgId: "org-a" } }); });
  it("nega sem autorização antes de acessar o banco", async () => {
    mocks.guard.mockResolvedValue({ ok: false });
    expect(await saveExternalAgentConfiguration({})).toHaveProperty("error");
    expect(mocks.db).not.toHaveBeenCalled();
  });
  it("serializa JSON no CAS e preserva a marca/interface existentes", async () => {
    const settings = { branding: { name: "Preservar" }, interface: { preset: "simplificada" } };
    const chain = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() };
    chain.select.mockReturnValue(chain); chain.eq.mockReturnValue(chain); chain.update.mockReturnValue(chain);
    chain.single.mockResolvedValue({ data: { settings }, error: null });
    chain.maybeSingle.mockResolvedValue({ data: { id: "org-a" }, error: null });
    mocks.db.mockReturnValue({ from: vi.fn(() => chain) });
    expect(await saveExternalAgentConfiguration({ dispatch_mode: "external", configuration_source: "external", agent_id: null })).toEqual({ success: true });
    expect(chain.eq).toHaveBeenCalledWith("settings", JSON.stringify(settings));
    expect(chain.eq).toHaveBeenCalledWith("id", "org-a");
    expect(chain.update).toHaveBeenCalledWith({ settings: { ...settings, ai_dispatch_mode: "external", external_agent: { configuration_source: "external", agent_id: null } } });
  });
});
