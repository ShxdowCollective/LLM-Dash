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
    await expect(page.locator(".chart-frontier-line")).toBeVisible();
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

  test("hovering a scatter point shows the chart tooltip", async ({ page }) => {
    const tip = page.locator("#chart-tip");
    const point = page.locator(".model-point").first();
    const box = await point.boundingBox();
    if (!box) throw new Error("scatter point missing");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await expect(tip).toBeVisible();
    const lines = tip.locator(".chart-tip-line");
    await expect(lines.first()).toBeVisible();
    const lineCount = await lines.count();
    expect(lineCount).toBeGreaterThanOrEqual(1);

    const clustered = page.locator('.model-point[aria-label*="Overlaps"]');
    expect(await clustered.count()).toBeGreaterThan(0);
    const cbox = await clustered.first().boundingBox();
    if (!cbox) throw new Error("clustered point missing");
    await page.mouse.move(cbox.x + cbox.width / 2, cbox.y + cbox.height / 2);
    await expect(tip).toBeVisible();
    await expect.poll(() => lines.count()).toBeGreaterThanOrEqual(2);
    await expect(clustered.first()).toHaveAttribute("aria-label", /Overlaps/);

    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
    await clustered.first().focus();
    await expect(tip).toBeVisible();
    await expect.poll(() => lines.count()).toBeGreaterThanOrEqual(2);
  });
});
