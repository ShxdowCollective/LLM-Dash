import { test, expect } from "../fixtures";
import AxeBuilder from "@axe-core/playwright";
import { AppShell } from "../pages/AppShell";
import { ChangelogPage } from "../pages/ChangelogPage";

const AREAS = ["Models", "Changelog", "Stats", "Settings"] as const;

// Every area must be free of serious/critical WCAG 2A/2AA violations. (The
// dark-theme color-contrast and clickable-row nested-interactive issues found
// during the initial build were fixed: small labels use --vw-text-muted, and
// model rows are focusable containers rather than buttons wrapping the checkbox.)
async function scan(page: any) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  return results.violations.filter((v: any) => ["serious", "critical"].includes(v.impact));
}

for (const area of AREAS) {
  test(`a11y: ${area} has no serious/critical violations`, async ({ app, page }) => {
    await app();
    if (area !== "Models") await new AppShell(page).go(area);
    if (area === "Changelog") {
      const c = new ChangelogPage(page);
      await c.entry(/April 20, 2026/).click();
      await expect(c.runDetailsTitle).toBeVisible();
    }
    const violations = await scan(page);
    expect(
      violations,
      violations.map((v: any) => `${v.id} (×${v.nodes.length}): ${v.help}`).join("\n"),
    ).toEqual([]);
  });
}

test("skip link is the first focusable element", async ({ app, page }) => {
  await app();
  await page.keyboard.press("Tab");
  await expect(page.locator(".vw-skip-link")).toBeFocused();
});

test("tablet-portrait drawer nav keeps accessible names", async ({ app, page }) => {
  // Guards the regression where voidware's 768–1024 icon-only rail stripped the
  // open drawer's nav labels, leaving buttons with no accessible name.
  await page.setViewportSize({ width: 768, height: 1024 });
  await app();
  await new AppShell(page).openDrawer();
  await expect(
    page.locator("#sidebar").getByRole("button", { name: "Settings", exact: true }),
  ).toBeVisible();
  const violations = await scan(page);
  expect(violations.map((v: any) => v.id).join(", ")).toBe("");
});
