import { test, expect } from "../fixtures";
import { AppShell } from "../pages/AppShell";

// Dynamic, clock-relative chrome is masked so only structural/visual change
// trips the diff. Clock is already frozen by the fixture; masking is belt-and-
// suspenders.
function masks(page: any) {
  return { mask: [page.locator("#freshness")] };
}

const BREAKPOINTS = [
  { name: "wide", width: 2560, height: 1440 },
  { name: "desktop", width: 1440, height: 900 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "mobile", width: 390, height: 844 },
] as const;

// Surfaces captured at every breakpoint. Each opener returns with the surface
// ready for a stable full-viewport screenshot.
const SURFACES: { name: string; open: (page: any, app: any) => Promise<void> }[] = [
  { name: "models-list", open: async (_p, app) => { await app(); } },
  {
    name: "models-table",
    open: async (page, app) => { await app(); await new AppShell(page).subpage("Table").click(); },
  },
  {
    name: "models-chart",
    open: async (page, app) => { await app(); await new AppShell(page).subpage("Chart").click(); },
  },
  {
    name: "changelog",
    open: async (page, app) => { await app(); await new AppShell(page).go("Changelog"); },
  },
  {
    name: "stats",
    open: async (page, app) => { await app(); await new AppShell(page).go("Stats"); },
  },
  {
    name: "settings",
    open: async (page, app) => { await app(); await new AppShell(page).go("Settings"); },
  },
  {
    name: "wizard",
    open: async (page, app) => {
      await app({ query: "?setup=1", skipReady: true });
      await page.getByRole("navigation", { name: "Setup steps" }).waitFor();
    },
  },
];

for (const bp of BREAKPOINTS) {
  test.describe(`visual — ${bp.name} (${bp.width}×${bp.height})`, () => {
    test.use({ viewport: { width: bp.width, height: bp.height } });
    for (const s of SURFACES) {
      test(s.name, async ({ app, page }) => {
        await s.open(page, app);
        await expect(page).toHaveScreenshot(`${s.name}-${bp.name}.png`, masks(page));
      });
    }
  });
}
