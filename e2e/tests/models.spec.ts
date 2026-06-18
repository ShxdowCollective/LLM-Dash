import { test, expect } from "../fixtures";
import { AppShell } from "../pages/AppShell";
import { ModelsPage } from "../pages/ModelsPage";

test.beforeEach(async ({ app }) => {
  await app();
});

test.describe("models — list", () => {
  test("renders the full seeded catalog", async ({ page }) => {
    const m = new ModelsPage(page);
    await expect(m.rows()).toHaveCount(34);
    await expect(m.row("Gemini 3.1 Pro")).toBeVisible();
  });

  test("search narrows the list", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.search.fill("claude");
    await expect(async () => {
      const n = await m.rows().count();
      expect(n).toBeGreaterThan(0);
      expect(n).toBeLessThan(34);
    }).toPass();
    await expect(m.row("GPT-5.4")).toHaveCount(0);
  });

  test("empty filter shows the empty state", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.search.fill("zzz-no-such-model-zzz");
    await expect(page.getByText("No models match this view")).toBeVisible();
  });

  test("sort changes ordering", async ({ page }) => {
    const m = new ModelsPage(page);
    const first = () => m.rows().first().getAttribute("data-model");
    const before = await first();
    await m.sort.selectOption({ label: "Speed" });
    await expect(async () => expect(await first()).not.toBe(before)).toPass();
  });

  test("opening a row populates the detail rail", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.open("GPT-5.4");
    await expect(m.detailRail).toBeVisible();
    await expect(m.detailRail).toContainText("GPT-5.4");
  });

  test("compare checkbox stacks a model", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.compare("GPT-5.4");
    await expect(m.row("GPT-5.4").getByRole("checkbox")).toBeChecked();
  });

  test("export CSV with no rows toasts", async ({ page }) => {
    const m = new ModelsPage(page);
    await m.search.fill("zzz-no-such-model-zzz");
    await m.exportBtn.click();
    await expect(page.getByTestId("toast")).toBeVisible();
  });
});

test.describe("models — table", () => {
  test("table subpage shows rows", async ({ page }) => {
    const shell = new AppShell(page);
    const m = new ModelsPage(page);
    await shell.subpage("Table").click();
    await expect(m.rows().first()).toBeVisible();
    await expect(m.rows()).toHaveCount(34);
  });
});

test.describe("models — mobile", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("list renders model rows responsively", async ({ page }) => {
    const m = new ModelsPage(page);
    await expect(m.rows().first()).toBeVisible();
    await expect(m.rows()).toHaveCount(34);
  });
  test("table subpage renders mobile cards", async ({ page }) => {
    const shell = new AppShell(page);
    const m = new ModelsPage(page);
    await shell.subpage("Table").click();
    await expect(m.cards().first()).toBeVisible();
  });
});
