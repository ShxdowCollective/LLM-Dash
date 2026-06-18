import { test as base, expect, type Page } from "@playwright/test";
import { installApiMocks, type MockOverrides } from "./mocks/api";

// Frozen wall-clock so relative timestamps (freshness chip, "Xd ago") render
// identically every run. Anchored after the seed date (2026-04-20) so age math
// is stable. Timers keep running — only Date is fixed.
export const FROZEN_TIME = new Date("2026-06-14T12:00:00Z");

export type AppOptions = {
  /** query string appended to "/", e.g. "?setup=1". Default: none. */
  query?: string;
  /** extra/override API mocks for this test. */
  mocks?: MockOverrides;
  /** skip waiting for the dashboard to finish booting (e.g. wizard/empty states). */
  skipReady?: boolean;
};

/** Wait until the SPA has finished its initial sql.js boot. */
export async function waitForAppReady(page: Page): Promise<void> {
  await page.locator("#app:not([data-booting])").waitFor({ state: "attached", timeout: 20_000 });
  await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
}

type Fixtures = {
  app: (opts?: AppOptions) => Promise<Page>;
};

export const test = base.extend<Fixtures>({
  app: async ({ page }, use) => {
    const open = async (opts: AppOptions = {}) => {
      await page.clock.setFixedTime(FROZEN_TIME);
      await installApiMocks(page, opts.mocks ?? {});
      await page.goto("/" + (opts.query ?? ""));
      if (!opts.skipReady) await waitForAppReady(page);
      return page;
    };
    await use(open);
  },
});

export { expect };
