import { chromium, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
async function main() {
  const browser = await chromium.launch();
  const base = process.env.QA_BASE_URL ?? "http://localhost:3100";
  await mkdir("evidence/producao", { recursive: true });
  try {
    for (const width of [1440, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
      const errors: string[] = [];
      page.on("pageerror", e => errors.push(e.message));
      const response = await page.goto(base, { waitUntil: "networkidle" });
      expect(response?.status()).toBe(200);
      await expect(page.getByRole("heading", { level: 1 })).toContainText("Cada conversa");
      await expect(page.getByRole("heading", { name: "Enterprise", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.locator("summary").filter({ hasText: "Preciso trocar a minha equipe por IA?" }).click();
      await expect(page.getByText("Não. Agentes e pessoas trabalham juntos.", { exact: false })).toBeVisible();
      await page.screenshot({ path: `evidence/producao/landing-${width}.png`, fullPage: true });
      const timing = await page.evaluate(() => {
        const n = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming;
        return { ttfb_ms: Math.round(n.responseStart - n.requestStart), dom_ms: Math.round(n.domContentLoadedEventEnd), resources: performance.getEntriesByType("resource").length };
      });
      if (errors.length) throw new Error(`browser_errors:${errors.length}`);
      process.stdout.write(`LANDING_${width}=PASS ${JSON.stringify(timing)}\n`);
      await page.close();
    }
  } finally { await browser.close(); }
}
main().catch(e => { process.stderr.write(String(e)); process.exitCode = 1; });
