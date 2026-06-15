import { type Page, type Locator } from "@playwright/test";

/** Models area: List / Table / Chart subpages, filters, compare, detail rail. */
export class ModelsPage {
  readonly page: Page;
  readonly search: Locator;
  readonly filtersBtn: Locator;
  readonly exportBtn: Locator;
  readonly sort: Locator;
  readonly detailRail: Locator;
  readonly xAxis: Locator;
  readonly yAxis: Locator;
  readonly chartModes: Locator;

  constructor(page: Page) {
    this.page = page;
    this.search = page.getByRole("searchbox", { name: "Search models" });
    this.filtersBtn = page.getByRole("button", { name: "Filters" });
    this.exportBtn = page.getByRole("button", { name: "Export CSV" });
    this.sort = page.getByRole("combobox", { name: "Sort" });
    this.detailRail = page.locator("#detail-rail");
    this.xAxis = page.getByRole("combobox", { name: "X axis" });
    this.yAxis = page.getByRole("combobox", { name: "Y axis" });
    this.chartModes = page.getByRole("group", { name: "Chart mode" });
  }

  /** All rendered model rows (list or table) and mobile cards. */
  rows() {
    return this.page.getByTestId("model-row");
  }
  cards() {
    return this.page.getByTestId("model-card");
  }
  row(model: string) {
    return this.page.locator(`[data-testid="model-row"][data-model="${model}"]`);
  }

  async open(model: string) {
    await this.row(model).first().click();
  }
  async compare(model: string) {
    await this.row(model).first().getByRole("checkbox").check();
  }

  scatterMode() {
    return this.chartModes.getByRole("button", { name: "Scatter" });
  }
  radarMode() {
    return this.chartModes.getByRole("button", { name: "Radar" });
  }
  chartImage() {
    return this.page.getByRole("img", { name: /plot$/ });
  }
  providerFilter(vendor: string) {
    return this.page.getByRole("group", { name: "Filter by provider" }).getByRole("button", { name: vendor, exact: true });
  }
}
