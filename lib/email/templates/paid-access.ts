import { NEUTROS_DE_SAIDA, type MarcaDeSaida } from "@/lib/branding/saida";
import { tagDeIdioma } from "@/lib/i18n/datas";
import { IDIOMA_PADRAO } from "@/lib/i18n/idiomas";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function buildPaidAccessEmail(input: {
  accessUrl: string;
  organizationName: string;
  planName: string;
  expiresAt: Date;
  marca: MarcaDeSaida;
}) {
  const expiresAt = input.expiresAt.toLocaleString(tagDeIdioma(IDIOMA_PADRAO), {
    timeZone: "America/Sao_Paulo",
  });
  const logo = input.marca.logoUrl
    ? `<p style="margin:0 0 24px"><img src="${escapeHtml(input.marca.logoUrl)}" alt="${escapeHtml(input.marca.nome)}" height="40" style="height:40px;width:auto;max-width:200px;border:0;display:block"></p>`
    : "";
  return {
    subject: `Pagamento confirmado — crie seu acesso ao ${input.marca.nome}`,
    html: `<!doctype html><html lang="pt-BR"><body style="margin:0;padding:0;background:${NEUTROS_DE_SAIDA.fundo};font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:${NEUTROS_DE_SAIDA.texto}"><div style="max-width:560px;margin:0 auto;padding:32px 24px">${logo}<h1 style="font-size:22px;line-height:1.3;margin:0 0 16px">Pagamento confirmado</h1><p style="font-size:15px;line-height:1.5">Seu plano <strong>${escapeHtml(input.planName)}</strong> foi confirmado. A organização <strong>${escapeHtml(input.organizationName)}</strong> já está reservada para você.</p><p style="margin:24px 0"><a href="${escapeHtml(input.accessUrl)}" style="display:inline-block;padding:12px 24px;background:${input.marca.accent};color:${input.marca.accentFg};border-radius:6px;text-decoration:none;font-weight:600">Criar senha e acessar</a></p><p style="font-size:13px;color:${NEUTROS_DE_SAIDA.suave}">O link confirma o seu e-mail e expira em ${expiresAt}. Não existe senha provisória: você escolherá uma senha segura ao abrir o link.</p><p style="font-size:13px;color:${NEUTROS_DE_SAIDA.suave};word-break:break-all">Se o botão não abrir, copie: ${escapeHtml(input.accessUrl)}</p></div></body></html>`,
    text: [
      "Pagamento confirmado.",
      `Plano: ${input.planName}`,
      `Organização: ${input.organizationName}`,
      "",
      `Crie sua senha e acesse: ${input.accessUrl}`,
      "",
      `Este link expira em ${expiresAt}.`,
    ].join("\n"),
  };
}
