#!/usr/bin/env node
// Autonomous E2E audit loop for LLM-Dash.
//
//   run → classify → (heal) → re-run → … → commit-on-green
//
// The deterministic engine (run / parse / classify / report / guarded commit /
// no-progress detection) is self-contained. Code-fixing intelligence is
// delegated to OpenCode driven with a free coding model (auto-installed via
// npm/bun/curl when missing). With no healer route it stays report-only.
//
// SAFE BY DEFAULT: bare `node loop.mjs` only runs → classifies → reports. The
// self-healing and auto-commit are OPT-IN, because each edits/commits
// autonomously. Full autonomous mode is `--heal --commit`.
//
// Guardrails:
//   • healing requires --heal; auto-commit requires --commit
//   • never commits on main/master
//   • never stages changes to changelogs/** or data/** (append-only contract)
//   • max-iterations + no-progress stop; --dry-run previews the commit
//
// Flags: --heal --commit --dry-run --headed
//        --max-iterations=N --branch=<name>

import { execFileSync, spawnSync } from "node:child_process";
import path from "node:path";
import { classify, fingerprint, Category } from "./classify.mjs";
import { parseResults, writeReport } from "./report.mjs";

const ROOT = path.join(import.meta.dirname, "..", "..");
const RESULTS_JSON = path.join(ROOT, "e2e", "reports", "results.json");
const AUTO_BRANCH = "qa/e2e-auto";
const PROTECTED = ["changelogs/", "data/"]; // append-only / generated

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n, d) => {
  const a = args.find((x) => x.startsWith(`--${n}=`));
  return a ? a.split("=").slice(1).join("=") : d;
};
const OPTS = {
  heal: flag("heal"),
  commit: flag("commit"),
  dryRun: flag("dry-run"),
  headed: flag("headed"),
  maxIterations: Number(opt("max-iterations", 5)),
  branch: opt("branch", ""),
};

function git(...a) {
  return execFileSync("git", a, { cwd: ROOT, encoding: "utf8" }).trim();
}
function log(msg) {
  process.stdout.write(`\x1b[36m[audit]\x1b[0m ${msg}\n`);
}

function runSuite() {
  log(`running suite (${OPTS.headed ? "headed — visual baselines may diff" : "headless"})…`);
  // Default headless so visual comparisons match the committed headless
  // baselines. --headed is an explicit opt-in for watching functional flows.
  const env = { ...process.env };
  if (!OPTS.headed) env.HEADLESS = "1";
  const res = spawnSync(
    "npx",
    ["playwright", "test", "-c", "e2e/playwright.config.ts", ...(OPTS.headed ? ["--headed"] : [])],
    { cwd: ROOT, env, stdio: "inherit" },
  );
  return res.status === 0;
}

function has(cmd) {
  return spawnSync("bash", ["-lc", `command -v ${cmd}`], { encoding: "utf8" }).status === 0;
}

/** Can we self-heal? Needs OpenCode, or a package manager to install it. */
function canHeal() {
  return OPTS.heal && (has("opencode") || has("npm") || has("bun"));
}

function ensureOpencode() {
  if (has("opencode")) return true;
  log("opencode not found — installing (free fallback healer)…");
  const tries = [
    ["bash", ["-lc", "npm install -g opencode-ai@latest"]],
    ["bash", ["-lc", "bun install -g opencode-ai@latest"]],
    ["bash", ["-lc", "curl -fsSL https://opencode.ai/install | bash"]],
  ];
  for (const [c, a] of tries) {
    if (spawnSync(c, a, { stdio: "inherit" }).status === 0 && has("opencode")) return true;
  }
  return false;
}

/** Pick a free, coding-capable OpenCode model id from `opencode models`. */
function pickFreeOpencodeModel() {
  const out = spawnSync("bash", ["-lc", "opencode models"], { encoding: "utf8" }).stdout || "";
  const free = out.split(/\s+/).filter((m) => /(:free|-free)$/.test(m));
  const coder = free.find((m) => /grok-code|coder|glm|qwen|deepseek|kimi/i.test(m));
  return coder || free[0] || "";
}

