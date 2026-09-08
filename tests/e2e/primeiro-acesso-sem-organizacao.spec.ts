import { expect, test } from "@playwright/test";

test("a superfície pública não oferece recuperação que crie organização", async ({ page }) => {
  await page.goto("/signup");
  await expect(page.getByText(/Peça ao administrador da plataforma/i)).toBeVisible();
  await expect(page.getByLabel(/Nome da empresa/i)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /onboarding|continuar/i })).toHaveCount(0);
});
