import { test, expect } from "../fixtures";
import { AppShell } from "../pages/AppShell";
import { ChangelogPage } from "../pages/ChangelogPage";

// T7 (locks C5): changelog markdown is sanitized (DOMPurify) before innerHTML,
// so an injected <script>/onerror/javascript: URL can never execute in the
// dashboard origin. We swap the changelog body file for a hostile payload.
test.describe("security — changelog XSS is neutralized", () => {
  const MALICIOUS = [
    "# Update",
    "",
    "<img src=x onerror=\"window.__xss = (window.__xss||0)+1\">",
    "<script>window.__xss = (window.__xss||0)+1</script>",
    "",
    "[totally safe link](javascript:window.__xss=(window.__xss||0)+1)",
    "",
    "Normal changelog prose.",
  ].join("\n");

  test("scripts, event handlers, and javascript: URLs are stripped", async ({ app, page }) => {
    // Serve the hostile payload for the changelog body fetch (/changelogs/*.md).
    await page.route("**/changelogs/**", (route) =>
      route.fulfill({ status: 200, contentType: "text/markdown", body: MALICIOUS }),
    );
    // Fail loudly if any injected handler ever runs.
    await page.exposeFunction("__reportXss", () => {});

    await app();
    await new AppShell(page).go("Changelog");

    const c = new ChangelogPage(page);
    await expect(c.article).toContainText("Normal changelog prose.");

    // No injected payload executed.
    expect(await page.evaluate(() => (window as any).__xss)).toBeUndefined();

    // Dangerous nodes/attributes were removed from the rendered body.
    await expect(c.article.locator("script")).toHaveCount(0);
    const html = await c.article.innerHTML();
    expect(html).not.toContain("onerror");
    expect(html.toLowerCase()).not.toContain("javascript:");
  });
});
