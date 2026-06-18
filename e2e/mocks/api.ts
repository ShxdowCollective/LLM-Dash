import type { Page, Route } from "@playwright/test";

// Deterministic stand-ins for the non-deterministic / external-touching API
// routes. Read-only GETs against the isolated server pass through untouched;
// only the endpoints that would hit a network, spawn an agent, or mutate state
// in a time-dependent way are intercepted. Per-test overrides win.

export type JsonBody = Record<string, unknown>;
export type MockOverrides = Record<string, JsonBody | ((route: Route) => unknown)>;

// Matches the client's poll contract (pollRun checks state === "succeeded").
const COMPLETED_JOB = {
  id: "e2e-job",
  state: "succeeded",
  status: "succeeded",
  done: true,
  progress: 100,
  tail: "e2e mock run complete\n",
  log_tail: "e2e mock run complete\n",
  result: { ok: true },
};

const DEFAULTS: Record<string, JsonBody> = {
  "POST /api/run-update": { id: "e2e-job", state: "running", status: "running" },
  "GET /api/run-update/*": COMPLETED_JOB,
  "POST /api/seed": { id: "e2e-job", state: "running", status: "running" },
  "GET /api/provider/test-connection": { ok: true, reachable: true, status: "ok", models: 3 },
  "POST /api/provider/test-connection": { ok: true, reachable: true, status: "ok", models: 3 },
  "POST /api/provider/test-model": { ok: true, status: "ok", reply: "pong" },
  "GET /api/provider/models": { ok: true, models: ["e2e-model-a", "e2e-model-b", "e2e-model-c"] },
  "GET /api/aa/test-connection": { ok: true, reachable: true, status: "ok" },
  "GET /api/llmstats/test-connection": { ok: true, reachable: true, status: "ok" },
  "POST /api/reset": { ok: true, state: "needs_setup" },
  "POST /api/schedule": { ok: true, cadence: "daily", next_run: "2026-06-15T09:00:00Z" },
  "DELETE /api/schedule": { ok: true, cadence: "off" },
  "POST /api/open-terminal": { ok: true },
  "POST /api/voidware/broker/approval/deny": { ok: true },
};

function matchKey(method: string, urlPath: string, key: string): boolean {
  const [m, pattern] = key.split(" ");
  if (m !== method) return false;
  if (pattern.endsWith("*")) return urlPath.startsWith(pattern.slice(0, -1));
  return urlPath === pattern;
}

export async function installApiMocks(page: Page, overrides: MockOverrides = {}): Promise<void> {
  const table: MockOverrides = { ...DEFAULTS, ...overrides };
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    const method = req.method();
    const urlPath = new URL(req.url()).pathname;

    for (const key of Object.keys(table)) {
      if (matchKey(method, urlPath, key)) {
        const entry = table[key];
        if (typeof entry === "function") {
          const out = await entry(route);
          if (out !== undefined) return; // handler fulfilled/aborted itself
        }
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(typeof entry === "function" ? {} : entry),
        });
      }
    }
    // Not a mocked endpoint — let the isolated server answer.
    return route.fallback();
  });
}
