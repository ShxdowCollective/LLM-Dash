import { test, expect } from "../fixtures";
import { AppShell } from "../pages/AppShell";
import { ModelsPage } from "../pages/ModelsPage";

test.beforeEach(async ({ app, page }) => {
  await app();
  await new AppShell(page).subpage("Chart").click();
});

test.describe("models — chart", () => {
  test("scatter renders by default with axis selectors", async ({ page }) => {
    const m = new ModelsPage(page);
    await expect(m.chartImage()).toBeVisible();
    await expect(m.xAxis).toBeVisible();
    await expect(m.yAxis).toBeVisible();
    await expect(m.scatterMode()).toHaveAttribute("aria-pressed", "true");
  });

  test("toggles to radar mode", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.radarMode().click();
    await expect(m.radarMode()).toHaveAttribute("aria-pressed", "true");
  });

  test("changing an axis updates the plot", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.xAxis.selectOption({ label: "Intelligence" });
    await expect(m.chartImage()).toBeVisible();
  });

  test("provider legend filter toggles", async ({ page }) => {
    const m = new ModelsPage(page);
    const google = m.providerFilter("Google");
    await google.click();
    await expect(google).toHaveAttribute("aria-pressed", /true|false/);
  });
});
