import { type Page, type Locator, expect } from "@playwright/test";

export type Area = "Models" | "Changelog" | "Stats" | "Settings";

/** Global chrome: sidebar nav, mobile drawer, refresh, help, toast, subnav. */
export class AppShell {
  readonly page: Page;
  readonly sidebar: Locator;
  readonly content: Locator;
  readonly subnav: Locator;
  readonly refresh: Locator;
  readonly help: Locator;
  readonly freshness: Locator;
  readonly mobileToggle: Locator;
  readonly toast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.sidebar = page.locator("#sidebar");
    this.content = page.locator("#content-body");
    this.subnav = page.locator("#subpage-nav");
    this.refresh = page.locator("#refresh-trigger");
    this.help = page.getByRole("button", { name: "Keyboard shortcuts" });
    this.freshness = page.locator("#freshness");
    this.mobileToggle = page.locator("#sidebar-toggle");
    this.toast = page.getByTestId("toast");
  }

  /** Click a primary area in the sidebar (scoped to avoid subnav name clashes).
   *  At narrow widths the sidebar is off-canvas behind the drawer (it still
   *  reports "visible" to Playwright), so gate on the mobile toggle instead. */
  async go(area: Area) {
    if (await this.mobileToggle.isVisible()) await this.openDrawer();
    await this.sidebar.getByRole("button", { name: area, exact: true }).click();
    await expect(this.pageHeading(area)).toBeVisible();
  }

  pageHeading(name: string) {
    return this.page.getByRole("heading", { level: 1, name });
  }

  /** Click a subpage tab within the active area's sub-nav. */
  subpage(name: string) {
    return this.subnav.getByRole("button", { name, exact: true });
  }

  async openHelp() {
    await this.help.click();
    return this.page.getByRole("dialog", { name: "Keyboard shortcuts" });
  }

  async openDrawer() {
    await this.mobileToggle.click();
    await expect(this.sidebar).toBeVisible();
  }
}
