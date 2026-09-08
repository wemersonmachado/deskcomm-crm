import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(join(process.cwd(), arquivo), "utf8");

describe("cadastro somente por convite", () => {
  it("o Supabase local recusa signup anônimo nas duas chaves", () => {
    const config = ler("supabase/config.toml");
    expect(config.match(/enable_signup\s*=\s*false/g)).toHaveLength(2);
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
