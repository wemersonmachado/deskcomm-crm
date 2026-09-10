import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

const actions = vi.hoisted(() => ({ autosave: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/app/ai/agents/44444444-4444-4444-8444-444444444444",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/app/app/ai/agents/[id]/_actions", () => ({
  saveAgentCreationDraftAction: actions.autosave,
  saveAgentDraftAction: vi.fn(),
  publishAgentAction: vi.fn(),
  createMcpAgentAction: vi.fn(),
}));

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";

const AGENT = {
  id: "44444444-4444-4444-8444-444444444444",
  organization_id: "33333333-3333-4333-8333-333333333333",
  name: "Farmácia Lia",
  description: null,
  priority: 0,
  model: "pending",
  system_prompt: "Você é um atendente. Responda de forma educada e clara, em pt-BR.",
  is_active: false,
  is_default: false,
  config: {
    creation_draft: {
      state: "incomplete",
      form: {
        name: "Farmácia Lia",
        description: "Atendimento humanizado",
        priority: 7,
        version: {
          provider: "groq",
          system_prompt: "Atenda com cuidado, clareza e segurança.",
        },
      },
    },
  },
  guardrails: [],
  active_kb_version_id: null,
  kind: "mcp_agent",
  published_version_id: null,
  archived_at: null,
  created_at: "2026-09-10T00:00:00Z",
  updated_at: "2026-09-10T00:00:00Z",
};

describe("rascunho persistente da criação do agente", () => {
  it("rehidrata o trabalho salvo, explica as pendências e salva novas mudanças", async () => {
    actions.autosave.mockResolvedValue({ ok: true, data: { saved_at: "2026-09-10T01:00:00Z" } });
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AgentForm
          mode="edit"
          agent={AGENT as never}
          draft={null}
          published={null}
          base={null}
          credentials={[]}
          channelSessions={[]}
        />
      </QueryClientProvider>,
    );

    expect(screen.getByDisplayValue("Farmácia Lia")).toBeInTheDocument();
    expect(screen.getByTestId("agent-completion-guide")).toHaveTextContent(
      "Este rascunho fica salvo",
    );
    expect(screen.getByText(/Modelo — escolha a inteligência artificial/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Farmácia 24h" } });
    await waitFor(() => expect(actions.autosave).toHaveBeenCalled(), { timeout: 2_000 });
    expect(actions.autosave.mock.calls.at(-1)?.[1]).toMatchObject({
      name: "Farmácia 24h",
      version: { provider: "groq" },
    });
  });
});
