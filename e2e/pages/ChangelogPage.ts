import { type Page, type Locator } from "@playwright/test";

/** Changelog area: date list + rendered Markdown body. */
export class ChangelogPage {
  readonly page: Page;
  readonly article: Locator;

  constructor(page: Page) {
    this.page = page;
    this.article = page.getByRole("article");
  }

  /** Date-entry buttons in the list (e.g. matching /Apr 20/). */
  entries() {
    return this.page.locator("#content-body").getByRole("button");
  }
  entry(label: string | RegExp) {
    return this.page.getByRole("button", { name: label });
  }
}
