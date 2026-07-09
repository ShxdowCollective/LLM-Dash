import { test, expect } from "../fixtures";
import { SetupWizard } from "../pages/SetupWizard";
import { ModelsPage } from "../pages/ModelsPage";

// A provider that reads as fully configured, so the wizard's step gates open.
const CONFIGURED_PROVIDER = {
  has_provider: true,
  base_url: "https://api.example.test",
  default_model: "e2e-model-a",
  backup_model: "",
  endpoint_mode: "root",
  request_headers: {},
  provider_configured: true,
  aa_configured: false,
  llmstats_configured: false,
  exa_configured: false,
  auth: { configured: true },
};

test.describe("setup wizard", () => {
  test("setup mode shows the progress rail with every step", async ({ app, page }) => {
    await app({ query: "?setup=1", skipReady: true });
    const w = new SetupWizard(page);
    await expect(w.progress).toBeVisible();
    for (const label of ["Connection", "Model", "Research", "Catalog", "Seed", "Done"]) {
      await expect(w.stepLabel(label)).toBeVisible();
    }
  });

  test("catalog step lists seed sources after connecting (T6 path)", async ({ app, page }) => {
    await app({
      query: "?setup=1",
      skipReady: true,
      mocks: { "GET /api/provider": CONFIGURED_PROVIDER, "POST /api/provider": CONFIGURED_PROVIDER },
    });
    const w = new SetupWizard(page);
    await expect(w.baseUrl).toBeVisible();
    await w.completeConnection();
    await w.completeModel();
    await w.continueButton().click(); // Research step is optional
    await expect(w.seedSources()).toBeVisible();
    await expect(w.seedSource("OpenRouter")).toBeVisible();
    await expect(w.seedCatalogBtn()).toBeVisible();
  });

  // T6: the real linear flow — connect → model → seed a source → wait for the
  // mocked seed to succeed → open the dashboard and assert the catalog renders.
  test("linear flow seeds a source and opens the dashboard with rows", async ({ app, page }) => {
    await app({
      query: "?setup=1",
      skipReady: true,
      mocks: { "GET /api/provider": CONFIGURED_PROVIDER, "POST /api/provider": CONFIGURED_PROVIDER },
    });
    const w = new SetupWizard(page);

    await expect(w.baseUrl).toBeVisible();
    await w.completeConnection();
    await w.completeModel();
    await w.continueButton().click(); // Research

    await expect(w.seedSources()).toBeVisible();
    await w.seedSource("OpenRouter").click();
    await w.seedCatalogBtn().click();

    // Mocked seed job completes -> "Catalog seeded" with the "Let's start!" CTA.
    await expect(w.letsStartBtn()).toBeVisible({ timeout: 15_000 });
    await w.letsStartBtn().click();

    // Setup hands off to the Models dashboard, which renders the seeded catalog.
    const m = new ModelsPage(page);
    await expect(m.rows().first()).toBeVisible({ timeout: 20_000 });
    expect(await m.rows().count()).toBeGreaterThan(0);
  });
});
