import { type Page, type Locator } from "@playwright/test";

/** Stats area: telemetry cards, agent/range filters, trend bars. */
export class StatsPage {
  readonly page: Page;
  readonly agent: Locator;
  readonly range: Locator;
  readonly cards: Locator;

  constructor(page: Page) {
    this.page = page;
    this.agent = page.getByRole("combobox", { name: "Agent" });
    this.range = page.getByRole("combobox", { name: "Range" });
    this.cards = page.locator("#content-body").getByRole("article");
  }

  card(label: string) {
    return this.cards.filter({ hasText: label });
  }
}
