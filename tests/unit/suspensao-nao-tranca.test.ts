/**
 * A suspensão de UMA organização não pode trancar a PESSOA fora do produto.
 *
 * Guarda o incidente de 2026-09-08 descrito em `lib/auth/suspensao.ts`: o dono
 * da instalação, platform admin e membro de duas organizações, suspendeu a
 * segunda e perdeu o acesso a tudo — inclusive à primeira, que estava ativa, e
 * ao painel de onde se reativa.
 *
 * Os quatro ramos são exercitados nos DOIS sentidos: o que deve deixar passar e
 * o que deve bloquear. Um teste que só afirma "não bloqueia" passaria com uma
 * função que devolve `seguir` para tudo — e aí a Spec 11 §S-11.08 (o cliente
 * final que NÃO pode entrar) estaria quebrada sem nada reprovar.
 */
import { describe, expect, it } from "vitest";

import { decidirAcessoSuspenso, type OrgDoUsuario } from "@/lib/auth/suspensao";

const ATIVA = "11111111-1111-4111-8111-111111111111";
const SUSPENSA = "22222222-2222-4222-8222-222222222222";
const OUTRA_SUSPENSA = "33333333-3333-4333-8333-333333333333";

const org = (id: string, status: string | null): OrgDoUsuario => ({
  organization_id: id,
  status,
});

describe("decidirAcessoSuspenso", () => {
  it("segue quando a organização ativa não está suspensa", () => {
    const d = decidirAcessoSuspenso(ATIVA, [org(ATIVA, "active")], false);
    expect(d).toEqual({ acao: "seguir" });
  });

  it("BLOQUEIA quem tem só a organização suspensa e não é platform admin", () => {
    // É a Spec 11 §S-11.08 — o cliente final do revendedor. Se este caso parar
    // de bloquear, a suspensão vira decorativa.
    const d = decidirAcessoSuspenso(SUSPENSA, [org(SUSPENSA, "suspended")], false);
    expect(d).toEqual({ acao: "bloquear" });
  });

  it("troca para a outra organização ativa em vez de trancar", () => {
    const d = decidirAcessoSuspenso(
      SUSPENSA,
      [org(ATIVA, "active"), org(SUSPENSA, "suspended")],
      false,
    );
    expect(d).toEqual({ acao: "trocar", orgId: ATIVA });
  });

  it("manda o platform admin ao painel quando não há outra organização ativa", () => {
    // Quem suspende é quem reativa: trancá-lo do lado de fora tranca a chave.
    const d = decidirAcessoSuspenso(SUSPENSA, [org(SUSPENSA, "suspended")], true);
    expect(d).toEqual({ acao: "painel_plataforma" });
  });

  it("prefere TROCAR a mandar o platform admin ao painel", () => {
    // Continuar trabalhando na empresa que está no ar é melhor desfecho do que
    // cair numa tela de administração — mesmo para quem tem as duas saídas.
    const d = decidirAcessoSuspenso(
      SUSPENSA,
      [org(ATIVA, "active"), org(SUSPENSA, "suspended")],
      true,
    );
    expect(d).toEqual({ acao: "trocar", orgId: ATIVA });
  });

  it("não oferece como saída uma organização também suspensa", () => {
    const d = decidirAcessoSuspenso(
      SUSPENSA,
      [org(SUSPENSA, "suspended"), org(OUTRA_SUSPENSA, "suspended")],
      false,
    );
    expect(d).toEqual({ acao: "bloquear" });
  });

  it("escolhe a PRIMEIRA saída da lista — a troca é determinística", () => {
    // A ordem é a de `loadAuthUser` (`accepted_at`, depois id). Sem determinismo,
    // quem tem três empresas cairia numa diferente a cada recuperação.
    const d = decidirAcessoSuspenso(
      SUSPENSA,
      [org(ATIVA, "active"), org(OUTRA_SUSPENSA, "active"), org(SUSPENSA, "suspended")],
      false,
    );
    expect(d).toEqual({ acao: "trocar", orgId: ATIVA });
  });

  it("status desconhecido conta como saída válida (falha ABERTA na saída)", () => {
    // Um status novo (`trial`, `past_due`) não pode nascer trancando quem tem
    // para onde ir. Bloquear é decisão explícita, não efeito colateral de string.
    const d = decidirAcessoSuspenso(
      SUSPENSA,
      [org(ATIVA, "trial"), org(SUSPENSA, "suspended")],
      false,
    );
    expect(d).toEqual({ acao: "trocar", orgId: ATIVA });
  });

  it("segue quando a organização ativa nem está na lista", () => {
    // Não é desta função resolver membership inconsistente — quem cuida disso é
    // `resolveActiveOrg`. Bloquear aqui esconderia o defeito de lá.
    const d = decidirAcessoSuspenso(ATIVA, [], false);
    expect(d).toEqual({ acao: "seguir" });
  });
});
