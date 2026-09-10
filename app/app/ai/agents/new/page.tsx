import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { getOrCreateAgentCreationDraftAction } from "../[id]/_actions";

export const dynamic = "force-dynamic";

export default async function NewAgentPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const draft = await getOrCreateAgentCreationDraftAction();
  if (!draft.ok || !draft.data) redirect("/app/ai/agents?erro=rascunho");
  redirect(`/app/ai/agents/${draft.data.agent_id}`);
}
