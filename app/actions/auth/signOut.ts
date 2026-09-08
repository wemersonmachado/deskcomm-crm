"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { audit } from "@/lib/audit";

/**
 * `next` deixa quem saiu de propósito (ex.: trocar de conta num convite)
 * voltar direto pra onde estava — sem isso, sair sempre jogava pro `/login`
 * puro e a pessoa perdia o link do convite que a trouxe até aqui.
 *
 * Só aceita caminho relativo de UM `/` (nunca `//host` — isso é redirect pra
 * fora do domínio disfarçado de path relativo).
 *
 * Duas exportações, não uma com parâmetro opcional: `signOut` precisa caber
 * como `<form action={signOut}>` (Server Action ligada direto ao form, que o
 * Next chama com `FormData` — um parâmetro opcional de outro tipo quebra essa
 * assinatura em `tsc`). `signOutPara` é para quem chama programaticamente e
 * PRECISA do retorno preservado, como o botão de trocar de conta no convite.
 */
export async function signOut(): Promise<void> {
  await executarSignOut();
}

export async function signOutPara(next: string): Promise<void> {
  await executarSignOut(next);
}

async function executarSignOut(next?: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hdrs = await headers();
  await supabase.auth.signOut();

  // Clear active_org cookie too.
  const store = await cookies();
  store.delete("active_org");

  if (user) {
    await audit({
      action: "auth.logout",
      actorUserId: user.id,
      requestId: hdrs.get("x-request-id"),
      ip: hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: hdrs.get("user-agent") ?? null,
    });
  }

  const destino = next && next.startsWith("/") && !next.startsWith("//") ? next : "/login";
  redirect(destino);
}
