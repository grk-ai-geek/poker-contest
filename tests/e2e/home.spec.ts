import { expect, test } from "@playwright/test";
import { brand } from "../../src/config/brand";

test("home page shows the brand from the config", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(new RegExp(brand.name));
  await expect(page.getByRole("heading", { level: 1, name: brand.name })).toBeVisible();
  await expect(page.getByRole("link", { name: `${brand.name}, home` })).toBeVisible();
});

test("admin pages send signed-out visitors to log in", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fadmin/);
});
