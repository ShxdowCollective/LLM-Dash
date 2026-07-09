import { test, expect } from "../fixtures";
import { AppShell } from "../pages/AppShell";
import { SettingsPage } from "../pages/SettingsPage";

test.beforeEach(async ({ app, page }) => {
  await app();
  await new AppShell(page).go("Settings");
});

test.describe("settings — subpages render", () => {
  const tabs = ["Connection", "Models", "Research", "Schedule", "Reset"] as const;
  for (const tab of tabs) {
    test(`${tab} subpage opens`, async ({ page }) => {
      const s = new SettingsPage(page);
      await s.open(tab);
    });
  }
});

test.describe("settings — connection", () => {
  test("starts unconfigured and never leaks a real key", async ({ page }) => {
    const s = new SettingsPage(page);
    await s.open("Connection");
    await expect(s.region("Connection")).toContainText("Add a provider");
    await expect(s.region("Connection")).not.toContainText("opencode.ai");
  });

  test("test connection succeeds (mocked)", async ({ page }) => {
    const s = new SettingsPage(page);
    await s.open("Connection");
    await s.baseUrl.fill("https://example.test");
    await s.testConnection.click();
    await expect(page.getByTestId("toast")).toBeVisible();
  });
});

test.describe("settings — schedule", () => {
  test("saving a cadence (mocked) confirms", async ({ page }) => {
    const s = new SettingsPage(page);
    await s.open("Schedule");
    await s.cadence.selectOption({ label: "Daily" });
    await s.saveSchedule.click();
    await expect(page.getByTestId("toast")).toBeVisible();
  });
});

test.describe("settings — credential slot (T5)", () => {
  test("saving a provider API key confirms (mocked)", async ({ page }) => {
    const s = new SettingsPage(page);
    await s.open("Connection");
    // Fresh slot defaults to the "select saved key" mode; switch to entering a new key.
    await page.getByLabel("Source").selectOption("__new__");
    await page.getByLabel("API key", { exact: true }).fill("sk-e2e-test-key");
    await page.getByRole("button", { name: "Save new key" }).click();
    const toast = page.getByTestId("toast");
    await expect(toast).toBeVisible();
    await expect(toast).toContainText(/saved/i);
  });
});

test.describe("settings — reset scopes (T9)", () => {
  const scopes = ["stats", "changelog", "models", "full"] as const;
  for (const scope of scopes) {
    test(`${scope} reset runs and confirms (mocked)`, async ({ page }) => {
      const s = new SettingsPage(page);
      await s.open("Reset");
      await expect(s.resetButton(scope)).toBeDisabled();
      await s.typeResetToken(scope);
      await expect(s.resetButton(scope)).toBeEnabled();
      await s.resetButton(scope).click();
      await expect(page.getByTestId("toast")).toBeVisible();
    });
  }
});

test.describe("settings — reset gating", () => {
  test("reset button is disabled until the exact token is typed", async ({ page }) => {
    const s = new SettingsPage(page);
    await s.open("Reset");
    await expect(s.resetButton("stats")).toBeDisabled();
    await s.typeResetToken("stats");
    await expect(s.resetButton("stats")).toBeEnabled();
  });

  test("running a (mocked) stats reset confirms", async ({ page }) => {
    const s = new SettingsPage(page);
    await s.open("Reset");
    await s.typeResetToken("stats");
    await s.resetButton("stats").click();
    await expect(page.getByTestId("toast")).toBeVisible();
  });
});
