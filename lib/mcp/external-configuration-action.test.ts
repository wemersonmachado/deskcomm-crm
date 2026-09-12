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
  it("registra um perfil MCP sem segredo, faz CAS e preserva marca/interface", async () => {
    const settings = { branding: { name: "Preservar" }, interface: { preset: "simplificada" } };
    const org = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() };
    const agents = { insert: vi.fn(), select: vi.fn(), single: vi.fn(), delete: vi.fn(), eq: vi.fn() };
    const versions = { insert: vi.fn() };
    org.select.mockReturnValue(org); org.eq.mockReturnValue(org); org.update.mockReturnValue(org);
    org.single.mockResolvedValue({ data: { settings }, error: null });
    org.maybeSingle.mockResolvedValue({ data: { id: "org-a" }, error: null });
    agents.insert.mockReturnValue(agents); agents.select.mockReturnValue(agents); agents.delete.mockReturnValue(agents); agents.eq.mockReturnValue(agents);
    agents.single.mockResolvedValue({ data: { id: "agent-a" }, error: null });
    versions.insert.mockResolvedValue({ error: null });
    const from = vi.fn((table: string) => table === "organizations" ? org : table === "ai_agents" ? agents : versions);
    mocks.db.mockReturnValue({ from });

    expect(await saveExternalAgentConfiguration({ dispatch_mode: "external", configuration_source: "external", agent_id: null })).toEqual({ success: true, agent_id: "agent-a" });
    expect(org.eq).toHaveBeenCalledWith("settings", JSON.stringify(settings));
    expect(org.eq).toHaveBeenCalledWith("id", "org-a");
    expect(org.update).toHaveBeenCalledWith({ settings: { ...settings, ai_dispatch_mode: "external", external_agent: { configuration_source: "external", agent_id: "agent-a" } } });
    expect(agents.insert).toHaveBeenCalledWith(expect.objectContaining({
      organization_id: "org-a", kind: "mcp_agent", model: "external-runtime",
    }));
    expect(versions.insert).toHaveBeenCalledWith(expect.objectContaining({
      agent_id: "agent-a", channel_session_id: null, status: "draft",
    }));
    expect(JSON.stringify(agents.insert.mock.calls)).not.toContain("dsk_");
  });

  it("reutiliza o perfil externo já vinculado sem criar outro", async () => {
    const settings = { external_agent: { configuration_source: "external", agent_id: "11111111-1111-1111-1111-111111111111" } };
    const org = { select: vi.fn(), eq: vi.fn(), update: vi.fn(), single: vi.fn(), maybeSingle: vi.fn() };
    org.select.mockReturnValue(org); org.eq.mockReturnValue(org); org.update.mockReturnValue(org);
    org.single.mockResolvedValue({ data: { settings }, error: null });
    org.maybeSingle.mockResolvedValue({ data: { id: "org-a" }, error: null });
    const from = vi.fn(() => org);
    mocks.db.mockReturnValue({ from });

    expect(await saveExternalAgentConfiguration({ dispatch_mode: "external", configuration_source: "external", agent_id: null })).toEqual({ success: true, agent_id: "11111111-1111-1111-1111-111111111111" });
    expect(from).toHaveBeenCalledWith("organizations");
    expect(from).not.toHaveBeenCalledWith("ai_agent_versions");
  });
});
