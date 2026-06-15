// Failure classifier for the autonomous audit loop. Deterministic heuristics
// first (fast, explainable); ambiguous cases are flagged for LLM adjudication.
// Mirrors the App-Bug / Test-Bug / Visual / Flaky taxonomy from the research
// (sharingan, playwright-autopilot, spectra).

export const Category = {
  APP_BUG: "App-Bug",
  TEST_BUG: "Test-Bug",
  VISUAL: "Visual-Regression",
  FLAKY: "Flaky",
  MOCK_GAP: "Mock-Gap",
  UNKNOWN: "Unknown",
};

/**
 * @param {{title:string,file:string,error:string,status:string,retries:number,
 *          consoleErrors?:string[]}} f
 * @returns {{category:string,confidence:number,signal:string,target:string}}
 */
export function classify(f) {
  const err = (f.error || "").toLowerCase();
  const console = (f.consoleErrors || []).join("\n");

  // Passed only after a retry → flaky.
  if (f.status === "flaky" || (f.status === "passed" && f.retries > 0)) {
    return hit(Category.FLAKY, 0.9, "passed on retry", "test-stability");
  }

  // Visual diff.
  if (err.includes("tohavescreenshot") || err.includes("screenshot comparison") || err.includes("pixels (ratio")) {
    return hit(Category.VISUAL, 0.95, "screenshot diff", "baseline-or-style");
  }

  // Page/console runtime error surfaced by the test → app defect.
  if (console || err.includes("pageerror") || err.includes("uncaught")) {
    return hit(Category.APP_BUG, 0.85, "runtime/console error", "web/app.js");
  }

  // Unmocked or failing API surfaced as a network failure.
  if (err.includes("net::") || err.includes("/api/") && err.includes("status 5")) {
    return hit(Category.MOCK_GAP, 0.7, "api/network failure", "e2e/mocks/api.ts");
  }

  // Locator timeout / element missing → could be selector drift (test) or a
  // genuinely missing control (app). Default to LLM adjudication.
  if (err.includes("element(s) not found") || err.includes("waiting for") || err.includes("timeout")) {
    return hit(Category.UNKNOWN, 0.5, "locator/timeout — needs adjudication", "spec-or-app");
  }

  // Assertion mismatch (toContainText/toBe...) → usually a real behavior change.
  if (err.includes("expect(") || err.includes("received") || err.includes("expected")) {
    return hit(Category.APP_BUG, 0.6, "assertion mismatch", "web/app.js");
  }

  return hit(Category.UNKNOWN, 0.3, "unrecognized failure", "spec-or-app");
}

function hit(category, confidence, signal, target) {
  return { category, confidence, signal, target };
}

/** Stable fingerprint of a failure set, for no-progress detection. */
export function fingerprint(failures) {
  return failures
    .map((f) => `${f.file}::${f.title}`)
    .sort()
    .join("|");
}
