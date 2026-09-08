"use client";
import { useTransition } from "react";
import { signOutPara } from "@/app/actions/auth/signOut";

/**
 * O `<form action="/api/auth/signout">` que existia aqui postava pra uma rota
 * que nunca existiu no projeto (só a Server Action `signOut`) — 404 silencioso,
 * botão morto, pessoa logada com a conta errada travada sem saída. `next`
 * devolve pro próprio convite depois do login certo, em vez de largar em
 * `/login` puro e perder o link.
 */
export function SairParaTrocarConta({ label, next }: { label: string; next: string }) {
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() => startTransition(async () => { await signOutPara(next); })}
      className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-accent disabled:opacity-50"
    >
      {label}
    </button>
  );
}
