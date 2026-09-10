import { signOut } from "@/app/actions/auth/signOut";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const metadata = { title: "Acesso à organização removido" };

/** A identidade pode continuar existindo após o tenant ser excluído; o acesso ao produto, não. */
export default function AccessRevokedPage() {
  return (
    <Card className="space-y-4 p-6 text-center">
      <h1 className="text-xl font-semibold">Seu acesso a esta organização foi removido</h1>
      <p className="text-sm text-muted-foreground">
        Esta conta não possui mais uma organização ativa. Peça um novo convite a quem administra o sistema.
      </p>
      <form action={signOut}>
        <Button type="submit" variant="outline">Sair</Button>
      </form>
    </Card>
  );
}
