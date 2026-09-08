import { expect, test } from "@playwright/test";

test("convite ausente ou adulterado nunca degrada para cadastro comum", async ({ page }) => {
  await page.goto("/signup?invite=token-adulterado");
  await expect(page.getByRole("alert").first()).toContainText(/expirou|não é mais válido/i);
  await expect(page.getByLabel("Nome da empresa")).toHaveCount(0);
  await expect(page.getByLabel("Email")).toHaveCount(0);
});
