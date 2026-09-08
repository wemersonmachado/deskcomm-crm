/**
 * Quem acabou de confirmar um e-mail só pode prosseguir se tiver sido
 * CONVIDADO para uma organização que já existe.
 *
 * O convite não tem linha em tabela nenhuma — é um token HMAC auto-contido. E o
 * aceite exige sessão. O token viaja no metadata apenas para atravessar o
 * provedor de Auth; antes de qualquer conta ser criada ele também é validado no
 * Server Action. Aqui ele é revalidado no retorno do provedor.
 *
 * É uma função PURA de propósito: a propriedade que ela carrega é de segurança,
 * e precisa ser testável sem banco, dentro do gate obrigatório.
 *
 * ⚠️ `user_metadata` é gravável pelo próprio usuário (`updateUser({data})` com a
 * anon key, do navegador). Nada que venha de lá é autoridade: quem manda é a
 * assinatura HMAC do token MAIS a comparação com o e-mail que o provedor de
 * auth acabou de confirmar. Sem essa comparação, qualquer um colaria num signup
 * próprio um token de convite alheio e entraria na organização da vítima.
 */
import { verifyInviteToken, type InvitePayload } from "@/lib/auth/invite-token";

export type DecisaoDeSignup =
  /** Foi convidado: NÃO provisionar organização; mandar para o aceite. */
  | { tipo: "convite"; token: string; payload: InvitePayload }
  /** Sem convite ou convite inválido: nunca cria organização. */
  | {
      tipo: "recusar";
      motivo: "convite_ausente" | "token_invalido" | "email_divergente";
    };

interface UsuarioConfirmado {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}

function normalizar(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function decidirConviteDoSignup(user: UsuarioConfirmado): DecisaoDeSignup {
  const bruto = user.user_metadata?.["invite_token"];
  // Sem convite não existe cadastro self-service. Falha fechada também para
  // links antigos de confirmação que ainda estejam em caixas de entrada.
  if (typeof bruto !== "string" || bruto.trim() === "") {
    return { tipo: "recusar", motivo: "convite_ausente" };
  }

  const payload = verifyInviteToken(bruto);
  // FALHA FECHADA. Token expirado ou adulterado NÃO pode cair no provisionamento:
  // o convite dura 24h e o link de confirmação de e-mail tem prazo próprio, então
  // quem demora entre "criar conta" e "confirmar e-mail" reproduziria o defeito
  // original — agora com um conserto por cima dando a impressão de resolvido.
  if (!payload) return { tipo: "recusar", motivo: "token_invalido" };

  // A autoridade: o e-mail do convite tem de ser o e-mail que o provedor de auth
  // confirmou. Sem isto, o token de outra pessoa vira porta de entrada.
  if (normalizar(payload.email) !== normalizar(user.email)) {
    return { tipo: "recusar", motivo: "email_divergente" };
  }

  return { tipo: "convite", token: bruto, payload };
}
