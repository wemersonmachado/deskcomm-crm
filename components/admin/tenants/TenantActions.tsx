"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SuspendDialog } from "./SuspendDialog";
import { ReactivateDialog } from "./ReactivateDialog";
import { DeleteTenantDialog } from "./DeleteTenantDialog";
import { ImpersonateButton } from "@/components/admin/ImpersonateButton";
import { OwnerInviteDialog } from "./OwnerInviteDialog";
import { useT } from "@/hooks/i18n/useT";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface TenantActionsProps {
  organizationId: string;
  status: "active" | "suspended" | "redacted";
  displayName: string;
  /** Necessário para a confirmação digitada da exclusão definitiva. */
  slug: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function TenantActions({
  organizationId,
  status,
  displayName,
  slug,
}: TenantActionsProps) {
  const t = useT();
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reactivateOpen, setReactivateOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [ownerInviteOpen, setOwnerInviteOpen] = useState(false);

  const canSuspend = status === "active";
  const isSuspended = status === "suspended";
  const isRedacted = status === "redacted";

  return (
    <>
      <div className="rounded-lg border bg-card p-5 space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {t("Ações")}
        </h2>

        {/* Impersonate (S-11.07) */}
        <ImpersonateButton
          organizationId={organizationId}
          displayName={displayName}
          disabled={isRedacted}
          disabledReason={
            isRedacted ? t("Tenant redigido — ação não disponível") : undefined
          }
        />

        {!isRedacted && (
          <Button className="w-full" variant="outline" onClick={() => setOwnerInviteOpen(true)}>
            {t("Convidar responsável")}
          </Button>
        )}

        {/* Suspend */}
        {canSuspend && (
          <Button
            className="w-full"
            variant="destructive"
            onClick={() => setSuspendOpen(true)}
            aria-label={t("Suspender tenant")}
          >
            {t("Suspender tenant")}
          </Button>
        )}

        {/* Reactivate */}
        {isSuspended && (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => setReactivateOpen(true)}
            aria-label={t("Reativar tenant")}
          >
            {t("Reativar tenant")}
          </Button>
        )}

        {isRedacted && (
          <p className="text-xs text-muted-foreground text-center py-2">
            {t("Tenant redigido — ações de gestão não disponíveis.")}
          </p>
        )}

        {/*
          Excluir só aparece para tenant SUSPENSO, e isso é a mesma trava que o
          servidor aplica (409 se o status não for `suspended`) — não é a tela
          decidindo sozinha. Esconder o botão num tenant ativo evita a pergunta
          "por que isto está desabilitado" e força o ciclo de dois passos:
          suspender (reversível, visível ao cliente) e só então excluir.
        */}
        {isSuspended && (
          <div className="border-t pt-4 space-y-2">
            <p className="text-xs text-muted-foreground">
              {t("Excluir apaga a organização e todos os dados dela. Não tem desfazer.")}
            </p>
            <Button
              className="w-full"
              variant="destructive"
              onClick={() => setDeleteOpen(true)}
              aria-label={t("Excluir definitivamente")}
            >
              {t("Excluir definitivamente")}
            </Button>
          </div>
        )}
      </div>

      <SuspendDialog
        open={suspendOpen}
        onClose={() => setSuspendOpen(false)}
        organizationId={organizationId}
      />

      <ReactivateDialog
        open={reactivateOpen}
        onClose={() => setReactivateOpen(false)}
        organizationId={organizationId}
      />

      <DeleteTenantDialog
        open={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        organizationId={organizationId}
        slug={slug}
        displayName={displayName}
      />
      <OwnerInviteDialog
        open={ownerInviteOpen}
        onClose={() => setOwnerInviteOpen(false)}
        organizationId={organizationId}
      />
    </>
  );
}
