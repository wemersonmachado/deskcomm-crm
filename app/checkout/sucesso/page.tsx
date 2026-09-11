import Link from "next/link";
import { traduzir } from "@/lib/i18n/dicionario";

export default function CheckoutSuccessPage() {
  const t = (texto: string) => traduzir(texto, "pt-BR");
  return <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-5 px-6 text-center">
    <p className="text-sm font-semibold uppercase tracking-widest text-primary">{t("Pagamento recebido para processamento")}</p>
    <h1 className="text-3xl font-semibold">{t("Obrigado por escolher seu plano.")}</h1>
    <p className="text-muted-foreground">{t("A confirmação será processada com segurança. Se você já possui uma organização, o status aparecerá em Configurações › Billing.")}</p>
    <div className="flex gap-3"><Link className="rounded-md bg-primary px-5 py-2 text-primary-foreground" href="/login">{t("Entrar")}</Link><Link className="rounded-md border px-5 py-2" href="/">{t("Voltar ao site")}</Link></div>
  </main>;
}
