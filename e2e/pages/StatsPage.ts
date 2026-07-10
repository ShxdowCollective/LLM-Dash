import { type Page, type Locator } from "@playwright/test";

/** Stats area: telemetry cards, agent/range filters, uPlot trend charts, leaderboard. */
export class StatsPage {
  readonly page: Page;
  readonly agent: Locator;
  readonly range: Locator;
  readonly cards: Locator;
  readonly analyticsGrid: Locator;
  readonly leaderboard: Locator;

  constructor(page: Page) {
    this.page = page;
    this.agent = page.getByRole("combobox", { name: "Agent" });
    this.range = page.getByRole("combobox", { name: "Range" });
    this.cards = page.locator("#content-body").getByRole("article");
    this.analyticsGrid = page.locator(".analytics-grid");
    this.leaderboard = page.locator(".leaderboard-list");
  }

  card(label: string) {
    return this.cards.filter({ hasText: label });
  }

  trendChart(title: string) {
    return this.page
      .locator(".panel-card")
      .filter({ has: this.page.getByRole("heading", { name: title, level: 3, exact: true }) })
      .locator(".trend-chart");
  }

  trendCharts() {
    return this.analyticsGrid.locator(".trend-chart");
  }
}
