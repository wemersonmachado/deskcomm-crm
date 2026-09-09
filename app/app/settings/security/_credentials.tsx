"use client";

import { useState, useTransition } from "react";
import type { FormEvent } from "react";
import { toast } from "sonner";

import { changePassword, requestEmailChange } from "@/app/actions/settings/changeCredentials";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/hooks/i18n/useT";

function mensagemDeErro(error: string, t: (text: string) => string): string {
  const messages: Record<string, string> = {
    validation_error: "Confira os campos e tente novamente.",
    unauthenticated: "Sua sessão expirou. Entre novamente para continuar.",
    rate_limited: "Muitas tentativas. Aguarde alguns minutos antes de tentar de novo.",
    current_password_invalid: "A senha atual não confere.",
    mfa_required: "Informe o código de 6 dígitos do seu autenticador.",
    mfa_invalid: "O código de verificação não é válido. Tente um código novo.",
    same_email: "Este já é o e-mail da sua conta.",
    update_failed: "Não foi possível concluir a alteração. Tente novamente.",
  };
  return t(messages[error] ?? "Não foi possível concluir a alteração. Tente novamente.");
}

export function CredentialsPanel({ email, mfaEnrolled }: { email: string; mfaEnrolled: boolean }) {
  const t = useT();
  const [changingPassword, startPassword] = useTransition();
  const [changingEmail, startEmail] = useTransition();
  const [passwordNotice, setPasswordNotice] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  function handlePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordNotice(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    startPassword(async () => {
      const result = await changePassword({
        current_password: String(form.get("current_password") ?? ""),
        password: String(form.get("password") ?? ""),
        password_confirm: String(form.get("password_confirm") ?? ""),
        mfa_code: String(form.get("password_mfa_code") ?? "") || undefined,
      });
      if (!result.ok) {
        setPasswordNotice(mensagemDeErro(result.error, t));
        return;
      }
      formElement.reset();
      toast.success(t("Senha alterada. Enviamos um aviso de segurança para seu e-mail."));
    });
  }

  function handleEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setEmailNotice(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    startEmail(async () => {
      const result = await requestEmailChange({
        email: String(form.get("email") ?? ""),
        current_password: String(form.get("current_email_password") ?? ""),
        mfa_code: String(form.get("email_mfa_code") ?? "") || undefined,
      });
      if (!result.ok) {
        setEmailNotice(mensagemDeErro(result.error, t));
        return;
      }
      formElement.reset();
      toast.success(
        t(
          "Confirme a troca pelo e-mail enviado. O endereço atual permanece ativo até a confirmação.",
        ),
      );
    });
  }

  return (
    <>
      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold">{t("Senha")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("Para sua proteção, confirme a senha atual antes de definir uma nova.")}
          </p>
        </div>
        <form className="grid max-w-xl gap-3" onSubmit={handlePassword} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="current-password">{t("Senha atual")}</Label>
            <Input
              id="current-password"
              name="current_password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            <div className="grid gap-1.5">
              <Label htmlFor="new-password">{t("Nova senha")}</Label>
              <Input
                id="new-password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="confirm-new-password">{t("Confirmar nova senha")}</Label>
              <Input
                id="confirm-new-password"
                name="password_confirm"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
          {mfaEnrolled ? <MfaCodeField id="password-mfa-code" name="password_mfa_code" /> : null}
          {passwordNotice ? (
            <p className="text-sm text-destructive" role="alert">
              {passwordNotice}
            </p>
          ) : null}
          <Button className="w-fit" type="submit" disabled={changingPassword}>
            {changingPassword ? t("Alterando…") : t("Alterar senha")}
          </Button>
        </form>
      </Card>

      <Card className="space-y-4 p-6">
        <div>
          <h2 className="text-sm font-semibold">{t("E-mail de acesso")}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("E-mail atual:")} <span className="font-medium text-foreground">{email}</span>
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("A troca só vale após a confirmação enviada para o novo endereço.")}
          </p>
        </div>
        <form className="grid max-w-xl gap-3" onSubmit={handleEmail} noValidate>
          <div className="grid gap-1.5">
            <Label htmlFor="new-email">{t("Novo e-mail")}</Label>
            <Input id="new-email" name="email" type="email" autoComplete="email" required />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="current-email-password">{t("Senha atual")}</Label>
            <Input
              id="current-email-password"
              name="current_email_password"
              type="password"
              autoComplete="current-password"
              required
            />
          </div>
          {mfaEnrolled ? <MfaCodeField id="email-mfa-code" name="email_mfa_code" /> : null}
          {emailNotice ? (
            <p className="text-sm text-destructive" role="alert">
              {emailNotice}
            </p>
          ) : null}
          <Button className="w-fit" type="submit" disabled={changingEmail}>
            {changingEmail ? t("Enviando confirmação…") : t("Solicitar troca de e-mail")}
          </Button>
        </form>
      </Card>
    </>
  );
}

function MfaCodeField({ id, name }: { id: string; name: string }) {
  const t = useT();
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>{t("Código de verificação em duas etapas")}</Label>
      <Input
        id={id}
        name={name}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
      />
    </div>
  );
}
