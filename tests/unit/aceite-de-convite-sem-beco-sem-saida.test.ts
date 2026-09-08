import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

/**
 * Dois becos sem saída medidos em produção no aceite de convite
 * (`app/team/accept-invite/[token]/page.tsx`):
 *
 * 1. Tela "Email não corresponde" postava pra `/api/auth/signout`, rota que
 *    nunca existiu no projeto (só a Server Action `signOut`) — 404 mudo,
 *    botão morto, pessoa presa logada com a conta errada.
 * 2. CTA de quem não tem conta vinha DEPOIS de "Fazer login", que era o botão
 *    grande — dono de organização nova (sempre sem conta, por definição: a
 *    org não existia antes deste convite) clicava no botão errado, caía num
 *    formulário pedindo senha que nunca foi enviada por e-mail, e travava.
 *
 * Sem Docker/Supabase local neste ambiente não dá pra rodar o Playwright real
 * (`tests/e2e/invite-lifecycle.spec.ts`, cenário 8, nunca teve corpo de teste
 * — só o comentário). Esta sonda estática cobre os dois defeitos sem precisar
 * de banco, no mesmo estilo de `tests/unit/cadastro-somente-convite.test.ts`.
 */
describe("aceite de convite não deixa ninguém preso", () => {
  const pagina = ler("app/team/accept-invite/[token]/page.tsx");

  it("a tela de e-mail divergente não posta pra uma rota que não existe", () => {
    expect(pagina).not.toContain("/api/auth/signout");
    expect(pagina).toContain("SairParaTrocarConta");
  });

  it("Sair leva de volta pro próprio convite, não pro /login pelado", () => {
    expect(pagina).toMatch(/next=\{`\/login\?next=\$\{encodeURIComponent\(`\/team\/accept-invite\/\$\{token\}`\)\}`\}/);
  });

  it("quem não tem conta vê o botão de criar conta ANTES do de login, e em destaque", () => {
    const indiceCriarConta = pagina.indexOf('href={`/signup?invite=');
    const indiceLogin = pagina.indexOf("`/login?next=${next}`");
    expect(indiceCriarConta).toBeGreaterThan(0);
    expect(indiceLogin).toBeGreaterThan(indiceCriarConta);

    const botaoCriarConta = pagina.slice(indiceCriarConta, indiceLogin);
    expect(botaoCriarConta).toContain("bg-primary");
  });

  it("signOutPara só aceita destino relativo de um `/` — nunca `//host` disfarçado", () => {
    const acao = ler("app/actions/auth/signOut.ts");
    expect(acao).toContain("export async function signOutPara(next: string)");
    expect(acao).toContain('next.startsWith("/") && !next.startsWith("//")');
  });
});
