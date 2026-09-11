import { describe, expect, it } from "vitest";
import { fail } from "@/lib/api/wrappers";

describe("erros públicos sem detalhes internos", () => {
  it.each([500, 502, 503, 504])("sanitiza falha %s", async (status) => {
    const response = fail("internal_error", "postgres://secret@host email@example.test", status, {
      details: { sql: "select private", token: "secret" }, requestId: "audit-test",
    });
    const body = await response.json();
    expect(body.error.message).toBe("Não foi possível concluir a operação. Tente novamente.");
    expect(body.error).not.toHaveProperty("details");
    expect(response.status).toBe(status);
    expect(response.headers.get("x-request-id")).toBe("audit-test");
  });
  it("preserva validação acionável", async () => {
    const body = await fail("validation_failed", "Campo obrigatório", 422).json();
    expect(body.error.message).toBe("Campo obrigatório");
  });
});
