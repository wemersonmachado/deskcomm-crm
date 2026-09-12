import { describe, expect, it } from "vitest";

import { deriveActor } from "./auth";

describe("deriveActor", () => {
  const tokenId = "11111111-1111-4111-8111-111111111111";
  const userId = "22222222-2222-4222-8222-222222222222";

  it("atribui bearer MCP comum ao usuário que o emitiu, nunca ao UUID do token", () => {
    expect(deriveActor(["role:manager", "mcp:read"], tokenId, userId)).toEqual({
      type: "user",
      id: userId,
      role: "manager",
      api_token_id: tokenId,
    });
  });

  it("preserva a autoria de IA e não converte token em papel extra", () => {
    expect(
      deriveActor(["role:ai_operator", "actor:ai_agent", "agent_run:run-1"], tokenId, userId),
    ).toEqual({ type: "ai_agent", id: "run-1", role: "ai_operator", api_token_id: tokenId });
  });
});
