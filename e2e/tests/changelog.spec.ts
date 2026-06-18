import { test, expect } from "../fixtures";
import { AppShell } from "../pages/AppShell";
import { ChangelogPage } from "../pages/ChangelogPage";

test.beforeEach(async ({ app, page }) => {
  await app();
  await new AppShell(page).go("Changelog");
});

test.describe("changelog", () => {
  test("lists the seed entry and renders its markdown body", async ({ page }) => {
    const c = new ChangelogPage(page);
    await expect(c.entry(/April 20, 2026/)).toBeVisible();
    await expect(c.article).toContainText("Seed Entry");
    await expect(c.article.getByRole("heading", { name: "New Models (seed)" })).toBeVisible();
  });

  test("renders the Run Metadata footer table", async ({ page }) => {
    const c = new ChangelogPage(page);
    await expect(c.article.getByRole("heading", { name: "Run Metadata" })).toBeVisible();
    await expect(c.article.getByRole("table")).toBeVisible();
  });
});
