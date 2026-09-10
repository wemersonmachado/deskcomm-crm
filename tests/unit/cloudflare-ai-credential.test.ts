import { describe, expect, it } from "vitest";

import { parseCloudflareAiCredential } from "@/lib/ai/cloudflare-credential";

describe("credencial composta do Cloudflare Workers AI", () => {
  it("separa account id e token sem alterar o segredo", () => {
    expect(
      parseCloudflareAiCredential(
        "0123456789abcdef0123456789abcdef:token-com-tamanho-suficiente-123",
      ),
    ).toEqual({
      accountId: "0123456789abcdef0123456789abcdef",
      apiToken: "token-com-tamanho-suficiente-123",
    });
  });

  it.each([
    "sem-separador",
    "conta-curta:token-com-tamanho-suficiente-123",
    "0123456789abcdef0123456789abcdef:curto",
    "0123456789abcdef0123456789abcdef:token com espaco e tamanho",
  ])("recusa formato inseguro: %s", (value) => {
    expect(parseCloudflareAiCredential(value)).toBeNull();
  });
});
