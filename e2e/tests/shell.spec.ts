import { test, expect } from "../fixtures";
import { AppShell } from "../pages/AppShell";

test.describe("app shell", () => {
  test("navigates between all four areas", async ({ app, page }) => {
    await app();
    const shell = new AppShell(page);
    await shell.go("Models");
    await expect(shell.pageHeading("Models")).toBeVisible();
    await shell.go("Changelog");
    await expect(shell.pageHeading("Changelog")).toBeVisible();
    await shell.go("Stats");
    await expect(shell.pageHeading("Stats")).toBeVisible();
    await shell.go("Settings");
    await expect(shell.pageHeading("Settings")).toBeVisible();
  });

  test("help overlay opens and closes", async ({ app, page }) => {
    await app();
    const shell = new AppShell(page);
    const dialog = await shell.openHelp();
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText("Search models");
    await dialog.getByRole("button", { name: "Close" }).click();
    await expect(dialog).toBeHidden();
  });

  test("freshness chip shows a deterministic relative age", async ({ app, page }) => {
    await app();
    // Clock is frozen at 2026-06-14; seed is 2026-04-20 → stable "55d ago".
    await expect(page.locator("#freshness")).toHaveText(/Last update: 55d ago/);
  });

  test("without a provider, refresh prompts to add one", async ({ app, page }) => {
    await app();
    const shell = new AppShell(page);
    await shell.refresh.click();
    await expect(page.getByTestId("toast")).toContainText(/provider/i);
  });

  test("with a provider, refresh runs a (mocked) update job to completion", async ({ app, page }) => {
    // Mock a configured provider so handleRefresh opens the run dialog.
    await app({ mocks: { "GET /api/provider": { loaded: true, has_provider: true } } });
    const shell = new AppShell(page);
    await shell.refresh.click();
    const dialog = page.getByRole("dialog", { name: /Refresh run/i });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/succeeded|complete/i);
  });

  test("mobile drawer opens via hamburger", async ({ app, page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await app();
    const shell = new AppShell(page);
    await expect(shell.mobileToggle).toBeVisible();
    await shell.openDrawer();
    await expect(shell.sidebar.getByRole("button", { name: "Stats", exact: true })).toBeVisible();
  });
});
