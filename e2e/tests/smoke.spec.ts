import { test, expect } from "../fixtures";

test.describe("smoke", () => {
  test("dashboard boots, loads the seeded catalog, and has no console errors", async ({ app, page }) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(String(e)));

    await app();

    // Brand + primary nav present.
    await expect(page.getByRole("heading", { name: "LLM-Dash", level: 1 })).toBeVisible();
    await expect(page.getByRole("button", { name: "Models" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Changelog" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Stats" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Settings" })).toBeVisible();

    // sql.js loaded the 34-model seed — at least one model row rendered.
    await expect(page.locator("#content-body")).not.toBeEmpty();

    expect(errors, `console/page errors:\n${errors.join("\n")}`).toEqual([]);
  });
});
