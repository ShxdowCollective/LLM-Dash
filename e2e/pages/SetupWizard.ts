import { type Page, type Locator } from "@playwright/test";

export type WizardStep = "Connection" | "Agent model" | "Research" | "Catalog" | "Seed" | "Finish";

/** First-run setup wizard (?setup=1): Connection → … → Seed → Finish. */
export class SetupWizard {
  readonly page: Page;
  readonly steps: Locator;

  constructor(page: Page) {
    this.page = page;
    this.steps = page.getByRole("navigation", { name: "Setup steps" });
  }

  step(name: WizardStep) {
    return this.steps.getByRole("button", { name, exact: true });
  }
  async go(name: WizardStep) {
    await this.step(name).click();
  }

  // Catalog step
  seedSources() {
    return this.page.getByRole("tablist", { name: "Seed sources" });
  }
  seedSource(name: string) {
    return this.seedSources().getByRole("tab", { name: new RegExp(name) });
  }
  seedCatalogBtn() {
    return this.page.getByRole("button", { name: "Seed catalog" });
  }
  // Finish step
  openDashboardBtn() {
    return this.page.getByRole("button", { name: "Open Models dashboard" });
  }
}
