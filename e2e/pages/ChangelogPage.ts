import { type Page, type Locator } from "@playwright/test";

/** Changelog area: date list + rendered Markdown body + structured run details. */
export class ChangelogPage {
  readonly page: Page;
  readonly article: Locator;
  readonly runDetails: Locator;
  readonly runDetailsTitle: Locator;
  readonly runDetailsGrid: Locator;

  constructor(page: Page) {
    this.page = page;
    this.article = page.getByRole("article");
    this.runDetails = this.article.locator(".changelog-meta");
    this.runDetailsTitle = this.runDetails.getByRole("heading", { name: "Run details" });
    this.runDetailsGrid = this.runDetails.locator("dl.changelog-meta-grid");
  }

  /** Date-entry buttons in the list (e.g. matching /Apr 20/). */
  entries() {
    return this.page.locator("#content-body").getByRole("button");
  }
  entry(label: string | RegExp) {
    return this.page.getByRole("button", { name: label });
  }

  runDetailTerm(name: string) {
    return this.runDetailsGrid.locator("dt", { hasText: name });
  }
  runDetailValue(name: string) {
    return this.runDetailsGrid.locator(".changelog-meta-item", { has: this.page.locator("dt", { hasText: name }) }).locator("dd");
  }
}
