import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

/**
 * Lê `supabase/config.toml` ignorando comentários e devolve o valor de uma
 * chave DENTRO de uma seção — `contar ocorrências de "= false"` no arquivo
 * inteiro não distingue as duas chaves homônimas, que fazem coisas opostas.
 */
const chaveNaSecao = (secao: string, chave: string): string | undefined => {
  const linhas = ler("supabase/config.toml")
    .split(/\r?\n/)
    .map((l) => l.replace(/#.*$/, "").trim())
    .filter(Boolean);
  let atual = "";
  for (const linha of linhas) {
    const cabecalho = /^\[([^\]]+)\]$/.exec(linha);
    if (cabecalho) {
      atual = cabecalho[1]!;
      continue;
    }
    const par = /^([A-Za-z0-9_]+)\s*=\s*(.+)$/.exec(linha);
    if (par && atual === secao && par[1] === chave) return par[2]!.trim();
  }
  return undefined;
};

describe("cadastro somente por convite", () => {
  /**
   * ⚠️ AS DUAS CHAVES SE CHAMAM IGUAL E FAZEM COISAS OPOSTAS.
   *
   * A versão anterior deste teste exigia `enable_signup = false` DUAS vezes, e
   * com isso CONGELAVA UM DEFEITO: `[auth.email] enable_signup` vira
   * `external_email_enabled` (o provider de e-mail inteiro), não "signup por
   * e-mail". Com `false` ali, o password grant do GoTrue responde
   * "Email logins are disabled" e NENHUM usuário existente consegue logar — as
   * três partes do job `e2e` morriam no seed. O teste ficava verde o tempo
   * todo, porque contava a string certa pelo motivo errado.
   *
   * Quem barra cadastro anônimo é a chave de cima (`disable_signup`), e ela
   * segue exigida aqui. Ver o cabeçalho de `supabase/config.toml` para a prova
   * na fonte do CLI e do GoTrue.
   */
  it("o cadastro anônimo está desligado no gate que realmente barra", () => {
    expect(chaveNaSecao("auth", "enable_signup")).toBe("false");
  });

  it("o provider de e-mail continua ligado, senão ninguém consegue logar", () => {
    expect(chaveNaSecao("auth.email", "enable_signup")).toBe("true");
  });

  it("o instalador fecha o cadastro antes de tentar gravar templates", () => {
    const script = ler("hostgator-setup-kit/marca-emails.sh");
    const seguranca = script.indexOf('corpo_seguranca="{');
    const templates = script.lastIndexOf("mailer_templates_confirmation_content");
    expect(seguranca).toBeGreaterThan(0);
    expect(templates).toBeGreaterThan(seguranca);
  });

  it("a página sem convite não renderiza o formulário", () => {
    const pagina = ler("app/(public)/signup/page.tsx");
    expect(pagina).toContain("{convite && <SignupForm convite={convite} />}");
    expect(pagina).not.toContain("<SignupForm convite={convite} />\n\n");
  });

  it("a criação usa Admin API somente depois de verificar token e e-mail", () => {
    const action = ler("app/actions/auth/signUp.ts");
    const verifica = action.indexOf("verifyInviteToken(inviteToken)");
    const compara = action.indexOf("payload.email.trim().toLowerCase() !== email");
    const cria = action.indexOf("admin.auth.admin.createUser");
    expect(verifica).toBeGreaterThan(0);
    expect(compara).toBeGreaterThan(verifica);
    expect(cria).toBeGreaterThan(compara);
    expect(action).not.toContain("ensureTenantForUser");
  });

  it("a rota de confirmação não provisiona tenant", () => {
    const confirmacao = ler("app/auth/confirm/route.ts");
    expect(confirmacao).not.toContain("ensureTenantForUser");
  });

  it("não resta action nem módulo capazes de criar tenant no primeiro acesso", () => {
    const arquivos = [
      "app/actions/auth/recoverOrganization.ts",
      "lib/auth/provision.ts",
      "components/auth/RecoverOrganizationForm.tsx",
    ];
    for (const arquivo of arquivos) {
      expect(() => ler(arquivo)).toThrow();
    }
  });
});
