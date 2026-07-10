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
    await c.entry(/April 20, 2026/).click();
    await expect(c.entry(/April 20, 2026/)).toBeVisible();
    await expect(c.article).toContainText("Seed Entry");
    await expect(c.article.getByRole("heading", { name: "New Models (seed)" })).toBeVisible();
  });

  test("renders structured Run details from run_metrics", async ({ page }) => {
    const c = new ChangelogPage(page);
    await c.entry(/April 20, 2026/).click();
    await expect(c.runDetailsTitle).toBeVisible();
    await expect(c.runDetailTerm("Agent")).toBeVisible();
    await expect(c.runDetailValue("Agent")).toHaveText("bootstrap");
    await expect(c.runDetailTerm("Runtime")).toBeVisible();
    await expect(c.runDetailValue("Runtime")).toHaveText("init-script");
    await expect(c.runDetailTerm("Words")).toBeVisible();
    await expect(c.runDetailValue("Words")).toHaveText("604");
    // Redesigned panel strips the markdown "## Run Metadata" footer from the body.
    await expect(c.article.getByRole("heading", { name: "Run Metadata" })).toHaveCount(0);
    await expect(c.article.locator(".changelog-body").getByRole("table")).toHaveCount(0);
  });

  test("enriched run shows duration, tokens, and cost in Run details", async ({ page }) => {
    const c = new ChangelogPage(page);
    await c.entry(/May 1, 2026/).click();
    await expect(c.runDetailsTitle).toBeVisible();
    await expect(c.runDetailTerm("Duration")).toBeVisible();
    await expect(c.runDetailTerm("Tokens")).toBeVisible();
    await expect(c.runDetailTerm("Cost")).toBeVisible();
    await expect(c.runDetailValue("Cost")).toContainText("$0.47");
  });
});
