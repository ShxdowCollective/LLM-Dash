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
  readonly columnsBtn: Locator;
  readonly columnsMenu: Locator;
  readonly frontierToggle: Locator;
  readonly compareTray: Locator;
  readonly pinCompared: Locator;

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
    this.columnsBtn = page.getByRole("button", { name: "Columns", exact: true });
    this.columnsMenu = page.locator(".columns-pop");
    this.frontierToggle = page.getByRole("button", { name: /^Frontier · \d+$/ });
    this.compareTray = page.getByRole("region", { name: "Compare selection" });
    this.pinCompared = this.compareTray.getByRole("checkbox", { name: "Pin compared" });
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
    const checkbox = this.row(model).first().getByRole("checkbox");
    if (!(await checkbox.isChecked())) await checkbox.check();
  }

  tableHeader(label: string) {
    return this.page.locator("table.models thead").getByRole("columnheader", { name: label, exact: true });
  }

  async openColumnsMenu() {
    await this.columnsBtn.click();
    await this.columnsMenu.waitFor({ state: "visible" });
  }

  async toggleColumn(label: string) {
    await this.columnsMenu.getByRole("checkbox", { name: label }).click();
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
