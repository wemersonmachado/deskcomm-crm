import { describe, expect, it } from "vitest";

import { channelLabel } from "@/hooks/channels/useChannelSessions";

/**
 * Achado em produção: um canal recém-criado (sem apelido nem número ainda)
 * mostrava `waha_session_name` — o id interno da sessão no transporte
 * (`org_<hex>_<hex>`) — até no TÍTULO do diálogo de exclusão. Lido como "erro
 * de caracteres" por quem via a tela. `channelLabel` nunca deve devolver esse
 * campo: ele não foi pensado pra gente ler.
 */
describe("channelLabel nunca devolve o id interno da sessão", () => {
  it("sem apelido e sem número, cai no rótulo genérico — não no id da sessão", () => {
    const rotulo = channelLabel({
      display_name: null,
      phone_number: null,
    });
    expect(rotulo).toBe("Número sem nome");
  });

  it("apelido tem prioridade sobre número", () => {
    expect(channelLabel({ display_name: "Vendas", phone_number: "5511999998888" })).toBe("Vendas");
  });

  it("sem apelido, usa o número", () => {
    expect(channelLabel({ display_name: null, phone_number: "5511999998888" })).toBe("5511999998888");
  });
});
