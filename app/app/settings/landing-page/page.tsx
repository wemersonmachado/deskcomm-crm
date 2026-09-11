import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { readLanding } from "@/landing-page/server";
import { SettingsForm } from "@/landing-page/SettingsForm";
import { requireAuth } from "@/lib/auth/server";
import { traduzir } from "@/lib/i18n/dicionario";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePlatformAdmin();
  const user = await requireAuth();
  const t = (text: string) => traduzir(text, user.idioma);
  return <div className="space-y-6 p-6"><header><h1 className="text-2xl font-semibold">{t("Página de apresentação")}</h1><p className="text-muted-foreground">{t("Conteúdo, aparência e planos do site público.")}</p></header><SettingsForm initial={await readLanding()} /></div>;
}
