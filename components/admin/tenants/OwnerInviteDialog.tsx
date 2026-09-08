"use client";

import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api/client";
import { copyToClipboard } from "@/lib/clipboard";
import { useT } from "@/hooks/i18n/useT";
import { useIdioma } from "@/lib/i18n/IdiomaProvider";

interface InvitationResponse {
  data: {
    accept_url: string;
    expires_at: string;
    email_dispatched: boolean;
  };
}

export function OwnerInviteDialog({
  open,
  onClose,
  organizationId,
}: {
  open: boolean;
  onClose: () => void;
  organizationId: string;
}) {
  const t = useT();
  const idioma = useIdioma();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [invitation, setInvitation] = useState<InvitationResponse["data"] | null>(null);

  function close() {
    setEmail("");
    setInvitation(null);
    setPending(false);
    onClose();
  }

  async function generate() {
    setPending(true);
    try {
      const response = await apiClient.post<InvitationResponse>(
        `/api/v1/admin/tenants/${organizationId}/invite-owner`,
        { email },
      );
      setInvitation(response.data);
      toast.success(
        response.data.email_dispatched
          ? t("Convite enviado por e-mail.")
          : t("Link criado. O envio por e-mail não foi confirmado."),
      );
    } catch (error) {
      toast.error(t("Não foi possível gerar o convite"), {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("Convidar responsável")}</DialogTitle>
          <DialogDescription>
            {t("O link dá acesso de administrador a esta organização e usa o perfil de interface configurado na criação.")}
          </DialogDescription>
        </DialogHeader>
        {!invitation ? (
          <div className="space-y-2">
            <Label htmlFor="owner-invite-email">{t("E-mail do responsável")}</Label>
            <Input
              id="owner-invite-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {invitation.email_dispatched
                ? t("Convite enviado por e-mail.")
                : t("O envio por e-mail não foi confirmado. Copie e envie o link ao responsável.")}
            </p>
            <Label htmlFor="reissued-owner-invite">{t("Link do convite")}</Label>
            <Input id="reissued-owner-invite" readOnly value={invitation.accept_url} />
            <p className="text-xs text-muted-foreground">
              {t("Válido até")} {new Date(invitation.expires_at).toLocaleString(idioma)}.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>{t("Fechar")}</Button>
          {!invitation ? (
            <Button type="button" onClick={generate} disabled={pending || !email.trim()}>
              {pending ? t("Gerando...") : t("Gerar convite")}
            </Button>
          ) : (
            <Button
              type="button"
              onClick={async () => {
                if (await copyToClipboard(invitation.accept_url)) toast.success(t("Link copiado"));
                else toast.error(t("Selecione e copie o link acima."));
              }}
            >
              {t("Copiar convite")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
