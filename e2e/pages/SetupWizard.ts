import { type Page, type Locator } from "@playwright/test";

export type WizardStep = "Connection" | "Agent model" | "Research" | "Catalog" | "Seed" | "Finish";

/**
 * First-run setup wizard (?setup=1). The wizard is a LINEAR flow: each step is
 * advanced with a "Save & continue"/"Continue" button; completed steps can be
 * revisited via their numbered dots. The progress rail is labelled "Setup
 * progress" (a div, not a <nav>).
 */
export class SetupWizard {
  readonly page: Page;
  readonly progress: Locator;
  readonly baseUrl: Locator;

  constructor(page: Page) {
    this.page = page;
    this.progress = page.locator('[aria-label="Setup progress"]');
    this.baseUrl = page.getByRole("textbox", { name: "Base URL" });
  }

  /** A step label chip in the progress rail (e.g. "Connection", "Catalog"). */
  stepLabel(text: string) {
    return this.progress.getByText(text, { exact: true });
  }

  saveAndContinue() {
    return this.page.getByRole("button", { name: "Save & continue" });
  }
  continueButton() {
    return this.page.getByRole("button", { name: "Continue", exact: true });
  }

  // Catalog step
  seedSources() {
    return this.page.getByRole("tablist", { name: "Catalog sources" });
  }
  seedSource(name: string) {
    return this.seedSources().getByRole("tab", { name: new RegExp(name) });
  }
  seedCatalogBtn() {
    return this.page.getByRole("button", { name: "Seed catalog" });
  }

  // Seed-complete / Finish
  letsStartBtn() {
    return this.page.getByRole("button", { name: "Let's start!" });
  }
  openDashboardBtn() {
    return this.page.getByRole("button", { name: "Open dashboard" });
  }

  /** The default-model picker (its label is a <span>, not associated), by field. */
  defaultModelField() {
    return this.page.locator(".model-field").filter({ hasText: "Default model" });
  }

  /** Fill the Connection step's base URL and advance (provider is mocked-configured). */
  async completeConnection(baseUrl = "https://api.example.test") {
    await this.baseUrl.fill(baseUrl);
    await this.saveAndContinue().click();
  }

  /** Set a default model whether the picker rendered as a <select> or an input. */
  async completeModel(model = "e2e-model-a") {
    const field = this.defaultModelField();
    await field.locator("select.model-picker-select, input.model-picker-input").first().waitFor();
    const select = field.locator("select.model-picker-select");
    if (await select.count()) await select.selectOption({ index: 1 });
    else await field.locator("input.model-picker-input").fill(model);
    await this.saveAndContinue().click();
  }
}
