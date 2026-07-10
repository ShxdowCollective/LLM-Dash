import { test, expect, waitForAppReady, FROZEN_TIME } from "../fixtures";
import { installApiMocks } from "../mocks/api";
import { AppShell } from "../pages/AppShell";
import { ModelsPage } from "../pages/ModelsPage";
import { PERMALINK_MODEL_ID, PERMALINK_MODEL_NAME, SPARKLINE_MODEL } from "../seed-constants";

test.describe("P2 — permalink", () => {
  test("deep-link inspects a model in the detail rail", async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await installApiMocks(page, {});
    await page.goto(`/#models/list?m=${PERMALINK_MODEL_ID}`);
    await waitForAppReady(page);
    const m = new ModelsPage(page);
    await expect(m.detailRail).toBeVisible();
    await expect(m.detailRail).toContainText(PERMALINK_MODEL_NAME);
  });

  test("permalink hash is preserved on boot", async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await installApiMocks(page, {});
    await page.goto(`/#models/list?m=${PERMALINK_MODEL_ID}`);
    await waitForAppReady(page);
    await expect(page).toHaveURL(new RegExp(`m=${PERMALINK_MODEL_ID}`));
  });

  test("hash changes re-apply the inspected model", async ({ app, page }) => {
    await app();
    await page.evaluate((id) => { location.hash = `#models/list?m=${id}`; }, PERMALINK_MODEL_ID);
    const m = new ModelsPage(page);
    await expect(m.detailRail).toContainText(PERMALINK_MODEL_NAME);
  });

  test("copy link writes a model permalink", async ({ app, context, page }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await app();
    const m = new ModelsPage(page);
    await m.open(PERMALINK_MODEL_NAME);
    await m.detailRail.getByRole("button", { name: "Copy link" }).click();
    await expect(page.getByTestId("toast")).toContainText("Permalink copied");
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toContain(`#models/list?m=${PERMALINK_MODEL_ID}`);
  });

  test("inspected model persists across fresh navigation", async ({ app, page }) => {
    await app();
    const m = new ModelsPage(page);
    await m.open(PERMALINK_MODEL_NAME);
    await page.goto("/");
    await waitForAppReady(page);
    await expect(m.detailRail).toContainText(PERMALINK_MODEL_NAME);
  });
});

test.describe("P2 — permalink mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("deep-link opens the Model details drawer on mobile", async ({ page }) => {
    await page.clock.setFixedTime(FROZEN_TIME);
    await installApiMocks(page, {});
    await page.goto(`/#models/list?m=${PERMALINK_MODEL_ID}`);
    await waitForAppReady(page);
    const drawer = page.getByRole("dialog", { name: "Model details" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText(PERMALINK_MODEL_NAME);
  });
});

test.describe("P2 — table presets", () => {
  test.beforeEach(async ({ app, page }) => {
    await app();
    await new AppShell(page).subpage("Table").click();
  });

  test("column hide persists across reload", async ({ page }) => {
    const m = new ModelsPage(page);
    await expect(m.tableHeader("Intel")).toBeVisible();
    await m.openColumnsMenu();
    await m.toggleColumn("Intel");
    await expect(m.tableHeader("Intel")).toHaveCount(0);
    await page.keyboard.press("Escape");
    await page.reload();
    await page.locator("#app:not([data-booting])").waitFor({ state: "attached" });
    await page.goto("/#models/table");
    await page.locator("#app:not([data-booting])").waitFor({ state: "attached" });
    await expect(m.tableHeader("Intel")).toHaveCount(0);
  });

  test("frontier toggle narrows rows to the Pareto set", async ({ page }) => {
    const m = new ModelsPage(page);
    const before = await m.rows().count();
    const label = await m.frontierToggle.textContent();
    const frontierN = Number(label?.match(/(\d+)/)?.[1]);
    expect(frontierN).toBeGreaterThan(0);
    expect(frontierN).toBeLessThan(before);
    await m.frontierToggle.click();
    await expect(m.frontierToggle).toHaveAttribute("aria-pressed", "true");
    await expect(m.rows()).toHaveCount(frontierN);
  });
});

test.describe("P2 — pinned compare", () => {
  test.beforeEach(async ({ app }) => {
    await app();
  });

  test("pinned models stay visible under a conflicting filter", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.compare("GPT-5.4");
    await m.compare("Gemini 3.1 Pro");
    await expect(m.compareTray).toBeVisible();
    await m.pinCompared.check();
    await m.search.fill("claude");
    await expect(m.row("GPT-5.4")).toBeVisible();
    await expect(m.row("Gemini 3.1 Pro")).toBeVisible();
    await expect(m.row("GPT-5.4")).toHaveClass(/is-pinned/);
    await expect(m.row("Gemini 3.1 Pro")).toHaveClass(/is-pinned/);
    const names = await m.rows().evaluateAll((rows) => rows.map((r) => r.getAttribute("data-model")));
    expect(names.slice(0, 2)).toEqual(["GPT-5.4", "Gemini 3.1 Pro"]);
  });
});

test.describe("P2 — detail rail sparklines", () => {
  test.beforeEach(async ({ app }) => {
    await app();
  });

  test("history-enriched model shows sparkline and delta chips", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.open(SPARKLINE_MODEL);
    await expect(m.detailRail).toContainText(SPARKLINE_MODEL);
    await expect(m.detailRail.locator(".stat-spark")).toHaveCount(5);
    await expect(m.detailRail.locator(".stat-bar-delta")).not.toHaveCount(0);
  });
});
