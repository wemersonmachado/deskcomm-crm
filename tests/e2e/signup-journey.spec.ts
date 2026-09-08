import { expect, test } from "@playwright/test";

test("cadastro público permanece fechado sem convite", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("link", { name: "Criar conta" })).toHaveCount(0);
  await expect(page.getByText(/primeiro acesso é liberado somente/i)).toBeVisible();

  await page.goto("/signup");
  await expect(page.getByText(/acesso é liberado somente por convite/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /criar conta/i })).toHaveCount(0);
  await expect(page.getByLabel("Email")).toHaveCount(0);
});
