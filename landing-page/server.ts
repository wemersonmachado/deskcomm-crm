import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_LANDING, landingSchema } from "./schema";
export const readLanding = cache(async () => {
  try {
  const { data, error } = await createAdminClient().from("platform_branding").select("landing_page").eq("id", 1).maybeSingle();
  if (error) return DEFAULT_LANDING;
  const parsed = landingSchema.safeParse((data as unknown as { landing_page?: unknown } | null)?.landing_page);
  return parsed.success ? parsed.data : DEFAULT_LANDING;
  } catch { return DEFAULT_LANDING; }
});
