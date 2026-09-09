/**
 * GET /trocar-organizacao?org=<uuid>&next=<caminho> — troca a organização ativa.
 *
 * ## Por que uma rota, e não a Server Action que já existe
 *
 * `app/actions/shell/setActiveOrg.ts` faz o mesmo e continua sendo o caminho de
 * quem CLICA no seletor. Ela não serve aqui porque quem precisa trocar é o
 * `app/app/layout.tsx`, um Server Component: no App Router, Server Component
 * não grava cookie (`cookies()` é somente leitura fora de Action/Route Handler)
 * e não invoca Server Action por conta própria. Sem esta rota, a recuperação
 * automática de `lib/auth/suspensao.ts` não teria como persistir a escolha —
 * o layout redirecionaria, o cookie continuaria apontando para a organização
 * suspensa, e o redirect seria um LAÇO em vez de uma saída.
 *
 * ## O que ela valida antes de gravar (e por quê)
 *
 * O `org` chega pela URL, que é entrada do usuário — então nada aqui confia
 * nele. A membership é relida do banco pelo cliente COM SESSÃO (RLS ligada),
 * filtrando por `user_id` do `getUser()` — nunca por algo vindo da query
 * string. É a mesma checagem da Server Action, pela mesma razão: quem forja
 * `?org=<uuid de outra empresa>` tem de receber 403, não um cookie.
 *
 * `next` passa por `safeNext` — a rota redireciona, e redirect com destino cru
 * é CWE-601 (o mesmo relatório que originou `lib/auth/safe-next.ts`).
 *
 * ## Falha sempre para FORA do laço
 *
 * Qualquer recusa (org inválida, não-membro, organização suspensa) manda para
 * `/account-suspended`, nunca de volta para `/app`. Mandar para `/app` seria
 * reconstruir o laço que esta rota existe para quebrar: o layout veria de novo
 * a organização suspensa e redirecionaria de novo para cá.
 */
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { loadAuthUser } from "@/lib/auth/server";
import { safeNext } from "@/lib/auth/safe-next";
import { STATUS_SUSPENSO } from "@/lib/auth/suspensao";
import { cookieSecure } from "@/lib/supabase/cookie-secure";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const origem = req.nextUrl.origin;
  const paraTelaDeSuspensao = NextResponse.redirect(
    new URL("/account-suspended", origem),
  );

  const user = await loadAuthUser();
  if (!user) return NextResponse.redirect(new URL("/login", origem));

  // Acompanhamento de suporte tem organização própria, imposta pela sessão de
  // impersonate — deixá-la trocar aqui contornaria o escopo do acompanhamento.
  if (user.support) return paraTelaDeSuspensao;

  const orgIdParsed = z.string().uuid().safeParse(req.nextUrl.searchParams.get("org"));
  if (!orgIdParsed.success) return paraTelaDeSuspensao;
  const orgId = orgIdParsed.data;

  const destino = safeNext(req.nextUrl.searchParams.get("next"), "/app");

  const db = await createClient();
  const { data: membership, error } = await db
    .from("user_organizations")
    .select("organization_id, organizations!inner(status)")
    .eq("organization_id", orgId)
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .not("accepted_at", "is", null)
    .neq("organizations.status", STATUS_SUSPENSO)
    .maybeSingle();

  if (error || !membership) return paraTelaDeSuspensao;

  const store = await cookies();
  const anterior = store.get("active_org")?.value;
  store.set("active_org", orgId, {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });

  // `organization.switched` é a MESMA ação da Server Action de propósito: para
  // quem lê a auditoria, trocar de empresa é um fato só, e o que distingue os
  // dois caminhos é o `motivo`. Duas ações diferentes obrigariam a somar duas
  // buscas para responder "quando esta pessoa mudou de empresa".
  await audit({
    action: "organization.switched",
    actorUserId: user.id,
    organizationId: orgId,
    resourceType: "organization",
    resourceId: orgId,
    metadata: {
      previous_organization_id: z.string().uuid().safeParse(anterior).success
        ? anterior
        : null,
      motivo: "organizacao_ativa_suspensa",
    },
  });

  return NextResponse.redirect(new URL(destino, origem));
}
