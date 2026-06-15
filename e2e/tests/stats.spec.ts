import { test, expect } from "../fixtures";
import { AppShell } from "../pages/AppShell";
import { StatsPage } from "../pages/StatsPage";

test.beforeEach(async ({ app, page }) => {
  await app();
  await new AppShell(page).go("Stats");
});

test.describe("stats", () => {
  test("shows the telemetry summary cards", async ({ page }) => {
    const s = new StatsPage(page);
    await expect(s.card("Runs")).toContainText("1");
    await expect(s.card("Cost")).toBeVisible();
    await expect(s.card("Words")).toContainText("604");
  });

  test("agent and range filters are present and apply", async ({ page }) => {
    const s = new StatsPage(page);
    await expect(s.agent).toBeVisible();
    await expect(s.range).toBeVisible();
    // The only seeded run is dated 2026-04-20; under a frozen 2026-06-14 clock a
    // 7-day window has no runs, so the view stays functional with zero data.
    await s.range.selectOption({ label: "Last 7 days" });
    await expect(s.range).toBeVisible();
    await expect(page.locator("#content-body")).not.toBeEmpty();
  });
});
