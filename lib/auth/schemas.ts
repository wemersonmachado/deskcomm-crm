import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
});

export type LoginInput = z.infer<typeof loginSchema>;

/**
 * Primeiro acesso de quem foi CONVIDADO: a empresa já existe, então pedir o
 * nome dela seria permitir que a pessoa batizasse a organização de terceiros.
 */
export const signupComConviteSchema = z
  .object({
    email: z.string().email("Email inválido"),
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
    password_confirm: z.string(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ["password_confirm"],
    message: "As senhas não coincidem",
  });

export type SignupComConviteInput = z.infer<typeof signupComConviteSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().email("Email inválido"),
});

export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
    password_confirm: z.string(),
    // Código TOTP: só exigido quando a conta tem MFA (a sessão de recovery é
    // AAL1 e o GoTrue pede AAL2 para trocar a senha). Opcional no schema; a
    // action decide se é obrigatório.
    mfa_code: z.string().optional(),
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ["password_confirm"],
    message: "As senhas não coincidem",
  });

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

const senhaAtualSchema = z.string().min(8, "Informe sua senha atual");
const novaSenhaSchema = z.string().min(8, "Senha deve ter pelo menos 8 caracteres");
const codigoMfaOpcionalSchema = z
  .string()
  .regex(/^\d{6}$/, "Código de 6 dígitos inválido")
  .optional();

/**
 * Alteração de credencial dentro de uma sessão autenticada. A senha atual é
 * obrigatória: a sessão sozinha não basta para uma mudança que pode bloquear a
 * pessoa fora da própria conta.
 */
export const changePasswordSchema = z
  .object({
    current_password: senhaAtualSchema,
    password: novaSenhaSchema,
    password_confirm: z.string(),
    mfa_code: codigoMfaOpcionalSchema,
  })
  .refine((v) => v.password === v.password_confirm, {
    path: ["password_confirm"],
    message: "As senhas não coincidem",
  })
  .refine((v) => v.password !== v.current_password, {
    path: ["password"],
    message: "A nova senha deve ser diferente da atual",
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

/** Troca de e-mail exige a senha atual e confirmação pelo endereço novo. */
export const changeEmailSchema = z.object({
  email: z.string().email("Email inválido"),
  current_password: senhaAtualSchema,
  mfa_code: codigoMfaOpcionalSchema,
});

export type ChangeEmailInput = z.infer<typeof changeEmailSchema>;
