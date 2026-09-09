import { describe, expect, it } from "vitest";

import { changeEmailSchema, changePasswordSchema } from "@/lib/auth/schemas";

describe("schemas de alteração de credenciais", () => {
  it("exige senha atual e confirmação da senha nova", () => {
    expect(
      changePasswordSchema.safeParse({
        current_password: "Senha-atual-1",
        password: "Senha-nova-2",
        password_confirm: "outra-senha",
      }).success,
    ).toBe(false);
    expect(
      changePasswordSchema.safeParse({
        current_password: "Senha-atual-1",
        password: "Senha-atual-1",
        password_confirm: "Senha-atual-1",
      }).success,
    ).toBe(false);
  });

  it("aceita código MFA de seis dígitos e rejeita código incompleto", () => {
    expect(
      changeEmailSchema.safeParse({
        email: "novo@exemplo.com",
        current_password: "Senha-atual-1",
        mfa_code: "123456",
      }).success,
    ).toBe(true);
    expect(
      changeEmailSchema.safeParse({
        email: "novo@exemplo.com",
        current_password: "Senha-atual-1",
        mfa_code: "123",
      }).success,
    ).toBe(false);
  });
});
