import { type Page, type Locator } from "@playwright/test";

export type SettingsTab = "Connection" | "Models" | "Research" | "Schedule" | "Reset";
export type ResetScope = "stats" | "changelog" | "models" | "full";

// Sub-nav tab label -> the <h2> region heading it reveals (they differ for Models).
const TAB_HEADING: Record<SettingsTab, string> = {
  Connection: "Connection",
  Models: "Agent model",
  Research: "Research",
  Schedule: "Schedule",
  Reset: "Reset",
};

const RESET_TOKEN: Record<ResetScope, string> = {
  stats: "STATS",
  changelog: "CHANGELOG",
  models: "MODELS",
  full: "RESET",
};

/** Settings area: Connection / Models / Research / Schedule / Reset subpages. */
export class SettingsPage {
  readonly page: Page;
  readonly subnav: Locator;
  // Connection
  readonly baseUrl: Locator;
  readonly endpointMode: Locator;
  readonly testConnection: Locator;
  readonly saveConnection: Locator;
  readonly manualPrompt: Locator;
  // Schedule
  readonly cadence: Locator;
  readonly saveSchedule: Locator;

  constructor(page: Page) {
    this.page = page;
    this.subnav = page.getByRole("navigation", { name: "Sub-pages" });
    this.baseUrl = page.getByRole("textbox", { name: "Base URL" });
    this.endpointMode = page.getByRole("combobox", { name: "Endpoint mode" });
    this.testConnection = page.getByRole("button", { name: "Test connection" });
    this.saveConnection = page.getByRole("button", { name: "Save connection" });
    this.manualPrompt = page.getByRole("button", { name: "Manual prompt" });
    this.cadence = page.getByRole("combobox", { name: "Cadence" });
    this.saveSchedule = page.getByRole("button", { name: "Save schedule" });
  }

  tab(name: SettingsTab) {
    return this.subnav.getByRole("button", { name, exact: true });
  }
  async open(name: SettingsTab) {
    await this.tab(name).click();
    await this.page.getByRole("heading", { level: 2, name: TAB_HEADING[name] }).first().waitFor();
  }
  region(name: string) {
    // exact so "Connection" doesn't also match the nested "Connection credential".
    return this.page.getByRole("region", { name, exact: true });
  }

  // Reset subpage: each card has a unique confirm textbox + a data-scope button.
  resetConfirm(scope: ResetScope) {
    return this.page.getByRole("textbox", { name: new RegExp(`Type ${RESET_TOKEN[scope]} to confirm`) });
  }
  resetButton(scope: ResetScope) {
    return this.page.locator(`.reset-run-btn[data-scope="${scope}"]`);
  }
  async typeResetToken(scope: ResetScope) {
    await this.resetConfirm(scope).fill(RESET_TOKEN[scope]);
  }
}
