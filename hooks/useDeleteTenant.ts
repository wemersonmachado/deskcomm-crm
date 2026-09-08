"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";

export interface DeleteTenantPayload {
  id: string;
  /** O `slug` digitado por quem confirma — o servidor recusa se não bater. */
  confirmSlug: string;
}

/**
 * Exclusão DEFINITIVA de um tenant.
 *
 * Diferente de `useSuspendTenant`, este hook NAVEGA no sucesso: a página de
 * detalhe do tenant que acabou de ser apagado responderia 404 se ficasse onde
 * está, e um 404 depois de uma ação bem-sucedida se lê como falha. Volta para a
 * lista, que é onde a ausência do tenant é a confirmação visível de que deu
 * certo.
 *
 * `invalidateQueries` do detalhe vem junto para que o cache do React Query não
 * sirva a versão antiga se alguém voltar pelo histórico do navegador.
 */
export function useDeleteTenant() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: ({ id, confirmSlug }: DeleteTenantPayload) =>
      apiClient.delete(`/api/v1/admin/tenants/${id}`, { confirm_slug: confirmSlug }),
    onSuccess: (_data, variables) => {
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenant", variables.id] });
      void queryClient.invalidateQueries({ queryKey: ["admin", "tenants"] });
      toast.success("Organização excluída definitivamente");
      router.push("/admin/tenants");
    },
    onError: (err: Error) => {
      toast.error("Erro ao excluir organização", { description: err.message });
    },
  });
}
