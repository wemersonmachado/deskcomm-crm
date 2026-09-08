"use client";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDeleteTenant } from "@/hooks/useDeleteTenant";
import { useT } from "@/hooks/i18n/useT";

interface DeleteTenantDialogProps {
  open: boolean;
  onClose: () => void;
  organizationId: string;
  /** Identificador que a pessoa precisa digitar. É o que o servidor confere. */
  slug: string;
  displayName: string;
}

/**
 * Confirmação de exclusão definitiva.
 *
 * Digitar o `slug` não é cerimônia: é o que separa "cliquei na linha errada" de
 * "quero apagar ESTA". O botão fica desabilitado até bater exatamente — e a
 * mesma conferência roda de novo no servidor, porque desabilitar botão não é
 * autorização (`app/api/v1/admin/tenants/[id]/route.ts`).
 *
 * O texto diz o que some, com as palavras do produto (conversas, contatos,
 * leads) e não com as do banco (linhas, tabelas, cascade). Quem lê precisa
 * decidir sobre o negócio dele.
 */
export function DeleteTenantDialog({
  open,
  onClose,
  organizationId,
  slug,
  displayName,
}: DeleteTenantDialogProps) {
  const t = useT();
  const [digitado, setDigitado] = useState("");
  const remover = useDeleteTenant();

  const confere = digitado.trim() === slug;

  function fechar() {
    setDigitado("");
    onClose();
  }

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) fechar(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("Excluir definitivamente")}</AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "Isto apaga a organização e tudo que pertence a ela: conversas, mensagens, contatos, leads, agentes de IA e os acessos da equipe. Não há lixeira e não há como desfazer.",
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="confirmar-slug">
            {t("Para confirmar, digite")}{" "}
            <code className="rounded-md bg-muted px-1 py-0.5 font-mono text-xs">{slug}</code>
          </Label>
          <Input
            id="confirmar-slug"
            value={digitado}
            onChange={(e) => setDigitado(e.target.value)}
            placeholder={slug}
            autoComplete="off"
            aria-label={t("Confirmação do identificador da organização")}
          />
          <p className="text-xs text-muted-foreground">
            {t("Organização")}: {displayName}
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={fechar}>{t("Cancelar")}</AlertDialogCancel>
          <Button
            variant="destructive"
            disabled={!confere || remover.isPending}
            onClick={() => remover.mutate({ id: organizationId, confirmSlug: digitado.trim() })}
          >
            {remover.isPending ? t("Excluindo...") : t("Excluir definitivamente")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
