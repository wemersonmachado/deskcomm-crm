import { describe, it, expect } from "vitest";
import { DEFAULT_LANDING, landingSchema } from "./schema";
import { canSee } from "@/lib/navigation/interface";
describe("landing pública", () => {
  it("valida os padrões e mantém preços identificados como ilustrativos", () => {
    expect(landingSchema.safeParse(DEFAULT_LANDING).success).toBe(true);
    expect(DEFAULT_LANDING.pricing_note).toContain("ilustrativos");
    expect(DEFAULT_LANDING.plans).toHaveLength(3);
  });
  it.each(["javascript:alert(1)", "//evil.test", "/\\evil.test", "http://evil.test", "https://user:pass@example.com"])("recusa CTA inseguro %s", cta_url => {
    expect(landingSchema.safeParse({ ...DEFAULT_LANDING, cta_url }).success).toBe(false);
  });
  it("não libera configurações públicas para administrador de tenant", () => {
    const entry = { href: "/app/settings/landing-page", minRole: "admin" as const };
    expect(canSee(entry, false, "admin")).toBe(false);
    expect(canSee(entry, true, null)).toBe(true);
  });
});
