import { expect, test, type Page } from "@playwright/test";
import { db } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";

// Plays real hands in the browser against dev bots on a practice table.
const stamp = Date.now();
const email = `e2e_table_${stamp}@example.com`;
const displayName = `table_${stamp}`.slice(0, 24);
const password = "correct-horse-42";
let tableId = "";

test.beforeAll(async () => {
  await db.user.create({ data: { email, displayName, passwordHash: await hashPassword(password), emailVerified: new Date(), role: "ADMIN" } });
});

test.afterAll(async () => {
  if (tableId) {
    await fetch(`http://localhost:4000/internal/tables/${tableId}/close`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.INTERNAL_API_SECRET}` },
    });
    await db.hand.deleteMany({ where: { tableId } });
    await db.table.deleteMany({ where: { id: tableId } });
  }
  await db.user.deleteMany({ where: { email } });
});

async function logIn(page: Page) {
  await page.goto("/login?callbackUrl=/admin");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Admin" })).toBeVisible({ timeout: 30_000 }); // first dev compile is slow
}

/** Plays (check, else call) until `count` hands we were dealt into have finished. */
async function playHands(page: Page, count: number) {
  const finished = new Set<string>();
  const deadline = Date.now() + 150_000;
  while (finished.size < count && Date.now() < deadline) {
    const check = page.getByRole("button", { name: "Check", exact: true });
    const call = page.getByRole("button", { name: /^Call [\d,]+$/ });
    if (await check.isVisible()) await check.click().catch(() => {});
    else if (await call.isVisible()) await call.click().catch(() => {});
    const log = (await page.locator("details", { hasText: "Hand log" }).textContent({ timeout: 10_000 })) ?? "";
    const hand = log.match(/Hand log · #(\d+)/)?.[1];
    if (hand && / wins /.test(log) && log.includes(displayName)) finished.add(hand);
    await page.waitForTimeout(150);
  }
  return finished.size;
}

test("practice table: take a seat and play hands against bots", async ({ page }) => {
  test.setTimeout(240_000);
  const consoleErrors: string[] = [];
  page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  page.on("pageerror", (e) => consoleErrors.push(e.message));
  await logIn(page);
  await page.getByLabel("Seats").selectOption("3"); // fewer bots = faster hands
  await page.getByRole("button", { name: "Start practice table with bots" }).click();
  await expect(page).toHaveURL(/\/table\/\w+/);
  tableId = page.url().split("/table/")[1];

  await expect(page.getByText("You are watching this table.")).toBeVisible();
  await page.getByRole("button", { name: "Take a seat" }).click();
  await expect(page.getByLabel(new RegExp(`${displayName} \\(you\\)`))).toBeVisible();

  // Own hole cards are visible (labelled for screen readers), opponents' are not.
  await expect(page.getByRole("img", { name: / of (hearts|spades|clubs|diamonds)$/ }).first()).toBeVisible({ timeout: 15_000 });
  await page.screenshot({ path: "test-results/table-desktop.png", fullPage: true });

  expect(await playHands(page, 3)).toBeGreaterThanOrEqual(3);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: "test-results/table-mobile.png", fullPage: true });

  await page.getByRole("button", { name: "Leave seat" }).click();
  await expect(page.getByRole("button", { name: "Take a seat" })).toBeVisible({ timeout: 30_000 });
  expect(consoleErrors).toEqual([]);
});

test("a visitor can watch but must log in to play", async ({ page }) => {
  test.skip(!tableId, "needs the practice table from the previous test");
  await page.goto(`/table/${tableId}`);
  await expect(page.getByRole("link", { name: "Log in to play" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Fold" })).toHaveCount(0);
});

test("unknown tables show a friendly message", async ({ page }) => {
  await page.goto("/table/does-not-exist");
  await expect(page.getByText("This table doesn't exist or has closed.")).toBeVisible({ timeout: 15_000 });
});
