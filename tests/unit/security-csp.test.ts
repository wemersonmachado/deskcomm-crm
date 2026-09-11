import { describe, expect, it } from "vitest";
import { contentSecurityPolicy } from "@/lib/security/csp";

describe("CSP de runtime", () => {
  it("exige nonce de scripts em produção e bloqueia objetos/framing", () => {
    const csp = contentSecurityPolicy("nonce-teste", "https://example.supabase.co", true);
    expect(csp).toContain("'nonce-nonce-teste' 'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp.split(";").find((s) => s.trim().startsWith("script-src"))).not.toContain("'unsafe-inline'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("wss://example.supabase.co");
  });
  it("mantém instalação HTTP local e não força HTTPS em todos os subdomínios", () => {
    const csp = contentSecurityPolicy("test", "http://localhost:54321", false);
    expect(csp).toContain("ws://localhost:54321");
    expect(csp).toContain("'unsafe-eval'");
    expect(csp).not.toContain("upgrade-insecure-requests");
  });
});
