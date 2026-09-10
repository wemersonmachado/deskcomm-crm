import { describe, expect, it } from "vitest";

import {
  changeEmailSchema,
  changePasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupComConviteSchema,
} from "@/lib/auth/schemas";

describe("schemas de alteração de credenciais", () => {
  it.each(["apenasminusculas1!", "APENASMAIUSCULAS1!", "SemNumero!", "SemSimbolo1"]) (
    "rejeita senha nova sem todos os grupos: %s",
    (password) => {
      expect(resetPasswordSchema.safeParse({ password, password_confirm: password }).success).toBe(false);
      expect(signupComConviteSchema.safeParse({ email: "novo@exemplo.com", password, password_confirm: password }).success).toBe(false);
    },
  );

  it("preserva login de conta existente com senha de oito caracteres", () => {
    expect(loginSchema.safeParse({ email: "existente@exemplo.com", password: "abcdefgh" }).success).toBe(true);
  });

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
