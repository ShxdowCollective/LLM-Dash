// LLM-Dash frontend.
// Must be served over HTTP from the repo root (not file://, not from web/).
// The DB fetch uses '../data/dash.sqlite' relative to this page's URL.

(function () {
  "use strict";

  const METRIC_KEYS = ["intelligence", "coding", "agents", "speed", "cost"];
  const SORT_OPTIONS = [
    { key: "overall", label: "Overall" },
    { key: "value", label: "Value" },
    { key: "intelligence", label: "Intelligence" },
    { key: "coding", label: "Coding" },
    { key: "agents", label: "Agents" },
    { key: "speed", label: "Speed" },
    { key: "cost", label: "Cost" },
  ];
  const CHART_BARS = [
    { key: "intelligence", label: "Intelligence", color: "var(--vw-iridescent-1)", raw: "#ff5ec7" },
    { key: "coding",       label: "Coding",       color: "var(--vw-iridescent-3)", raw: "#79a7ff" },
    { key: "agents",       label: "Agents",       color: "var(--vw-iridescent-4)", raw: "#72f0d7" },
    { key: "speed",        label: "Speed",        color: "var(--vw-iridescent-5)", raw: "#ffd36a" },
  ];

  const state = {
    view: "table",
    sortBy: "overall",
    selectedModelId: null,
    models: [],
    lastUpdated: null,
    ready: false,
    error: null,
  };

  // ── Helpers (ported from references/llm-benchmark-dashboard.jsx) ──────────

  function avg(arr) {
    const valid = arr.filter((v) => v !== null && v !== undefined);
    if (!valid.length) return null;
    const s = valid.reduce((a, b) => a + b, 0);
    return +(s / valid.length).toFixed(1);
  }
  function getOverall(m) {
    return avg([m.intelligence, m.coding, m.agents, m.speed]);
  }
  function getValue(m) {
    const o = getOverall(m);
    return o !== null ? avg([o, m.cost]) : m.cost;
  }
  function tier(score) {
    if (score === null || score === undefined) return { label: "N/A", cls: "tier-N" };
    if (score >= 9.0) return { label: "S", cls: "tier-S" };
    if (score >= 8.0) return { label: "A", cls: "tier-A" };
    if (score >= 7.0) return { label: "B", cls: "tier-B" };
    if (score >= 6.0) return { label: "C", cls: "tier-C" };
    if (score >= 5.0) return { label: "D", cls: "tier-D" };
    return { label: "F", cls: "tier-F" };
  }
  function barColor(score) {
    if (score === null || score === undefined) return "#3a3a3a";
    if (score >= 9) return "#ff5ec7";
    if (score >= 8) return "#79a7ff";
    if (score >= 7) return "#72f0d7";
    if (score >= 6) return "#ffd36a";
    if (score >= 5) return "#fb923c";
    return "#f87171";
  }

  function sortKey(m, key) {
    if (key === "overall") return getOverall(m) ?? 0;
    if (key === "value")   return getValue(m)   ?? 0;
    return m[key] ?? 0;
  }
  function sortedModels() {
    return [...state.models].sort((a, b) => sortKey(b, state.sortBy) - sortKey(a, state.sortBy));
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        const v = attrs[k];
        if (v === null || v === undefined || v === false) continue;
        if (k === "class") el.className = v;
        else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
        else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
        else if (k === "dataset") Object.assign(el.dataset, v);
        else el.setAttribute(k, v);
      }
    }
    if (children !== undefined && children !== null) {
      const list = Array.isArray(children) ? children : [children];
      for (const c of list) {
        if (c === null || c === undefined || c === false) continue;
        el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
      }
    }
    return el;
  }
  function esc(s) {
    return String(s == null ? "" : s);
  }

  const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  function safeHex(color, fallback) {
    return typeof color === "string" && HEX_COLOR_RE.test(color.trim()) ? color.trim() : fallback;
  }
  function clamp(n, lo, hi) {
    return n < lo ? lo : n > hi ? hi : n;
  }

  // ── sql.js loader ────────────────────────────────────────────────────────

  async function loadDB() {
    if (typeof WebAssembly === "undefined") {
      throw new Error("WebAssembly unavailable in this browser.");
    }
    if (typeof window.initSqlJs !== "function") {
      throw new Error("sql.js loader missing — vendor/sql-wasm.js failed to load.");
    }
    const SQL = await window.initSqlJs({
      locateFile: (f) => "vendor/" + f,
    });
    const res = await fetch("../data/dash.sqlite", { cache: "no-store" });
    if (!res.ok) {
      const err = new Error("DB fetch failed: HTTP " + res.status);
      err.code = "db-missing";
      throw err;
    }
    const buf = new Uint8Array(await res.arrayBuffer());
    return new SQL.Database(buf);
  }

  function rowsToObjects(result) {
    if (!result || !result.length) return [];
    const { columns, values } = result[0];
    return values.map((row) => {
      const o = {};
      for (let i = 0; i < columns.length; i++) o[columns[i]] = row[i];
      return o;
    });
  }

  function loadState(db) {
    const models = rowsToObjects(db.exec("SELECT * FROM v_models_latest ORDER BY id"));
    let lastUpdated = null;
    try {
      const rows = rowsToObjects(db.exec("SELECT value FROM meta WHERE key='last_updated'"));
      if (rows.length) lastUpdated = rows[0].value;
    } catch (_) { /* meta may not exist yet */ }
    return { models, lastUpdated };
  }

  // ── Freshness pill ───────────────────────────────────────────────────────

  function updateFreshness() {
    const el = document.getElementById("freshness");
    if (!el) return;
    const iso = state.lastUpdated;
    if (!iso) {
      el.textContent = "never updated";
      el.dataset.state = "unknown";
      el.title = "no meta.last_updated row";
      return;
    }
    const ts = Date.parse(iso);
    if (isNaN(ts)) {
      el.textContent = "unknown";
      el.dataset.state = "unknown";
      el.title = iso;
      return;
    }
    const ageMs = Date.now() - ts;
    const ageH = ageMs / 3600000;
    const pretty = humanAge(ageMs);
    el.textContent = "updated " + pretty;
    el.title = "meta.last_updated = " + iso;
    if (ageH <= 24)      el.dataset.state = "fresh";
    else if (ageH <= 48) el.dataset.state = "stale";
    else                 el.dataset.state = "expired";
  }

  function humanAge(ms) {
    if (ms < 0) ms = 0;
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + "s ago";
    const m = Math.floor(s / 60);
    if (m < 60) return m + "m ago";
    const h = Math.floor(m / 60);
    if (h < 48) return h + "h ago";
    const d = Math.floor(h / 24);
    return d + "d ago";
  }

  // ── Renderers ────────────────────────────────────────────────────────────

  function renderScoreCell(score) {
    if (score === null || score === undefined) {
      return h("div", { class: "score-cell" }, h("span", { class: "na" }, "N/A"));
    }
    const t = tier(score);
    const width = clamp(score * 10, 0, 100);
    const color = barColor(score);
    const fill = h("div", {
      class: "fill",
      style: {
        width: width + "%",
        background: `linear-gradient(90deg, ${color}aa, ${color})`,
      },
    });
    return h("div", { class: "score-cell" }, [
      h("span", { class: "tier-pill " + t.cls }, t.label),
      h("div", { class: "track" }, fill),
      h("span", { class: "val" }, score.toFixed(1)),
    ]);
  }

  function renderDetailPanel(model) {
    if (!model) { document.getElementById("detail").replaceChildren(); return; }
    const o = getOverall(model);
    const v = getValue(model);
    const oT = tier(o);
    const vT = tier(v);

    const metricRows = [
      ["Intelligence (GPQA/AA)", model.intelligence],
      ["Coding (SWE-bench)", model.coding],
      ["Agent Tasks", model.agents],
      ["Speed", model.speed],
      ["Cost Score", model.cost],
    ].map(([label, score]) =>
      h("div", null, [
        h("div", { class: "metric-label" }, label),
        renderScoreCell(score),
      ])
    );

    const panel = h("div", { class: "detail-panel" }, [
      h("div", { class: "detail-head" }, [
        h("div", null, [
          h("div", { class: "detail-name" }, [
            h("div", {
              class: "dot",
              style: {
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                backgroundColor: safeHex(model.color, "#888"),
              },
            }),
            h("h2", null, esc(model.name)),
          ]),
          h("div", { class: "detail-meta" },
            [esc(model.vendor), esc(model.released), esc(model.params), model.pricing ? "Pricing: " + esc(model.pricing) + "/M tok" : null]
              .filter(Boolean).join(" · ")
          ),
        ]),
        h("div", { class: "detail-scores" }, [
          h("div", { class: "detail-score-card" }, [
            h("div", { class: "label" }, "Overall"),
            h("div", { class: "value " + oT.cls }, o !== null ? o.toFixed(1) : "N/A"),
          ]),
          h("div", { class: "detail-score-card" }, [
            h("div", { class: "label" }, "Value"),
            h("div", { class: "value " + vT.cls }, v !== null ? v.toFixed(1) : "N/A"),
          ]),
        ]),
      ]),
      h("div", { class: "detail-grid" }, metricRows),
      model.notes ? h("p", { class: "detail-notes" }, esc(model.notes)) : null,
      h("button", {
        class: "detail-close",
        type: "button",
        onclick: () => { state.selectedModelId = null; render(); },
      }, "close"),
    ]);
    document.getElementById("detail").replaceChildren(panel);
  }

  function renderTable() {
    const models = sortedModels();
    const thead = h("thead", null,
      h("tr", null, [
        h("th", { class: "num" }, "#"),
        h("th", null, "Model"),
        h("th", null, "Intelligence"),
        h("th", null, "Coding"),
        h("th", null, "Agent Tasks"),
        h("th", null, "Speed"),
        h("th", { class: "num" }, "Overall"),
        h("th", { class: "num" }, "Cost"),
        h("th", { class: "num" }, "Value"),
      ])
    );
    const tbody = h("tbody", null, models.map((m, i) => {
      const o = getOverall(m);
      const v = getValue(m);
      const isSelected = state.selectedModelId === m.id;
      return h("tr", {
        class: isSelected ? "selected" : null,
        onclick: () => {
          state.selectedModelId = isSelected ? null : m.id;
          render();
        },
      }, [
        h("td", null, String(i + 1)),
        h("td", null, h("div", { class: "model-cell" }, [
          h("div", { class: "dot", style: { backgroundColor: safeHex(m.color, "#888") } }),
          h("div", null, [
            h("div", { class: "name" }, esc(m.name)),
            h("div", { class: "sub" }, [esc(m.vendor), m.pricing ? esc(m.pricing) : null].filter(Boolean).join(" · ")),
          ]),
        ])),
        h("td", null, renderScoreCell(m.intelligence)),
        h("td", null, renderScoreCell(m.coding)),
        h("td", null, renderScoreCell(m.agents)),
        h("td", null, renderScoreCell(m.speed)),
        h("td", { class: "summary-cell " + tier(o).cls }, o !== null ? o.toFixed(1) : "—"),
        h("td", { class: "summary-cell " + tier(m.cost).cls }, m.cost !== null ? m.cost.toFixed(1) : "—"),
        h("td", { class: "summary-cell " + tier(v).cls }, v !== null ? v.toFixed(1) : "—"),
      ]);
    }));
    return h("div", { class: "table-wrap" }, h("table", { class: "models" }, [thead, tbody]));
  }

  function renderChart() {
    const models = sortedModels();
    const rows = models.map((m, i) => {
      const o = getOverall(m);
      const isSelected = state.selectedModelId === m.id;
      return h("div", {
        class: "chart-row" + (isSelected ? " selected" : ""),
        onclick: () => {
          state.selectedModelId = isSelected ? null : m.id;
          render();
        },
      }, [
        h("span", { class: "idx" }, String(i + 1)),
        h("div", { class: "dot", style: { backgroundColor: safeHex(m.color, "#888") } }),
        h("span", { class: "name" }, esc(m.name)),
        h("div", { class: "bars" }, CHART_BARS.map((b) => {
          const val = m[b.key];
          const w = val == null ? 0 : clamp((val / 10) * 25, 0, 25);
          return h("div", {
            class: "bar",
            style: {
              width: w + "%",
              backgroundColor: b.raw,
              opacity: val == null ? 0.2 : 0.85,
            },
            title: `${b.label}: ${val == null ? "N/A" : val.toFixed(1)}`,
          });
        })),
        h("span", { class: "overall " + tier(o).cls }, o !== null ? o.toFixed(1) : "—"),
      ]);
    });
    const legend = h("div", { class: "chart-legend" }, CHART_BARS.map((b) =>
      h("span", null, [
        h("div", { class: "swatch", style: { backgroundColor: b.raw } }),
        b.label,
      ])
    ));
    return h("div", { class: "chart-wrap" }, [...rows, legend]);
  }

  function renderPlaceholder(msg) {
    return h("p", { class: "status-msg" }, msg);
  }

  function renderError(msg, hint) {
    const children = [h("div", null, msg)];
    if (hint) children.push(h("div", { style: "margin-top:8px;" }, hint));
    return h("p", { class: "status-msg error" }, children);
  }

  // ── Render dispatcher ────────────────────────────────────────────────────

  function render() {
    const slot = document.getElementById("view");
    if (!slot) return;

    if (state.error) {
      slot.replaceChildren(state.error);
      document.getElementById("detail").replaceChildren();
      return;
    }
    if (!state.ready) {
      slot.replaceChildren(renderPlaceholder("loading dashboard…"));
      return;
    }

    let content;
    switch (state.view) {
      case "chart":     content = renderChart(); break;
      case "changelog": content = renderPlaceholder("changelog view — coming in the next slice."); break;
      case "stats":     content = renderPlaceholder("stats view — coming in a later slice."); break;
      case "table":
      default:          content = renderTable(); break;
    }
    slot.replaceChildren(content);

    const selected = state.selectedModelId != null
      ? state.models.find((m) => m.id === state.selectedModelId) || null
      : null;
    renderDetailPanel(selected);

    for (const btn of document.querySelectorAll(".sort-btn")) {
      btn.setAttribute("aria-pressed", btn.dataset.sort === state.sortBy ? "true" : "false");
    }
    for (const btn of document.querySelectorAll(".view-btn")) {
      btn.setAttribute("aria-pressed", btn.dataset.view === state.view ? "true" : "false");
    }
  }

  // ── Wiring ───────────────────────────────────────────────────────────────

  function wireControls() {
    for (const btn of document.querySelectorAll(".sort-btn")) {
      btn.addEventListener("click", () => {
        state.sortBy = btn.dataset.sort;
        render();
      });
    }
    for (const btn of document.querySelectorAll(".view-btn")) {
      btn.addEventListener("click", () => {
        state.view = btn.dataset.view;
        if (state.view !== "table" && state.view !== "chart") {
          state.selectedModelId = null;
        }
        render();
      });
    }
  }

  // ── Boot ─────────────────────────────────────────────────────────────────

  async function boot() {
    wireControls();
    try {
      const db = await loadDB();
      const loaded = loadState(db);
      db.close();
      state.models = loaded.models;
      state.lastUpdated = loaded.lastUpdated;
      state.ready = true;
    } catch (err) {
      console.error("LLM-Dash boot failed:", err);
      if (err && err.code === "db-missing") {
        state.error = renderError(
          "dashboard hasn't been seeded.",
          h("span", null, [
            "run ",
            h("code", null, "python scripts/init_db.py"),
            " from the repo root and refresh.",
          ])
        );
      } else {
        state.error = renderError(
          "failed to load dashboard",
          h("span", null, String((err && err.message) || err))
        );
      }
    }
    updateFreshness();
    render();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
