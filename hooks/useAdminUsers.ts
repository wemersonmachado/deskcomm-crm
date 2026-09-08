"use client";
import { useInfiniteQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AdminUserRow {
  user_id: string;
  organization_id: string;
  role: string;
  accepted_at: string | null;
  revoked_at: string | null;
  tenant_name: string;
  tenant_slug: string;
  email: string | null;
  full_name: string | null;
  last_sign_in_at: string | null;
  created_at: string;
  /**
   * `true` quando este usuário está em `platform_admins` (revoked_at IS NULL).
   *
   * É um atributo da PESSOA, não do vínculo com o tenant desta linha — role
   * `admin` aqui é "dono desta empresa"; `is_platform_admin` é "enxerga TODAS
   * as empresas da instalação". As duas colunas são independentes de propósito
   * (ver `lib/auth/server.ts`): confundi-las foi o que fez o dono da instalação
   * não achar o próprio super-admin nesta tela.
   */
  is_platform_admin: boolean;
}

export interface AdminUsersFilters {
  q?: string;
  tenant_id?: string;
  role?: "viewer" | "agent" | "manager" | "admin";
}

interface ListResponse {
  data: AdminUserRow[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAdminUsers(filters: AdminUsersFilters = {}) {
  return useInfiniteQuery({
    queryKey: ["admin", "users", filters] as const,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      if (filters.q) qs.set("q", filters.q);
      if (filters.tenant_id) qs.set("tenant_id", filters.tenant_id);
      if (filters.role) qs.set("role", filters.role);
      if (pageParam) qs.set("cursor", pageParam);
      qs.set("limit", "30");
      return apiClient.get<ListResponse>(
        `/api/v1/admin/users?${qs.toString()}`,
      );
    },
    getNextPageParam: (last) =>
      last.meta?.has_more && last.meta.cursor ? last.meta.cursor : undefined,
    staleTime: 60_000,
  });
}
