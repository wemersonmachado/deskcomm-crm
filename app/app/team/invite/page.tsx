import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { traduzir } from "@/lib/i18n/dicionario";
import { InviteForm } from "./_components/InviteForm";
import { createClient } from "@/lib/supabase/server";
import { lerInterface } from "@/lib/navigation/interface";

export const dynamic = "force-dynamic";

export default async function TeamInvitePage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const idioma = user.idioma;
  const supabase = await createClient();
  const { data: organization, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .single();
  if (error) throw error;
  const settings = organization.settings as Record<string, unknown> | null;
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t("Convidar membros")}</h1>
        <p className="text-sm text-muted-foreground">
          {t("Cole até 20 emails (um por linha) e escolha a role compartilhada.")}
        </p>
      </header>
      <InviteForm initialInterface={lerInterface(settings?.interface_default).settings} />
    </div>
  );
}