function healPrompt(finding) {
  return [
    "You are the healer stage of an autonomous E2E loop for LLM-Dash.",
    "Fix exactly ONE failing test by editing source in the working tree.",
    "HARD RULES:",
    "- NEVER run git (no add/commit/push/checkout/reset). Only edit files.",
    "- NEVER edit changelogs/** or data/**; never delete history.",
    "- Prefer fixing the app (web/app.js, web/style.css, server.py) when the",
    "  behavior is wrong, or the spec/Page Object when the test is wrong.",
    "- Do not weaken assertions to force a pass.",
    "",
    `Category: ${finding.category} (${finding.signal})`,
    `Test: ${finding.title}`,
    `File: ${finding.file}:${finding.line}`,
    "Error:",
    finding.error,
  ].join("\n");
}

function heal(finding) {
  log(`healing: ${finding.title}`);
  // Drive OpenCode directly with a free coding model.
  if (!ensureOpencode()) {
    log("opencode unavailable and not installable — skipping heal");
    return false;
  }
  const model = pickFreeOpencodeModel();
  if (!model) {
    log("no free OpenCode model found — skipping heal");
    return false;
  }
  log(`opencode free model: ${model}`);
  const r = spawnSync(
    "opencode",
    ["run", "--model", model, "--dir", ROOT, "--dangerously-skip-permissions", healPrompt(finding)],
    { cwd: ROOT, stdio: "inherit" },
  );
  return r.status === 0;
}

function stagedTouchesProtected() {
  const changed = git("status", "--porcelain").split("\n").map((l) => l.slice(3).trim()).filter(Boolean);
  return changed.filter((f) => PROTECTED.some((p) => f.startsWith(p)));
}

function commitGreen(summary) {
  const branch = git("rev-parse", "--abbrev-ref", "HEAD");
  if (["main", "master"].includes(branch) && !OPTS.branch) {
    log("on main/master — creating qa/e2e-auto for the commit");
    if (!OPTS.dryRun) git("checkout", "-B", AUTO_BRANCH);
  } else if (OPTS.branch && OPTS.branch !== branch) {
    if (!OPTS.dryRun) git("checkout", "-B", OPTS.branch);
  }
  const violations = stagedTouchesProtected();
  if (violations.length) {
    log(`ABORT commit — changes touch protected paths: ${violations.join(", ")}`);
    return null;
  }
  const msg = `qa(e2e): audit loop green — ${summary.passed}/${summary.total} passing`;
  if (OPTS.dryRun) {
    log(`[dry-run] would: git add -A && git commit -m "${msg}"`);
    return "dry-run";
  }
  if (git("status", "--porcelain").length === 0) {
    log("nothing to commit (working tree clean)");
    return null;
  }
  git("add", "-A");
  git("commit", "-m", msg);
  return git("rev-parse", "--short", "HEAD");
}

async function main() {
  log(`LLM-Dash E2E audit — max ${OPTS.maxIterations} iterations`);
  const canFix = canHeal();
  const routeLabel = canFix ? "heal (opencode free)" : "report-only";
  log(`mode: ${routeLabel} | commit: ${OPTS.commit ? (OPTS.dryRun ? "dry-run" : "on-green") : "off"}`);
  if (OPTS.heal && !canFix) log("--heal requested but no opencode route found → report-only");

  let iterations = 0;
  let lastPrint = "";
  let classified = [];
  let summary = { ok: false, total: 0, passed: 0, failed: 0, flaky: 0, failures: [] };
  let healed = 0;

  while (iterations < OPTS.maxIterations) {
    iterations++;
    log(`── iteration ${iterations} ──`);
    const green = runSuite();
    summary = parseResults(RESULTS_JSON);

    if (green && summary.ok) {
      log(`✅ all ${summary.passed} tests passing`);
      classified = [];
      break;
    }

    classified = summary.failures.map((f) => ({ ...f, ...classify(f) }));
    log(`✗ ${summary.failed} failing — ${classified.map((c) => c.category).join(", ")}`);

    const print = fingerprint(summary.failures);
    if (print === lastPrint) {
      log("no progress since last iteration — stopping");
      break;
    }
    lastPrint = print;

    if (!canFix) {
      log("no healer route — writing report and stopping");
      break;
    }

    // Heal the highest-confidence actionable findings first.
    const actionable = classified
      .filter((c) => c.category !== Category.FLAKY)
      .sort((a, b) => b.confidence - a.confidence);
    for (const finding of actionable) {
      if (heal(finding)) healed++;
    }
  }

  // Report.
  let committed = null;
  if (summary.ok && OPTS.commit) {
    committed = commitGreen(summary);
  }
  writeReport({ iterations, summary, classified, healed, committed });
  log(`report written → E2E_AUDIT_REPORT.md`);

  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
