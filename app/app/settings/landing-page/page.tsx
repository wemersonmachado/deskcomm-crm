import { requirePlatformAdmin } from "@/lib/auth/requirePlatformAdmin";
import { readLanding } from "@/landing-page/server";
import { SettingsForm } from "@/landing-page/SettingsForm";
export const dynamic = "force-dynamic";
export default async function Page() {
  await requirePlatformAdmin();
  return <div className="space-y-6 p-6"><header><h1 className="text-2xl font-semibold">Página de apresentação</h1><p className="text-muted-foreground">Conteúdo, aparência e planos do site público.</p></header><SettingsForm initial={await readLanding()} /></div>;
}
