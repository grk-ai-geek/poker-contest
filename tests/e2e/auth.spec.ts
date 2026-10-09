import { expect, test } from "@playwright/test";
import { db } from "../../src/lib/db";
import { createVerificationLink } from "../../src/lib/verification";

// Full account flow against the dev database. Creates and removes its own user.
const stamp = Date.now();
const email = `e2e_${stamp}@example.com`;
const displayName = `e2e_${stamp}`.slice(0, 24);
const password = "correct-horse-42";

test.afterAll(async () => {
  await db.verificationToken.deleteMany({ where: { email } });
  await db.user.deleteMany({ where: { email } });
});

async function logIn(page: import("@playwright/test").Page, callbackUrl = "/") {
  await page.goto(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

test("sign up → verify → log in → admin → log out", async ({ page }) => {
  // Sign up
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Display name").fill(displayName);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(/Account created/)).toBeVisible();

  // Duplicate sign-up is rejected
  await page.goto("/signup");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Display name").fill(`${displayName.slice(0, 20)}_x`);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("An account with this email already exists.")).toBeVisible();

  // Wrong password
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("wrong-password");
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByText("Wrong email or password.")).toBeVisible();

  // Log in: unverified banner shows
  await logIn(page);
  await expect(page.getByText(displayName)).toBeVisible();
  await expect(page.getByText("Please verify your email")).toBeVisible();

  // Verify (skip the inbox: create the link directly, so tests never send real email)
  const link = await createVerificationLink(email);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Email verified" })).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Please verify your email")).toHaveCount(0);

  // Not an admin yet
  await page.goto("/admin");
  await expect(page).toHaveURL("/");

  // Promote, log in again, admin works
  await db.user.update({ where: { email }, data: { role: "ADMIN" } });
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("link", { name: "Log in" })).toBeVisible();
  await logIn(page, "/admin");
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Admin" })).toBeVisible();
});
