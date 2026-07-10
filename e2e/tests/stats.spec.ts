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
    await expect(s.card("Runs")).toContainText("3");
    await expect(s.card("Cost")).toBeVisible();
    await expect(s.card("Words")).toContainText("1,404");
  });

  test("agent and range filters are present and apply", async ({ page }) => {
    const s = new StatsPage(page);
    await expect(s.agent).toBeVisible();
    await expect(s.range).toBeVisible();
    // Under a frozen 2026-06-14 clock a 7-day window has no runs. Prove the
    // filter replaces the charts with the explicit zero state.
    await s.range.selectOption({ label: "Last 7 days" });
    await expect(s.range).toBeVisible();
    await expect(page.getByRole("heading", { name: "No telemetry matches this view" })).toBeVisible();
    await expect(s.trendCharts()).toHaveCount(0);
  });

  test("renders uPlot trend charts for three runs", async ({ page }) => {
    const s = new StatsPage(page);
    for (const title of ["Run duration", "Cost per run", "Total tokens"]) {
      const chart = s.trendChart(title);
      await expect(chart).toBeVisible();
      await expect(chart).toHaveAttribute("role", "img");
      await expect(chart).toHaveAttribute("aria-label", new RegExp(`${title} trend across 3 runs`, "i"));
      await expect(chart.locator("canvas")).toHaveCount(1);
    }
    await expect(s.trendCharts()).toHaveCount(3);
  });

  test("renders the agent leaderboard with enriched runs", async ({ page }) => {
    const s = new StatsPage(page);
    await expect(s.leaderboard).toBeVisible();
    await expect(s.leaderboard.locator(".leader-row")).toHaveCount(3);
    await expect(s.leaderboard).toContainText("Claude Code");
  });
});
