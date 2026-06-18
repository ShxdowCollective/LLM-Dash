import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(import.meta.dirname, "..", "..");

/**
 * Parse Playwright's JSON reporter output into a flat failure list + counts.
 * @param {string} jsonPath
 */
export function parseResults(jsonPath) {
  if (!fs.existsSync(jsonPath)) {
    return { ok: false, total: 0, passed: 0, failed: 0, flaky: 0, failures: [] };
  }
  const data = JSON.parse(fs.readFileSync(jsonPath, "utf8"));
  const failures = [];
  let total = 0, passed = 0, failed = 0, flaky = 0;

  const walkSuite = (suite, file) => {
    const f = suite.file || file;
    for (const spec of suite.specs || []) {
      for (const t of spec.tests || []) {
        total++;
        const results = t.results || [];
        const last = results[results.length - 1] || {};
        const status = last.status;
        const retries = Math.max(0, results.length - 1);
        const okStatuses = t.status === "expected" || status === "passed";
        if (t.status === "flaky") flaky++;
        if (okStatuses && t.status !== "flaky") passed++;
        if (t.status === "unexpected" || status === "failed" || status === "timedOut") {
          failed++;
          failures.push({
            title: spec.title,
            file: f,
            line: spec.line,
            status: status || t.status,
            retries,
            error: stripAnsi((last.errors || []).map((e) => e.message || "").join("\n") || last.error?.message || ""),
            attachments: (last.attachments || []).map((a) => ({ name: a.name, path: a.path, contentType: a.contentType })),
            consoleErrors: [],
          });
        }
      }
    }
    for (const child of suite.suites || []) walkSuite(child, f);
  };
  for (const suite of data.suites || []) walkSuite(suite, suite.file);

  return { ok: failed === 0, total, passed, failed, flaky, failures };
}

function stripAnsi(s) {
  return String(s).replace(/\x1b\[[0-9;]*m/g, "");
}

/** Render the human-readable audit report. */
export function writeReport({ iterations, summary, classified, healed, committed }) {
  const lines = [];
  lines.push("# LLM-Dash — E2E Audit Report", "");
  lines.push(`Generated: ${new Date().toISOString()}`, "");
  lines.push("## Summary", "");
  lines.push("| metric | value |", "|---|---|");
  lines.push(`| iterations | ${iterations} |`);
  lines.push(`| total tests | ${summary.total} |`);
  lines.push(`| passed | ${summary.passed} |`);
  lines.push(`| failed | ${summary.failed} |`);
  lines.push(`| flaky | ${summary.flaky} |`);
  lines.push(`| healed | ${healed} |`);
  lines.push(`| result | ${summary.ok ? "✅ clean" : "❌ findings remain"} |`);
  lines.push(`| committed | ${committed || "—"} |`, "");

  if (classified.length) {
    lines.push("## Findings", "");
    for (const c of classified) {
      lines.push(`### ${c.category} — ${c.title}`);
      lines.push(`- **file:** \`${c.file}:${c.line ?? "?"}\``);
      lines.push(`- **signal:** ${c.signal} (confidence ${Math.round(c.confidence * 100)}%)`);
      lines.push(`- **likely target:** \`${c.target}\``);
      if (c.attachments?.length) {
        lines.push(`- **evidence:** ${c.attachments.map((a) => `\`${rel(a.path)}\``).join(", ")}`);
      }
      if (c.error) {
        lines.push("", "```", c.error.split("\n").slice(0, 12).join("\n"), "```", "");
      }
    }
  } else {
    lines.push("## Findings", "", "None — all surfaces pass.", "");
  }
  const out = lines.join("\n") + "\n";
  fs.writeFileSync(path.join(ROOT, "E2E_AUDIT_REPORT.md"), out);
  return out;
}

function rel(p) {
  if (!p) return "";
  return path.isAbsolute(p) ? path.relative(ROOT, p) : p;
}
