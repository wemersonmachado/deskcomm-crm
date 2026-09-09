import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AuthUser, ActiveOrg } from "@/lib/auth/types";
import type { InterfaceSettings } from "@/lib/navigation/interface";
import { SupportNavigation } from "@/components/shell/SupportNavigation";
import { InterfaceEditor } from "@/components/team/InterfaceEditor";

const context = vi.hoisted(() => ({ user: {} as AuthUser, activeOrg: null as ActiveOrg | null }));
vi.mock("@/hooks/auth/AuthProvider", () => ({ useAuth: () => context }));
vi.mock("@/hooks/i18n/useT", () => ({ useT: () => (text: string) => text }));
vi.mock("next/navigation", () => ({ usePathname: () => "/app/inbox" }));
afterEach(cleanup);

describe("portas visíveis do acompanhamento", () => {
  it("abre agentes por link e desaparece ao sair; rail conserva nome acessível", () => {
    context.user = {
      is_platform_admin: true,
      support: {
        organization_id: "rafael",
        access_mode: "full",
        status: "active",
        expires_at: "2099-01-01T00:00:00Z",
      },
    } as AuthUser;
    context.activeOrg = {
      orgId: "rafael",
      name: "Rafael",
      role: "admin",
      interface_settings: { preset: "simplificada" },
    };
    const onNavigate = vi.fn();
    const view = render(<SupportNavigation collapsed={false} onNavigate={onNavigate} />);
    expect(screen.getByRole("region", { name: "Administração da organização" })).toBeTruthy();
    const link = screen.getByRole("link", { name: "Agentes" });
    expect(link.getAttribute("href")).toBe("/app/ai/agents");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledOnce();
    view.rerender(<SupportNavigation collapsed />);
    expect(screen.getByRole("link", { name: "Agentes" })).toBeTruthy();
    context.user = { ...context.user, support: null };
    view.rerender(<SupportNavigation collapsed={false} />);
    expect(screen.queryByRole("region")).toBeNull();
  });
  it("o editor mantém a opção de adicionar e retirar Agentes no perfil simplificado", () => {
    function Editor() {
      const [settings, setSettings] = useState<InterfaceSettings>({ preset: "simplificada" });
      return <InterfaceEditor value={settings} onChange={setSettings} role="admin" />;
    }
    render(<Editor />);
    fireEvent.click(screen.getByText("Personalizar áreas visíveis"));
    const agents = screen.getByRole("checkbox", {
      name: "Agentes",
      hidden: true,
    }) as HTMLInputElement;
    expect(agents.checked).toBe(false);
    fireEvent.click(agents);
    expect(agents.checked).toBe(true);
    expect((screen.getByLabelText("Perfil de interface") as HTMLSelectElement).value).toBe(
      "simplificada",
    );
    fireEvent.click(agents);
    expect(agents.checked).toBe(false);
  });
});
