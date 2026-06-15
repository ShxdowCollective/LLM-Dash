import { test, expect } from "../fixtures";
import { SetupWizard } from "../pages/SetupWizard";

test.describe("setup wizard", () => {
  test("setup mode shows the step rail", async ({ app, page }) => {
    await app({ query: "?setup=1", skipReady: true });
    const w = new SetupWizard(page);
    await expect(w.steps).toBeVisible();
    for (const s of ["Connection", "Agent model", "Research", "Catalog", "Seed", "Finish"]) {
      await expect(w.step(s as any)).toBeVisible();
    }
  });

  test("navigates to the Catalog step and shows seed sources", async ({ app, page }) => {
    await app({ query: "?setup=1", skipReady: true });
    const w = new SetupWizard(page);
    await w.go("Catalog");
    await expect(w.seedSources()).toBeVisible();
    await expect(w.seedSource("OpenRouter")).toBeVisible();
    await expect(w.seedCatalogBtn()).toBeVisible();
  });

  test("Finish step can open the dashboard", async ({ app, page }) => {
    await app({ query: "?setup=1", skipReady: true });
    const w = new SetupWizard(page);
    await w.go("Finish");
    await expect(w.openDashboardBtn()).toBeVisible();
  });
});
