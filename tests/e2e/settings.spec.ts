import { expect, test } from "@playwright/test";
import { db } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";

// Profile picture: upload on /settings, shown in the header and at the table.
const stamp = Date.now();
const email = `e2e_avatar_${stamp}@example.com`;
const displayName = `avatar_${stamp}`.slice(0, 24);
const password = "correct-horse-42";
let tableId = "";

// A 4×2 red PNG (not square, so the browser has to crop it).
const png = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAQAAAACCAIAAADwyuo0AAAAEElEQVR4nGM4IacBRwzIHAByyghxJO3fWAAAAABJRU5ErkJggg==",
  "base64",
);

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

test("upload a profile picture and see it at the table", async ({ page }) => {
  test.setTimeout(120_000);
  const errors: string[] = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

  await page.goto("/login?callbackUrl=/settings");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible({ timeout: 30_000 });

  await page.locator("#avatar-file").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png });
  await page.getByRole("button", { name: "Save picture" }).click();
  await expect(page.getByText("Profile picture updated.")).toBeVisible();

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { avatar: true } });
  expect(user.avatarUrl).toMatch(new RegExp(`^/api/avatar/${user.id}\\?v=\\d+$`));
  expect(["image/webp", "image/jpeg"]).toContain(user.avatar?.contentType);
  const served = await page.request.get(user.avatarUrl!);
  expect(served.ok()).toBe(true);
  await expect(page.locator(`header img[src="${user.avatarUrl}"]`)).toBeVisible();

  // Sit at a practice table: the seat shows the picture.
  await page.goto("/admin");
  await page.getByLabel("Seats").selectOption("2");
  await page.getByRole("button", { name: "Start practice table with bots" }).click();
  await page.waitForURL(/\/table\/[^/]+$/, { timeout: 30_000 });
  tableId = page.url().split("/").pop()!;
  await page.getByRole("button", { name: "Take a seat" }).click();
  await expect(page.getByLabel(new RegExp(`^Seat \\d: ${displayName} \\(you\\)`)).locator(`img[src="${user.avatarUrl}"]`).first()).toBeAttached({ timeout: 30_000 });

  // Removing it goes back to initials.
  await page.goto("/settings");
  await page.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Profile picture removed.")).toBeVisible();
  expect((await db.user.findUniqueOrThrow({ where: { email } })).avatarUrl).toBeNull();

  expect(errors).toEqual([]);
});
