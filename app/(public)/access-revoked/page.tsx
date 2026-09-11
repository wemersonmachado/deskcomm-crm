import { signOut } from "@/app/actions/auth/signOut";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { traduzir } from "@/lib/i18n/dicionario";
import { normalizarIdioma } from "@/lib/i18n/idiomas";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Acesso à organização removido" };

/** A identidade pode continuar existindo após o tenant ser excluído; o acesso ao produto, não. */
export default async function AccessRevokedPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const idioma = normalizarIdioma(
    (user?.user_metadata?.locale as string | undefined) ?? null,
  );
  const t = (texto: string) => traduzir(texto, idioma);

  return (
    <Card className="space-y-4 p-6 text-center">
      <h1 className="text-xl font-semibold">{t("Seu acesso a esta organização foi removido")}</h1>
      <p className="text-sm text-muted-foreground">
        {t("Esta conta não possui mais uma organização ativa. Peça um novo convite a quem administra o sistema.")}
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">{t("Sair")}</Button>
      </form>
    </Card>
  );
}
