import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom/vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));
vi.mock("@/app/app/ai/agents/[id]/_actions", () => ({
  saveAgentCreationDraftAction: vi.fn(async () => ({
    ok: true,
    data: { saved_at: "2026-09-11T00:00:00.000Z" },
  })),
  saveAgentDraftAction: vi.fn(),
  publishAgentAction: vi.fn(),
  createMcpAgentAction: vi.fn(),
}));

import { AgentForm } from "@/app/app/ai/agents/[id]/_components/AgentForm";
import { saveAgentCreationDraftAction } from "@/app/app/ai/agents/[id]/_actions";

const AGENTE_RASCUNHO = {
  id: "11111111-1111-4111-8111-111111111111",
  organization_id: "22222222-2222-4222-8222-222222222222",
  name: "Novo agente",
  description: null,
  model: "pending",
  system_prompt: "Você é um atendente. Responda de forma educada e clara, em pt-BR.",
  is_active: false,
  is_default: false,
  kind: "mcp_agent",
  priority: 0,
  published_version_id: null,
  archived_at: null,
  config: {
    creation_draft: {
      state: "incomplete",
      form: {
        name: "",
        description: "",
        priority: 0,
        version: {
          provider: "anthropic",
          system_prompt: "Você é um atendente. Responda de forma educada e clara, em pt-BR.",
        },
      },
    },
  },
  guardrails: [],
  active_kb_version_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("rascunho do novo agente", () => {
  it("persiste a primeira alteração sem depender de render posterior", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AgentForm
          mode="edit"
          agent={AGENTE_RASCUNHO as never}
          draft={null}
          published={null}
          credentials={[]}
          channelSessions={[]}
        />
      </QueryClientProvider>,
    );

    fireEvent.change(screen.getByLabelText("Nome"), { target: { value: "Recepção persistente" } });

    await waitFor(
      () => {
        expect(saveAgentCreationDraftAction).toHaveBeenCalledWith(
          AGENTE_RASCUNHO.id,
          expect.objectContaining({ name: "Recepção persistente" }),
        );
      },
      { timeout: 2_000 },
    );
    expect(screen.getByText(/rascunho salvo/i)).toBeVisible();
  });
});
