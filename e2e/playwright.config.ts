import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

const REPO_ROOT = path.join(__dirname, "..");
const TMP = path.join(__dirname, ".tmp");
const PORT = Number(process.env.LLM_DASH_E2E_PORT || 8799);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const PY = path.join(REPO_ROOT, ".venv", "bin", "python");

// Headed by default (project convention: GUI testing is headed). CI / baseline
// generation forces headless for deterministic, platform-matched screenshots.
const HEADLESS = process.env.HEADLESS === "1" || !!process.env.CI;

// Neutralize the developer's real provider credentials so the test server is
// hermetic: a clean, unconfigured connection state every run, and no real
// secrets ever rendered into screenshots/baselines. Playwright MERGES
// webServer.env over process.env, so each key must be explicitly set to "" to
// override an inherited value (config.py treats "" as unset). List mirrors the
// env-name aliases in scripts/config.py.
const STRIPPED_ENV_KEYS = [
  "LLM_DASH_API_KEY", "LLM_DASH_PROVIDER_API_KEY", "NANOGPT_API_KEY", "API_KEY",
  "LLM_DASH_BASE_URL", "LLM_DASH_PROVIDER_BASE_URL", "BASE_URL",
  "LLM_DASH_DEFAULT_MODEL", "DEFAULT_MODEL",
  "LLM_DASH_BACKUP_MODEL", "BACKUP_MODEL",
  "LLM_DASH_ENDPOINT_MODE", "LLM_DASH_REQUEST_HEADERS",
  "EXA_API_KEY", "LLM_DASH_EXA_API_KEY",
  "ARTIFICIAL_ANALYSIS_API_KEY", "AA_API_KEY", "LLM_DASH_AA_API_KEY",
  "LLM_STATS_API_KEY", "LLM_DASH_LLMSTATS_API_KEY",
];

const STRIPPED: Record<string, string> = {};
for (const k of STRIPPED_ENV_KEYS) STRIPPED[k] = "";

const SERVER_ENV: Record<string, string> = {
  ...STRIPPED,
  LLM_DASH_DATA_DIR: path.join(TMP, "data"),
  LLM_DASH_CHANGELOGS_DIR: path.join(TMP, "changelogs"),
  LLM_DASH_HOST: "127.0.0.1",
  LLM_DASH_PORT: String(PORT),
  LLM_DASH_SHXDOW_ROOT: path.join(TMP, "shxdow"),
  NODE_OPTIONS: "--max-old-space-size=4096",
};

export default defineConfig({
  testDir: "./tests",
  outputDir: "./reports/results",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ["list"],
    ["html", { outputFolder: "./reports/html", open: "never" }],
    ["json", { outputFile: "./reports/results.json" }],
  ],
  snapshotPathTemplate: "{testDir}/__screenshots__/{testFilePath}/{arg}{ext}",
  use: {
    baseURL: BASE_URL,
    headless: HEADLESS,
    viewport: { width: 1440, height: 900 },
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    actionTimeout: 10_000,
    navigationTimeout: 20_000,
  },
  expect: {
    timeout: 7_000,
    toHaveScreenshot: {
      threshold: 0.2,
      maxDiffPixels: 100,
      animations: "disabled",
      scale: "css",
    },
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  globalSetup: require.resolve("./global-setup.ts"),
  webServer: {
    command: `${PY} -m uvicorn server:app --host 127.0.0.1 --port ${PORT} --log-level warning`,
    cwd: REPO_ROOT,
    url: `${BASE_URL}/api/bootstrap-status`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    env: SERVER_ENV,
    stdout: "ignore",
    stderr: "pipe",
  },
});
