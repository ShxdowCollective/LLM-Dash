// LLM-Dash frontend. Zero-build, package-vendored Voidware, browser SQLite.

(function () {
  "use strict";

  const METRIC_KEYS = ["intelligence", "coding", "agents", "speed", "cost"];
  const CHART_METRIC_KEYS = ["cost", "overall", "value", "intelligence", "coding", "agents", "speed"];
  const MODEL_SORTS = [
    ["overall", "Overall"],
    ["value", "Value"],
    ["intelligence", "Intelligence"],
    ["coding", "Coding"],
    ["agents", "Agent"],
    ["speed", "Speed"],
    ["cost", "Cost"],
  ];
  const TIER_ORDER = ["S", "A", "B", "C", "D", "F"];
  const MAX_COMPARE = 4;
  const STORE_KEY = "llm-dash-ui-state-v5";
  const ZOOM_MIN = 0.7, ZOOM_MAX = 1.4, GRADE_ZOOM = 0.85;

  // Fixed input-modality vocabulary (schema_version 4). Each modality gets an
  // inline glyph + distinct iridescent hue (no emoji per Voidware spec).
  const CAPABILITY = {
    text: { label: "Text", color: "var(--vw-iridescent-2)", glyph: "M4 5h12M4 9h9M4 13h12M4 17h7" },
    image: { label: "Image", color: "var(--vw-iridescent-4)", glyph: "M3 4h14v12H3zM3 13l4-4 3 3 3-4 4 5M12.5 7.5a1 1 0 100-2 1 1 0 000 2" },
    audio: { label: "Audio", color: "var(--vw-iridescent-6)", glyph: "M4 8v4h3l4 3V5L7 8zM14 7a4 4 0 010 6M16 5a7 7 0 010 10" },
    video: { label: "Video", color: "var(--vw-iridescent-1)", glyph: "M3 5h10v10H3zM13 8l4-2v8l-4-2z" },
  };
  const CAPABILITY_ORDER = ["text", "image", "audio", "video"];

  // Table columns. sort=null means non-sortable; score=true routes through the
  // grade-collapse chip path.
  const COLUMNS = [
    { key: "rank", label: "#", sort: null, w: 46 },
    { key: "provider", label: "Provider", sort: "vendor", w: 178 },
    { key: "model", label: "Model", sort: "name", w: null },
    { key: "intelligence", label: "Intel", sort: "intelligence", score: true, w: 102 },
    { key: "coding", label: "Coding", sort: "coding", score: true, w: 102 },
    { key: "agents", label: "Agent", sort: "agents", score: true, w: 102 },
    { key: "speed", label: "Speed", sort: "speed", score: true, w: 102 },
    { key: "overall", label: "Overall", sort: "overall", score: true, w: 106 },
    { key: "cost", label: "Cost", sort: "cost", score: true, w: 102 },
    { key: "value", label: "Value", sort: "value", score: true, w: 102 },
    { key: "compare", label: "Compare", sort: null, w: 74 },
  ];
  const SORT_KEYS = new Set(["overall", "value", "intelligence", "coding", "agents", "speed", "cost", "name", "vendor"]);
  const MOBILE_SORTS = [
    ["overall", "Overall"], ["value", "Value"], ["vendor", "Provider"], ["name", "Model"],
    ["intelligence", "Intelligence"], ["coding", "Coding"], ["agents", "Agent"],
    ["speed", "Speed"], ["cost", "Cost"],
  ];

  // Vendor string -> local SVG slug under web/vendor/logos/ (sourced from
  // models.dev, see logos/SOURCE.md). Vendors without a mapping fall back to a
  // colored monogram.
  const VENDOR_LOGO = {
    "OpenAI": "openai",
    "Anthropic": "anthropic",
    "Google": "google",
    "Alibaba": "alibaba",
    "Zhipu AI (Z.ai)": "zhipuai",
    "MiniMax": "minimax",
    "NVIDIA": "nvidia",
    "Xiaomi": "xiaomi",
    "Moonshot AI": "moonshotai",
    "xAI": "xai",
    "DeepSeek": "deepseek",
    "Mistral": "mistral",
  };
  const META_POLL_MS = 15000;
  const RUN_POLL_MS = 3000;
  const BOOT_POLL_MS = 900;

  const DEFAULT_UI = {
    sortKey: "overall",
    sortDir: "desc",
    text: "",
    vendors: [],
    tier: "",
    status: "",
    minOverall: 0,
    hasPricing: false,
    releasedAfter: "",
    inputCapabilities: [],
    hideDeprecated: false,
    tableZoom: 1.12,
    colWidths: {},
    filtersOpen: false,
    chartMode: "scatter",
    chartX: "cost",
    chartY: "overall",
    compare: [],
    inspect: "",
    statsAgent: "",
    statsRange: "all",
  };

  const AREA = {
    models: {
      title: "Models",
      subpages: [
        ["table", "Table"],
        ["chart", "Chart"],
      ],
    },
    changelog: {
      title: "Changelog",
      subpages: [],
    },
    stats: {
      title: "Stats",
      subpages: [],
    },
    settings: {
      title: "Settings",
      subpages: [
        ["provider", "Connection"],
        ["models", "Models"],
        ["research", "Research"],
        ["schedule", "Schedule"],
        ["reset", "Reset"],
      ],
    },
  };

  const state = {
    SQL: null,
    db: null,
    ready: false,
    error: "",
    area: "models",
    subpage: { models: "table", settings: "provider" },
    models: [],
    filteredModels: [],
    totalModelCount: 0,
    vendorOptions: [],
    scoreHistory: new Map(),
    changelogs: [],
    changelogBodies: {},
    activeChangelogDate: "",
    metrics: [],
    lastUpdated: "",
    metaSeen: "",
    toastId: 0,
    searchDebounce: 0,
    runTimer: 0,
    metaTimer: 0,
    chartResize: 0,
    resetMode: false,
    focusIndex: 0,
    drawerOpen: false,
    helpOpen: false,
    manualOpen: false,
    resetTokens: {},
    resetBusy: "",
    prompt: "",
    provider: {},
    credentials: [],
    presets: [],
    schedule: {},
    run: { open: false, id: "", state: "idle", started: 0, tail: "", error: "" },
    approval: { open: false, password: "", secret: "", error: "", after: null },
    ui: { ...DEFAULT_UI },
    forms: {
      provider: { base_url: "", api_key: "", models_override_url: "", endpoint_mode: "append_v1" },
      models: { default_model: "", backup_model: "" },
      research: { exa: "", llmstats: "" },
      schedule: { cadence: "off", time_local: "09:00", day_of_week: 1, day_of_month: 1 },
    },
  };

  const els = {};
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const int = new Intl.NumberFormat("en-US");
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  function boot() {
    cacheEls();
    if (!consumeResetFlag()) loadPrefs();
    applyRoute(parseHash(location.hash));
    bindShell();
    renderBoot("Starting local dashboard...");
    start();
  }

  function cacheEls() {
    Object.assign(els, {
      app: byId("app"),
      body: byId("content-body"),
      header: byId("page-header"),
      subnav: byId("subpage-nav"),
      sidebar: byId("sidebar"),
      backdrop: byId("sidebar-backdrop"),
      toggle: byId("sidebar-toggle"),
      close: byId("sidebar-close"),
      content: byId("content"),
      overlay: byId("overlay-root"),
      toast: byId("toast-root"),
      freshness: byId("freshness"),
      refresh: byId("refresh-trigger"),
      help: byId("help-trigger"),
      mobileTitle: document.querySelector(".shell-mobile-title"),
    });
  }

  async function start() {
    try {
      await waitForBootstrap();
      await Promise.all([loadDatabase(), loadProvider(), loadPresets(), loadCredentials(), loadSchedule()]);
      hydrateForms();
      state.ready = true;
      els.app.removeAttribute("data-booting");
      refreshModels();
      render();
      state.resetMode = false;
      pollMeta();
      state.metaTimer = window.setInterval(pollMeta, META_POLL_MS);
    } catch (error) {
      state.error = message(error);
      els.app.removeAttribute("data-booting");
      render();
    }
  }

  async function waitForBootstrap() {
    for (;;) {
      const data = await api("/api/bootstrap-status").catch((error) => ({ state: "error", detail: message(error) }));
      if (data.state === "ready" || data.state === "unsupported") return;
      if (data.state === "error") throw new Error(data.detail || data.message || "Bootstrap failed.");
      renderBoot(data.message || "Preparing dashboard database...");
      await sleep(BOOT_POLL_MS);
    }
  }

  async function loadDatabase() {
    if (typeof window.initSqlJs !== "function") throw new Error("sql.js did not load.");
    state.SQL = await window.initSqlJs({ locateFile: (file) => "vendor/" + file });
    const res = await fetch("/data/dash.sqlite?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) throw new Error("Could not load dash.sqlite.");
    if (state.db) state.db.close();
    state.db = new state.SQL.Database(new Uint8Array(await res.arrayBuffer()));
    loadStaticData();
  }

  function loadStaticData() {
    state.totalModelCount = row("SELECT COUNT(*) AS count FROM models")?.count || 0;
    state.vendorOptions = rows("SELECT DISTINCT vendor FROM models ORDER BY vendor").map((r) => r.vendor).filter(Boolean);
    state.changelogs = rows("SELECT date, title, path, summary, new_models_json, changed_json FROM changelogs ORDER BY date DESC");
    state.metrics = rows("SELECT changelog_date, started_at, completed_at, duration_sec, agent_name, agent_runtime, tokens_input, tokens_output, tokens_cached, cost_usd, exa_searches, exa_fetches, word_count, notes FROM run_metrics ORDER BY changelog_date DESC, completed_at DESC");
    state.lastUpdated = row("SELECT value FROM meta WHERE key = 'last_updated'")?.value || "";
    state.metaSeen = state.lastUpdated;
    state.activeChangelogDate = state.activeChangelogDate || state.changelogs[0]?.date || "";
    const history = rows("SELECT model_id, as_of, intelligence, coding, agents, speed, cost FROM model_scores ORDER BY model_id, as_of");
    state.scoreHistory = new Map();
    for (const item of history) {
      if (!state.scoreHistory.has(item.model_id)) state.scoreHistory.set(item.model_id, []);
      state.scoreHistory.get(item.model_id).push(item);
    }
  }

  async function loadProvider() {
    state.provider = await api("/api/provider").catch(() => ({ loaded: true }));
  }

  async function loadPresets() {
    const data = await api("/api/provider-presets").catch(() => ({ providers: [] }));
    state.presets = data.providers || [];
  }

  async function loadCredentials() {
    const data = await api("/api/provider/credentials").catch(() => ({ credentials: [] }));
    state.credentials = data.credentials || [];
  }

  async function loadSchedule() {
    state.schedule = await api("/api/schedule").catch(() => ({ enabled: false, cadence: "off" }));
  }

  function hydrateForms() {
    state.forms.provider = {
      base_url: state.provider.base_url || "",
      api_key: "",
      models_override_url: state.provider.models_override_url || "",
      endpoint_mode: state.provider.endpoint_mode || "append_v1",
      provider_credential_name: state.provider.provider_credential_name || "",
    };
    state.forms.models = {
      default_model: state.provider.default_model || "",
      backup_model: state.provider.backup_model || "",
    };
    state.forms.schedule = {
      cadence: state.schedule.enabled ? state.schedule.cadence || "daily" : "off",
      time_local: state.schedule.time_local || "09:00",
      day_of_week: Number(state.schedule.day_of_week || 1),
      day_of_month: Number(state.schedule.day_of_month || 1),
    };
  }

  function rows(sql, params) {
    const stmt = state.db.prepare(sql);
    const out = [];
    try {
      stmt.bind(params || []);
      while (stmt.step()) out.push(stmt.getAsObject());
    } finally {
      stmt.free();
    }
    return out;
  }

  function row(sql, params) {
    return rows(sql, params)[0] || null;
  }

  function refreshModels() {
    const where = [];
    const params = [];
    const ui = state.ui;
    if (Array.isArray(ui.vendors) && ui.vendors.length) {
      where.push("vendor IN (" + ui.vendors.map(() => "?").join(", ") + ")");
      params.push(...ui.vendors);
    }
    if (ui.status) {
      where.push("status = ?");
      params.push(ui.status);
    }
    if (ui.text.trim()) {
      const q = "%" + ui.text.trim() + "%";
      where.push("(name LIKE ? OR vendor LIKE ? OR COALESCE(notes, '') LIKE ? OR COALESCE(params, '') LIKE ?)");
      params.push(q, q, q, q);
    }
    state.models = rows("SELECT * FROM v_models_latest" + (where.length ? " WHERE " + where.join(" AND ") : ""), params);
    let list = state.models;
    if (ui.tier) list = list.filter((m) => tier(overall(m)).label === ui.tier);
    if (Number(ui.minOverall) > 0) list = list.filter((m) => (overall(m) || 0) >= Number(ui.minOverall));
    if (ui.hasPricing) list = list.filter(hasPricing);
    if (ui.releasedAfter) list = list.filter((m) => releasedYear(m) >= Number(ui.releasedAfter));
    if (Array.isArray(ui.inputCapabilities) && ui.inputCapabilities.length) {
      list = list.filter((m) => { const caps = modelCapabilities(m); return ui.inputCapabilities.every((c) => caps.includes(c)); });
    }
    // hideDeprecated hides deprecated rows, but an explicit Status=Deprecated
    // filter wins (the user asked to see exactly those).
    if (ui.hideDeprecated && ui.status !== "deprecated") list = list.filter((m) => m.status !== "deprecated");
    state.filteredModels = list.sort((a, b) => compareBy(a, b, ui.sortKey, ui.sortDir));
    const ids = new Set(state.filteredModels.map((m) => m.id));
    // compare = explicit checkbox set (empty by default). inspect = single
    // row/point click; falls back to the top model so the stat panel is never
    // blank, but never auto-joins the compare set.
    state.ui.compare = (state.ui.compare || []).filter((id) => ids.has(id)).slice(0, MAX_COMPARE);
    if (!ids.has(state.ui.inspect)) state.ui.inspect = state.filteredModels[0] ? state.filteredModels[0].id : "";
    savePrefs();
  }

  function hasPricing(model) {
    if (String(model.pricing || "").trim()) return true;
    return model.cost != null && Number.isFinite(Number(model.cost));
  }

  function releasedYear(model) {
    const match = String(model.released || "").match(/\b(19|20)\d{2}\b/);
    return match ? Number(match[0]) : 0;
  }

  function releasedYearOptions() {
    const years = new Set();
    state.models.forEach((m) => { const y = releasedYear(m); if (y) years.add(y); });
    rows("SELECT released FROM models").forEach((r) => {
      const match = String(r.released || "").match(/\b(19|20)\d{2}\b/);
      if (match) years.add(Number(match[0]));
    });
    return [...years].sort((a, b) => b - a);
  }

  // M13 ranking weights (documented in docs/ARCHITECTURE.md). Capability is 75%
  // of Overall, but cost now counts so the leaderboard isn't price-blind. Value
  // is the practical-buyer sort: mostly Overall, then cost, then speed.
  function overall(model) {
    return weighted([[model.intelligence, 0.25], [model.coding, 0.25], [model.agents, 0.25], [model.speed, 0.10], [model.cost, 0.15]]);
  }

  function valueScore(model) {
    return weighted([[overall(model), 0.60], [model.cost, 0.25], [model.speed, 0.15]]);
  }

  function metricValue(model, key) {
    if (key === "overall") return overall(model);
    if (key === "value") return valueScore(model);
    return Number(model[key]) || 0;
  }

  function weighted(parts) {
    const valid = parts.map(([v, w]) => [Number(v), Number(w)]).filter(([v, w]) => Number.isFinite(v) && Number.isFinite(w));
    if (!valid.length) return null;
    const w = valid.reduce((sum, item) => sum + item[1], 0);
    return +(valid.reduce((sum, item) => sum + item[0] * item[1], 0) / w).toFixed(1);
  }

  function tier(score) {
    if (!Number.isFinite(Number(score))) return { label: "N/A", cls: "tier-na" };
    if (score >= 9) return { label: "S", cls: "tier-s" };
    if (score >= 8) return { label: "A", cls: "tier-a" };
    if (score >= 7) return { label: "B", cls: "tier-b" };
    if (score >= 6) return { label: "C", cls: "tier-c" };
    if (score >= 5) return { label: "D", cls: "tier-d" };
    return { label: "F", cls: "tier-f" };
  }

  function sortValue(model, key) {
    if (key === "overall") return overall(model) || 0;
    if (key === "value") return valueScore(model) || 0;
    return Number(model[key]) || 0;
  }

  // String columns (name, vendor) compare lexically; everything else numerically.
  function compareBy(a, b, key, dir) {
    let delta;
    if (key === "name" || key === "vendor") {
      delta = String(a[key] || "").localeCompare(String(b[key] || ""), undefined, { sensitivity: "base" });
    } else {
      delta = sortValue(a, key) - sortValue(b, key);
    }
    if (dir === "desc") delta = -delta;
    return delta || String(a.name || "").localeCompare(String(b.name || ""));
  }

  function modelCapabilities(model) {
    let raw = model.input_capabilities;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch (_) { raw = [raw]; } }
    const items = Array.isArray(raw) ? raw.map((v) => String(v).toLowerCase()) : [];
    const keep = CAPABILITY_ORDER.filter((c) => items.includes(c));
    return keep.length ? keep : ["text"];
  }

  function render() {
    syncShell();
    renderHeader();
    renderSubnav();
    renderOverlay();
    if (state.error) {
      mount(emptyState("Dashboard could not start", state.error, "Retry", () => location.reload(), "error"));
      return;
    }
    if (!state.ready) return;
    if (state.area === "models") mount(renderModels());
    else if (state.area === "changelog") mount(renderChangelog());
    else if (state.area === "stats") mount(renderStats());
    else mount(renderSettings());
  }

  function renderBoot(text) {
    if (!els.body) return;
    els.body.replaceChildren(h("section", { class: "boot-panel", role: "status" }, [
      h("span", { class: "vw-spinner bootstrap-spinner", "aria-hidden": "true" }),
      h("strong", null, text),
      h("p", null, "Loading local data and preparing the workbench."),
    ]));
  }

  function renderHeader() {
    const config = AREA[state.area] || AREA.models;
    els.header.replaceChildren(h("h1", { class: "app-page-title" }, config.title));
  }

  function renderSubnav() {
    const config = AREA[state.area] || AREA.models;
    if (!config.subpages.length) {
      els.subnav.hidden = true;
      els.subnav.replaceChildren();
      return;
    }
    els.subnav.hidden = false;
    els.subnav.replaceChildren(...config.subpages.map(([key, label]) => {
      const current = state.subpage[state.area] === key;
      return h("button", {
        class: "vw-subpage-nav-link view-btn",
        type: "button",
        "aria-current": current ? "page" : null,
        onclick: () => navigate(state.area, key),
      }, label);
    }));
  }

  function renderModels() {
    refreshModels();
    normalizeChartAxes();
    return h("section", { class: "models-workbench" }, [
      renderModelToolbar(),
      state.subpage.models === "chart" ? renderChart() : renderTable(),
    ]);
  }

  function renderModelToolbar() {
    const count = filterCount();
    const isTable = state.subpage.models === "table";
    return h("section", { class: "models-toolbar", "aria-label": "Model controls" }, [
      h("div", { class: "toolbar-primary" }, [
        h("label", { class: "search-field" }, [
          h("span", { class: "sr-only" }, "Search models"),
          h("input", {
            id: "model-search",
            type: "search",
            value: state.ui.text,
            placeholder: "Search model or vendor",
            oninput: (e) => debounceSearch(e.target.value),
          }),
        ]),
        // Compact sort select only on mobile (the desktop table sorts via header
        // clicks). CSS reveals it under the table breakpoint.
        isTable ? h("label", { class: "field compact mobile-sort-field" }, [
          h("span", null, "Sort"),
          h("select", { value: state.ui.sortKey, onchange: (e) => setSort(e.target.value) },
            MOBILE_SORTS.map(([key, label]) => h("option", { value: key }, label))),
        ]) : null,
        h("button", {
          class: "vw-btn vw-btn-secondary toolbar-filter-btn",
          type: "button",
          "aria-expanded": String(state.ui.filtersOpen),
          onclick: () => { state.ui.filtersOpen = !state.ui.filtersOpen; savePrefs(); render(); },
        }, count ? `Filters (${count})` : "Filters"),
      ]),
      h("div", { class: "toolbar-actions" }, [
        isTable ? zoomControl() : null,
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: exportModels }, "Export CSV"),
        count && state.filteredModels.length ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: resetFilters }, "Reset view") : null,
      ]),
      state.ui.filtersOpen ? renderFilters() : null,
    ]);
  }

  function zoomControl() {
    const z = clampZoom(state.ui.tableZoom);
    return h("label", { class: "field compact zoom-field", title: "Table density. Below " + GRADE_ZOOM + " scores collapse to grades." }, [
      h("span", { class: "zoom-label" }, "Zoom " + Math.round(z * 100) + "%"),
      h("input", {
        type: "range", min: String(ZOOM_MIN), max: String(ZOOM_MAX), step: "0.05", value: String(z),
        "aria-label": "Table zoom",
        oninput: (e) => { state.ui.tableZoom = clampZoom(Number(e.target.value)); applyZoomLive(); },
        onchange: (e) => { state.ui.tableZoom = clampZoom(Number(e.target.value)); savePrefs(); render(); },
      }),
    ]);
  }

  function clampZoom(v) { const n = Number(v); return Number.isFinite(n) ? clamp(n, ZOOM_MIN, ZOOM_MAX) : 1; }

  // Live-scale without re-rendering so the slider keeps focus through the drag.
  // Grade collapse is pure CSS (.is-graded hides .score-num), so crossing the
  // 0.85 threshold only needs a class toggle, not a render that rebuilds the
  // toolbar out from under the dragging thumb.
  function applyZoomLive() {
    const z = clampZoom(state.ui.tableZoom);
    const layout = document.querySelector(".model-table-layout");
    const label = document.querySelector(".zoom-label");
    if (label) label.textContent = "Zoom " + Math.round(z * 100) + "%";
    if (!layout) return;
    layout.style.setProperty("--table-zoom", String(z));
    layout.classList.toggle("is-graded", z < GRADE_ZOOM);
  }

  function renderFilters() {
    const years = releasedYearOptions();
    return h("div", { class: "filter-dock" }, [
      h("div", { class: "filter-row" }, [
        h("label", { class: "field" }, [
          h("span", null, "Tier"),
          h("select", { value: state.ui.tier, onchange: (e) => { state.ui.tier = e.target.value; refreshModels(); render(); } }, [
            h("option", { value: "" }, "All tiers"),
            ...TIER_ORDER.map((v) => h("option", { value: v }, v)),
          ]),
        ]),
        h("label", { class: "field" }, [
          h("span", null, "Status"),
          h("select", { value: state.ui.status, onchange: (e) => { state.ui.status = e.target.value; refreshModels(); render(); } }, [
            h("option", { value: "" }, "Any status"),
            h("option", { value: "active" }, "Active"),
            h("option", { value: "superseded" }, "Superseded"),
            h("option", { value: "deprecated" }, "Deprecated"),
          ]),
        ]),
        h("label", { class: "field" }, [
          h("span", null, "Released after"),
          h("select", { value: state.ui.releasedAfter, onchange: (e) => { state.ui.releasedAfter = e.target.value; refreshModels(); render(); } }, [
            h("option", { value: "" }, "Any year"),
            ...years.map((y) => h("option", { value: String(y) }, String(y) + " or later")),
          ]),
        ]),
        h("label", { class: "field minoverall" }, [
          h("span", null, `Min overall: ${Number(state.ui.minOverall) > 0 ? Number(state.ui.minOverall).toFixed(1) : "any"}`),
          h("input", {
            type: "range", min: "0", max: "10", step: "0.5", value: String(state.ui.minOverall || 0),
            oninput: (e) => { state.ui.minOverall = Number(e.target.value); debounceFilter(); },
          }),
        ]),
        h("label", { class: "field toggle-field" }, [
          h("input", { type: "checkbox", checked: Boolean(state.ui.hasPricing), onchange: (e) => { state.ui.hasPricing = e.target.checked; refreshModels(); render(); } }),
          h("span", null, "Has pricing"),
        ]),
        h("label", { class: "field toggle-field", title: state.ui.status === "deprecated" ? "Status filter is set to Deprecated, so this is ignored." : null }, [
          h("input", { type: "checkbox", checked: Boolean(state.ui.hideDeprecated), disabled: state.ui.status === "deprecated", onchange: (e) => { state.ui.hideDeprecated = e.target.checked; refreshModels(); render(); } }),
          h("span", null, "Ignore deprecated"),
        ]),
      ]),
      h("div", { class: "filter-capabilities" }, [
        h("span", { class: "filter-vendors-label" }, "Inputs"),
        h("div", { class: "filter-cap-chips" }, CAPABILITY_ORDER.map((c) => {
          const active = state.ui.inputCapabilities.includes(c);
          const meta = CAPABILITY[c];
          return h("button", { type: "button", class: "cap-filter-chip" + (active ? " is-active" : ""), style: { "--cap-color": meta.color }, "aria-pressed": String(active), onclick: () => toggleCapability(c) }, [
            h("span", { class: "cap-chip", style: { "--cap-color": meta.color } }, [
              h("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round" }, [h("path", { d: meta.glyph })]),
            ]),
            meta.label,
          ]);
        })),
      ]),
      h("div", { class: "filter-vendors" }, [
        h("span", { class: "filter-vendors-label" }, "Providers"),
        h("div", { class: "filter-vendor-chips" }, state.vendorOptions.map((v) => {
          const active = state.ui.vendors.includes(v);
          return h("button", { type: "button", class: "vendor-chip" + (active ? " is-active" : ""), "aria-pressed": String(active), onclick: () => toggleVendor(v) }, [providerLogoByVendor(v), v]);
        })),
      ]),
      h("p", { class: "filter-note" }, `${state.filteredModels.length} of ${state.totalModelCount} models shown`),
    ]);
  }

  function providerLogoByVendor(vendor) {
    const slug = vendorSlug(vendor);
    if (slug) return h("img", { class: "provider-logo", src: "vendor/logos/" + slug + ".svg", alt: "", width: 20, height: 20, loading: "lazy", style: { width: "20px", height: "20px" } });
    return h("span", { class: "vendor-chip-dot" });
  }

  function debounceFilter() {
    window.clearTimeout(state.filterDebounce);
    renderFilterRangeLabel();
    state.filterDebounce = window.setTimeout(() => { refreshModels(); render(); }, 160);
  }

  function renderFilterRangeLabel() {
    const label = document.querySelector(".field.minoverall > span");
    if (label) label.textContent = `Min overall: ${Number(state.ui.minOverall) > 0 ? Number(state.ui.minOverall).toFixed(1) : "any"}`;
  }

  function renderTable() {
    if (!state.totalModelCount) return emptyState("No models tracked yet", "Run Refresh to discover and score models.", "Run Refresh", handleRefresh);
    if (!state.filteredModels.length) return emptyState("No models match this view", "Clear filters or search for another vendor.", "Reset view", resetFilters);
    const zoom = clampZoom(state.ui.tableZoom);
    const graded = zoom < GRADE_ZOOM;
    const widths = state.ui.colWidths || {};
    return h("section", {
      class: "model-table-layout" + (graded ? " is-graded" : ""),
      style: { "--table-zoom": String(zoom) },
    }, [
      h("div", { class: "table-wrap models-table-wrap vw-scroll-shadow" }, [
        h("table", { class: "models" }, [
          h("colgroup", null, COLUMNS.map((col) => {
            const w = Number(widths[col.key]) || col.w;
            return h("col", w ? { style: { width: w + "px" } } : null);
          })),
          h("thead", null, h("tr", null, COLUMNS.map(headerCell))),
          h("tbody", null, state.filteredModels.map((model, index) => h("tr", {
            class: rowClasses(model.id),
            tabindex: "0",
            onclick: () => setInspect(model.id),
            onkeydown: (e) => rowKey(e, index, model.id),
            style: { "--model-color": safeColor(model.color) },
          }, COLUMNS.map((col) => bodyCell(col, model, index))))),
        ]),
      ]),
      h("div", { class: "models-mobile-list" }, state.filteredModels.map((model, index) => modelCard(model, index))),
      renderCompareArea(),
    ]);
  }

  function headerCell(col) {
    const active = col.sort && state.ui.sortKey === col.sort;
    const ariaSort = active ? (state.ui.sortDir === "asc" ? "ascending" : "descending") : (col.sort ? "none" : null);
    const cls = (col.key === "rank" ? "rank-col" : col.key === "compare" ? "compare-col" : "") + (col.sort ? " is-sortable" : "");
    const inner = [];
    if (col.key === "compare") inner.push(h("span", { class: "sr-only" }, "Compare"));
    else if (col.sort) {
      inner.push(h("button", {
        class: "th-sort" + (active ? " is-active" : ""),
        type: "button",
        onclick: () => setSort(col.sort),
        title: "Sort by " + col.label,
      }, [col.label, h("span", { class: "sort-caret", "aria-hidden": "true" }, active ? (state.ui.sortDir === "asc" ? "▲" : "▼") : "")]));
    } else inner.push(h("span", { class: "th-label", "aria-label": col.key === "rank" ? "Rank in current sort order" : null }, col.label));
    // Resize handle (not on the last column).
    if (col.key !== "compare") inner.push(resizeHandle(col));
    return h("th", { class: cls.trim() || null, "aria-sort": ariaSort, scope: "col" }, inner);
  }

  function resizeHandle(col) {
    return h("span", {
      class: "col-resize",
      "aria-hidden": "true",
      title: "Drag to resize, double-click to reset",
      onclick: (e) => e.stopPropagation(),
      ondblclick: (e) => { e.stopPropagation(); const w = { ...(state.ui.colWidths || {}) }; delete w[col.key]; state.ui.colWidths = w; savePrefs(); render(); },
      onpointerdown: (e) => startColResize(e, col),
    });
  }

  function startColResize(event, col) {
    event.preventDefault();
    event.stopPropagation();
    const th = event.target.closest("th");
    const startX = event.clientX;
    const startW = th ? th.getBoundingClientRect().width : (col.w || 90);
    const move = (e) => {
      const next = Math.max(46, Math.round(startW + (e.clientX - startX)));
      const widths = { ...(state.ui.colWidths || {}) };
      widths[col.key] = next;
      state.ui.colWidths = widths;
      const idx = COLUMNS.findIndex((c) => c.key === col.key);
      const colEl = document.querySelectorAll("table.models colgroup col")[idx];
      if (colEl) colEl.style.width = next + "px";
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.classList.remove("is-col-resizing");
      savePrefs();
    };
    document.body.classList.add("is-col-resizing");
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }

  function bodyCell(col, model, index) {
    if (col.key === "rank") return h("td", { class: "rank-cell" }, index + 1);
    if (col.key === "provider") return h("td", { class: "provider-cell" }, providerCell(model));
    if (col.key === "model") return h("td", null, modelIdentity(model));
    if (col.key === "compare") return h("td", { class: "compare-cell" }, compareCheckbox(model));
    if (col.key === "overall") return scoreTd(overall(model));
    if (col.key === "value") return scoreTd(valueScore(model));
    return scoreTd(model[col.key]);
  }

  function providerCell(model) {
    return h("div", { class: "provider-cell-inner", style: { "--model-color": safeColor(model.color) } }, [
      providerLogo(model, 24),
      h("span", { class: "provider-cell-name" }, model.vendor || "Unknown"),
    ]);
  }

  function rowClasses(id) {
    return ["model-row",
      state.ui.inspect === id ? "is-inspect" : "",
      state.ui.compare.includes(id) ? "is-compare" : "",
    ].filter(Boolean).join(" ");
  }

  function compareCheckbox(model) {
    const checked = state.ui.compare.includes(model.id);
    const full = !checked && state.ui.compare.length >= MAX_COMPARE;
    return h("label", { class: "compare-check" + (full ? " is-disabled" : ""), title: full ? `Compare holds up to ${MAX_COMPARE} models` : "Add to comparison", onclick: (e) => e.stopPropagation() }, [
      h("input", {
        type: "checkbox",
        checked,
        disabled: full,
        "aria-label": "Compare " + (model.name || "model"),
        onchange: () => toggleCompare(model.id),
      }),
      h("span", { class: "compare-check-box", "aria-hidden": "true" }),
    ]);
  }

  function vendorSlug(vendor) {
    return VENDOR_LOGO[vendor] || null;
  }

  function providerLogo(model, size) {
    const px = size || 18;
    const slug = vendorSlug(model.vendor);
    if (slug) {
      return h("img", {
        class: "provider-logo",
        src: "vendor/logos/" + slug + ".svg",
        alt: (model.vendor || "Provider") + " logo",
        width: px,
        height: px,
        loading: "lazy",
        style: { width: px + "px", height: px + "px" },
      });
    }
    return h("span", {
      class: "provider-monogram",
      "aria-hidden": "true",
      style: { width: px + "px", height: px + "px", "--model-color": safeColor(model.color) },
    }, String(model.vendor || "?").trim().charAt(0).toUpperCase() || "?");
  }

  function modelCard(model, index) {
    const inCompare = state.ui.compare.includes(model.id);
    return h("article", {
      class: "mobile-model-card" + (state.ui.inspect === model.id ? " is-inspect" : "") + (inCompare ? " is-compare" : ""),
      style: { "--model-color": safeColor(model.color) },
      tabindex: "0",
      role: "button",
      "aria-pressed": String(state.ui.inspect === model.id),
      onclick: () => setInspect(model.id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInspect(model.id); }
        if (e.key === "c" || e.key === "x") { e.preventDefault(); toggleCompare(model.id); }
      },
    }, [
      h("div", { class: "mobile-model-card-head" }, [
        h("span", { class: "mobile-rank" }, index + 1),
        providerLogo(model, 22),
        h("div", { class: "mobile-model-title" }, [
          h("div", { class: "mobile-model-name-row" }, [
            h("strong", { class: "mobile-model-name" }, model.name || "Unknown model"),
            model.status === "deprecated" ? h("span", { class: "deprecated-badge", title: depTitle(model) }, "Deprecated") : null,
          ]),
          h("div", { class: "mobile-model-meta" }, [
            h("span", { class: "mobile-model-sub" }, [model.vendor, model.pricing].filter(Boolean).join(" · ") || "No vendor metadata"),
            capabilityChips(model, 14),
          ]),
        ]),
        compareCheckbox(model),
      ]),
      h("div", { class: "mobile-score-grid" }, [
        scoreBlock("Overall", overall(model)),
        scoreBlock("Value", valueScore(model)),
        scoreBlock("Cost", model.cost),
      ]),
      h("p", { class: "mobile-metrics-line" },
        `Intel ${fmtScore(model.intelligence)} · Coding ${fmtScore(model.coding)} · Agent ${fmtScore(model.agents)} · Speed ${fmtScore(model.speed)}`),
    ]);
  }

  function renderChart() {
    if (!state.filteredModels.length) return emptyState("Nothing to chart", "Reset filters to bring model points back.", "Reset view", resetFilters);
    const focusList = compareModels().length ? compareModels() : [inspectModel()].filter(Boolean);
    return h("section", { class: "chart-workbench" }, [
      h("div", { class: "chart-controls" }, [
        state.ui.chartMode === "scatter" ? metricSelect("X axis", "chartX") : null,
        state.ui.chartMode === "scatter" ? metricSelect("Y axis", "chartY") : null,
        h("div", { class: "segmented-pill", role: "group", "aria-label": "Chart mode" }, [
          modeButton("scatter", "Scatter"),
          modeButton("radar", "Radar"),
        ]),
        state.ui.compare.length ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: clearCompare }, "Clear comparison") : null,
      ]),
      h("div", { class: "chart-analysis" }, [
        h("div", { class: "chart-canvas-panel" }, state.ui.chartMode === "radar" ? renderRadar(focusList) : renderScatter()),
        h("div", { class: "chart-side" }, renderCompareArea()),
      ]),
    ]);
  }

  function normalizeChartAxes() {
    if (!CHART_METRIC_KEYS.includes(state.ui.chartX)) state.ui.chartX = "cost";
    if (!CHART_METRIC_KEYS.includes(state.ui.chartY)) state.ui.chartY = "overall";
    if (state.ui.chartX === state.ui.chartY) {
      state.ui.chartY = state.ui.chartX === "overall" ? "cost" : "overall";
    }
  }

  function renderScatter() {
    const w = 720, hgt = 400, pad = { top: 42, right: 38, bottom: 58, left: 58 };
    const xKey = state.ui.chartX, yKey = state.ui.chartY;
    const sx = (v) => pad.left + (clamp(Number(v) || 0, 0, 10) / 10) * (w - pad.left - pad.right);
    const sy = (v) => hgt - pad.bottom - (clamp(Number(v) || 0, 0, 10) / 10) * (hgt - pad.top - pad.bottom);
    const svg = h("svg", { class: "analysis-svg", viewBox: `0 0 ${w} ${hgt}`, role: "img", "aria-label": `${labelFor(xKey)} by ${labelFor(yKey)} scatter plot` }, [
      h("rect", { x: pad.left, y: pad.top, width: w - pad.left - pad.right, height: hgt - pad.top - pad.bottom, rx: "18", class: "chart-plot-bg" }),
      ...[0, 2, 4, 6, 8, 10].flatMap((tick) => [
        h("line", { x1: sx(tick), x2: sx(tick), y1: pad.top, y2: hgt - pad.bottom, class: "chart-grid-line" }),
        h("line", { y1: sy(tick), y2: sy(tick), x1: pad.left, x2: w - pad.right, class: "chart-grid-line" }),
        h("text", { x: sx(tick), y: hgt - 34, class: "chart-axis-label" }, tick),
        h("text", { x: 32, y: sy(tick) + 4, class: "chart-axis-label" }, tick),
      ]),
      h("text", { x: w / 2, y: hgt - 10, class: "chart-axis-title x-title" }, labelFor(xKey)),
      h("text", { x: 16, y: hgt / 2, class: "chart-axis-title y-title", transform: `rotate(-90 16 ${hgt / 2})` }, labelFor(yKey)),
      ...state.filteredModels.map((model) => {
        const inCompare = state.ui.compare.includes(model.id);
        const inspect = state.ui.inspect === model.id;
        return h("circle", {
          cx: sx(metricValue(model, xKey)),
          cy: sy(metricValue(model, yKey)),
          r: inCompare || inspect ? "9" : "7",
          class: "model-point" + (inspect ? " is-inspect" : "") + (inCompare ? " is-compare" : ""),
          tabindex: "0",
          style: { "--model-color": safeColor(model.color) },
          "aria-label": `${model.name}: ${labelFor(xKey)} ${fmtScore(metricValue(model, xKey))}, ${labelFor(yKey)} ${fmtScore(metricValue(model, yKey))}`,
          onclick: () => setInspect(model.id),
          ondblclick: () => toggleCompare(model.id),
          onkeydown: (e) => pointKey(e, model.id),
        });
      }),
    ]);
    return h("div", { class: "svg-shell" }, [svg, renderLegend()]);
  }

  function renderRadar(models) {
    const chosen = models.length ? models : [state.filteredModels[0]];
    const metrics = ["intelligence", "coding", "agents", "speed", "cost"];
    const size = 460, cx = size / 2, cy = size / 2, radius = 150, labelRadius = radius + 20;
    const angleAt = (i) => -Math.PI / 2 + (Math.PI * 2 * i) / metrics.length;
    const axis = (i, value) => {
      const angle = angleAt(i);
      const r = radius * (clamp(Number(value) || 0, 0, 10) / 10);
      return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
    };
    return h("div", { class: "svg-shell radar-shell" }, [
      h("svg", { class: "analysis-svg radar-svg", viewBox: `0 0 ${size} ${size}`, role: "img", "aria-label": "Selected model radar comparison" }, [
        ...[2, 4, 6, 8, 10].map((tick) => h("polygon", {
          points: metrics.map((_, i) => axis(i, tick).join(",")).join(" "),
          class: "radar-ring",
        })),
        ...metrics.map((metric, i) => {
          const p = axis(i, 10);
          const angle = angleAt(i);
          const lx = cx + Math.cos(angle) * labelRadius;
          const ly = cy + Math.sin(angle) * labelRadius;
          const cosA = Math.cos(angle);
          const anchor = Math.abs(cosA) < 0.3 ? "middle" : cosA > 0 ? "start" : "end";
          const dy = Math.sin(angle) > 0.3 ? 12 : Math.sin(angle) < -0.3 ? -6 : 4;
          return h("g", null, [
            h("line", { x1: cx, y1: cy, x2: p[0], y2: p[1], class: "chart-grid-line" }),
            h("text", { x: lx, y: ly + dy, "text-anchor": anchor, class: "radar-label" }, labelFor(metric)),
          ]);
        }),
        ...chosen.map((model) => h("polygon", {
          points: metrics.map((metric, i) => axis(i, model[metric]).join(",")).join(" "),
          class: "radar-shape",
          style: { "--model-color": safeColor(model.color) },
        })),
      ]),
      renderLegend(chosen),
    ]);
  }

  // Unified comparison surface shared by the table and chart subpages.
  // compare set drives it; falls back to the inspected model so it's never blank.
  // 1 model -> labeled bars, 2+ -> grade boxes.
  function renderCompareArea() {
    const compare = compareModels();
    const showModels = compare.length ? compare : [inspectModel()].filter(Boolean);
    const heading = h("div", { class: "compare-area-head" }, [
      h("h2", { class: "compare-area-title" }, compare.length ? `Comparing ${compare.length} ${compare.length === 1 ? "model" : "models"}` : "Model detail"),
      h("p", { class: "compare-area-hint" }, compare.length
        ? "Check more rows to stack them side by side, or uncheck to remove."
        : "Showing the selected model. Check the Compare box on any row to stack models here."),
    ]);
    if (!showModels.length) {
      return h("section", { class: "compare-area", "aria-label": "Model comparison" }, [heading, emptyState("No models to show", "Adjust filters to bring models back.")]);
    }
    const mode = showModels.length === 1 ? "bars" : "grade";
    return h("section", { class: "compare-area", "aria-label": "Model comparison" }, [
      heading,
      h("div", { class: "compare-grid mode-" + mode }, showModels.map((model) => modelStatCard(model, mode))),
    ]);
  }

  function modelStatCard(model, mode) {
    const inCompare = state.ui.compare.includes(model.id);
    const card = modelCardUrl(model);
    const head = h("header", { class: "stat-card-head" }, [
      providerLogo(model, 38),
      h("div", { class: "stat-card-titles" }, [
        h("strong", { class: "stat-card-name" }, model.name || "Unknown model"),
        h("span", { class: "stat-card-vendor" }, model.vendor || "Unknown vendor"),
      ]),
      h("span", { class: "stat-card-tier " + tier(overall(model)).cls, title: "Overall tier" }, tier(overall(model)).label),
    ]);
    const meta = h("dl", { class: "stat-card-meta" }, [
      metaItem("Cost", model.pricing || (Number.isFinite(Number(model.cost)) ? "Cost score " + fmtScore(model.cost) : "Not listed")),
      metaItem("Released", model.released || "Unknown"),
      metaItem("Tracked since", fmtDate(model.first_seen) || "Unknown"),
      metaItem("Type", model.params || "Unknown"),
      h("div", { class: "meta-item meta-item-caps" }, [h("dt", null, "Inputs"), h("dd", null, capabilityChips(model, 16))]),
      model.status && model.status !== "active" ? metaItem("Status", titleCaseSlug(model.status)) : null,
      model.deprecated_on ? metaItem("Deprecated", fmtDate(model.deprecated_on)) : null,
    ]);
    const notes = model.notes ? h("p", { class: "model-notes" }, model.notes) : null;
    const link = card.url ? h("a", { class: "stat-card-link", href: card.url, target: "_blank", rel: "noopener noreferrer" }, [card.official ? "Model card" : "Find model card", h("span", { "aria-hidden": "true" }, " ↗")]) : null;
    const remove = inCompare ? h("button", { class: "compare-remove", type: "button", onclick: () => toggleCompare(model.id), "aria-label": "Remove " + model.name }, "×") : null;

    if (mode === "bars") {
      // Two columns on wide screens: identity/meta on the left, bars on the
      // right, so a single model doesn't stretch into one awkward full-bleed row.
      return h("article", { class: "stat-model-card mode-bars", style: { "--model-color": safeColor(model.color) } }, [
        remove,
        h("div", { class: "stat-card-summary" }, [head, meta, notes, link]),
        h("div", { class: "stat-card-bars-col" }, statBars(model)),
      ]);
    }
    return h("article", { class: "stat-model-card mode-grade", style: { "--model-color": safeColor(model.color) } }, [
      remove, head, meta, gradeGrid(model), notes, link,
    ]);
  }

  function metaItem(label, value) {
    return h("div", { class: "meta-item" }, [
      h("dt", null, label),
      h("dd", null, value),
    ]);
  }

  const BAR_METRICS = [
    ["intelligence", "Intelligence"],
    ["coding", "Coding"],
    ["agents", "Agent"],
    ["speed", "Speed"],
    ["cost", "Cost"],
  ];

  // Distinct iridescent hue per metric so the bars read individually instead of
  // one undifferentiated teal-purple wash.
  const BAR_COLOR = {
    overall: "var(--vw-iridescent-6)",
    value: "var(--vw-iridescent-5)",
    intelligence: "var(--vw-iridescent-7)",
    coding: "var(--vw-iridescent-3)",
    agents: "var(--vw-iridescent-4)",
    speed: "var(--vw-iridescent-2)",
    cost: "var(--vw-iridescent-1)",
  };

  function statBars(model) {
    const rowsOut = [["overall", "Overall", overall(model)], ["value", "Value", valueScore(model)]]
      .concat(BAR_METRICS.map(([k, label]) => [k, label, Number(model[k])]));
    return h("div", { class: "stat-bars" }, rowsOut.map(([key, label, value]) => {
      const v = Number(value);
      const pct = Number.isFinite(v) ? clamp(v, 0, 10) * 10 : 0;
      return h("div", { class: "stat-bar" + (key === "overall" || key === "value" ? " is-headline" : ""), style: { "--bar-color": BAR_COLOR[key] || "var(--model-color)" } }, [
        h("span", { class: "stat-bar-label" }, label),
        h("div", { class: "stat-bar-track" }, h("div", { class: "stat-bar-fill", style: { width: pct + "%" } })),
        h("span", { class: "stat-bar-val" }, fmtScore(value)),
      ]);
    }));
  }

  function gradeGrid(model) {
    const cells = [["overall", "Overall", overall(model)], ["value", "Value", valueScore(model)]]
      .concat(BAR_METRICS.map(([k, label]) => [k, label, Number(model[k])]));
    return h("div", { class: "grade-grid" }, cells.map(([key, label, value]) => {
      const t = tier(value);
      return h("div", { class: "grade-box " + t.cls, title: `${label}: ${fmtScore(value)}` }, [
        h("span", { class: "grade-label" }, label),
        h("span", { class: "grade-letter" }, t.label),
        h("span", { class: "grade-score" }, fmtScore(value)),
      ]);
    }));
  }

  // Prefer the official card_url recorded by the update (schema_version 3).
  // Fall back to a web-search lookup only when a model predates that field.
  function modelCardUrl(model) {
    if (!model) return { url: "", official: false };
    const card = String(model.card_url || "").trim();
    if (/^https?:\/\//i.test(card)) return { url: card, official: true };
    if (!model.name) return { url: "", official: false };
    const q = encodeURIComponent([model.vendor, model.name, "model card"].filter(Boolean).join(" "));
    return { url: "https://www.google.com/search?q=" + q, official: false };
  }

  function renderLegend(list) {
    const source = list && list.length ? list : state.filteredModels;
    const vendors = new Map();
    source.forEach((m) => { if (!vendors.has(m.vendor || "Other")) vendors.set(m.vendor || "Other", safeColor(m.color)); });
    return h("div", { class: "chart-legend", role: "group", "aria-label": "Filter by provider" }, [...vendors.entries()].map(([name, color]) => {
      const active = state.ui.vendors.includes(name);
      return h("button", {
        type: "button",
        class: "legend-chip" + (active ? " is-active" : ""),
        style: { "--model-color": color },
        "aria-pressed": String(active),
        title: active ? "Showing only " + name + " — click to clear" : "Filter to " + name,
        onclick: () => toggleVendor(name),
      }, name);
    }));
  }

  function toggleCapability(cap) {
    const list = state.ui.inputCapabilities || [];
    state.ui.inputCapabilities = list.includes(cap) ? list.filter((c) => c !== cap) : [...list, cap];
    refreshModels();
    render();
  }

  function toggleVendor(name) {
    const list = state.ui.vendors || [];
    state.ui.vendors = list.includes(name) ? list.filter((v) => v !== name) : [...list, name];
    refreshModels();
    render();
  }

  function renderChangelog() {
    if (!state.changelogs.length) return emptyState("No changelog entries yet", "Run Refresh to create the first append-only update note.", "Run Refresh", handleRefresh);
    const active = state.changelogs.find((c) => c.date === state.activeChangelogDate) || state.changelogs[0];
    ensureChangelog(active);
    return h("section", { class: "changelog-view" }, [
      h("div", { class: "changelog-list vw-scroll-shadow" }, state.changelogs.map((item) => h("button", {
        class: "changelog-item vw-card-compact" + (item.date === active.date ? " is-active" : ""),
        type: "button",
        onclick: () => { state.activeChangelogDate = item.date; render(); },
      }, [
        h("span", { class: "changelog-date" }, fmtDate(item.date, true)),
        h("strong", { class: "changelog-title" }, item.title || "Daily update"),
        h("span", { class: "changelog-summary" }, item.summary || "No summary recorded."),
      ]))),
      h("article", { class: "changelog-panel" }, [
        h("header", { class: "changelog-panel-head" }, [
          h("h2", null, active.title || "Daily update"),
        ]),
        h("div", { class: "changelog-body vw-scroll-shadow" }, renderMarkdown(state.changelogBodies[active.date], active.title, active.summary)),
      ]),
    ]);
  }

  async function ensureChangelog(item) {
    if (!item || state.changelogBodies[item.date]) return;
    try {
      const res = await fetch("/" + String(item.path || "").replace(/^\/+/, ""), { cache: "no-store" });
      state.changelogBodies[item.date] = res.ok ? await res.text() : "Could not load changelog.";
    } catch (error) {
      state.changelogBodies[item.date] = message(error);
    }
    if (state.area === "changelog") render();
  }

  function renderStats() {
    if (!state.metrics.length) {
      return emptyState("No run telemetry yet", "After Refresh completes, token use, cost, duration, and agent stats will appear here.", "Run Refresh", handleRefresh);
    }
    const filtered = filteredMetrics();
    if (!filtered.length) {
      return h("section", { class: "stats-workbench" }, [
        h("div", { class: "stats-toolbar" }, [
          h("label", { class: "field compact" }, [h("span", null, "Agent"), agentSelect()]),
          h("label", { class: "field compact" }, [h("span", null, "Range"), rangeSelect()]),
        ]),
        emptyState("No telemetry matches this view", "Clear the Agent or Range filter to bring runs back.", "Clear filters", () => {
          state.ui.statsAgent = "";
          state.ui.statsRange = "all";
          savePrefs();
          render();
        }),
      ]);
    }
    const totals = filtered.reduce((acc, row) => {
      acc.runs += 1;
      acc.cost += Number(row.cost_usd) || 0;
      acc.tokens += (Number(row.tokens_input) || 0) + (Number(row.tokens_output) || 0) + (Number(row.tokens_cached) || 0);
      acc.words += Number(row.word_count) || 0;
      acc.duration += Number(row.duration_sec) || 0;
      return acc;
    }, { runs: 0, cost: 0, tokens: 0, words: 0, duration: 0 });
    const single = filtered.length < 2;
    return h("section", { class: "stats-workbench" }, [
      h("div", { class: "stats-toolbar" }, [
        h("div", { class: "stats-toolbar-controls" }, [
          h("label", { class: "field compact" }, [h("span", null, "Agent"), agentSelect()]),
          h("label", { class: "field compact" }, [h("span", null, "Range"), rangeSelect()]),
        ]),
        single ? h("div", { class: "stats-inline-cta" }, [
          h("span", { class: "stats-inline-cta-text" }, "One run so far — refresh again to unlock trends."),
          h("button", { class: "vw-btn vw-btn-primary vw-btn-sm", type: "button", onclick: handleRefresh }, "Run Refresh"),
        ]) : null,
      ]),
      h("div", { class: "stats-grid" }, [
        statCard("Runs", totals.runs ? String(totals.runs) : "—", totals.runs === 1 ? "1 update run" : `${totals.runs} update runs`),
        statCard("Cost", money.format(totals.cost), "Provider spend recorded by updates"),
        statCard("Tokens", totals.tokens ? compact.format(totals.tokens) : "—", "Input, output, and cached"),
        statCard("Words", totals.words ? int.format(totals.words) : "—", "Changelog body length"),
      ]),
      single ? null : h("div", { class: "analytics-grid" }, [
        h("section", { class: "panel-card" }, [h("h3", null, "Run duration"), miniBars(filtered, "duration_sec", "Duration seconds")]),
        h("section", { class: "panel-card" }, [h("h3", null, "Cost per run"), miniBars(filtered, "cost_usd", "Cost USD")]),
        h("section", { class: "panel-card" }, [h("h3", null, "Agent leaderboard"), leaderboard(filtered)]),
      ]),
    ]);
  }

  function renderSettings() {
    return h("section", { class: "settings-workbench" }, [
      h("div", { class: "settings-detail" }, renderSettingsSubpage()),
    ]);
  }

  function renderSettingsSubpage() {
    if (state.subpage.settings === "models") return settingsModels();
    if (state.subpage.settings === "research") return settingsResearch();
    if (state.subpage.settings === "schedule") return settingsSchedule();
    if (state.subpage.settings === "reset") return settingsReset();
    return settingsProvider();
  }

  const RESET_SCOPES = [
    { scope: "stats", token: "STATS", title: "Reset stats", copy: "Clear run telemetry (tokens, cost, duration, agent leaderboard) and regenerate the metrics CSV. Models, scores, and changelogs stay." },
    { scope: "changelog", token: "CHANGELOG", title: "Reset changelog", copy: "Delete every changelog entry and its run metrics. This is the only sanctioned exception to the append-only rule — update runs never delete history." },
    { scope: "models", token: "MODELS", title: "Reset models", copy: "Clear all models and scores, then re-seed the bootstrap model set so the dashboard isn't empty. Changelogs and stats stay." },
    { scope: "full", token: "RESET", title: "Full reset", copy: "Wipe the local database, metrics CSV, run logs, app config, and schedule, then re-seed on reload." },
  ];

  function settingsReset() {
    return h("section", { class: "settings-panel panel-card reset-panel", "aria-label": "Reset" }, [
      h("p", { class: "settings-summary" }, "Destructive, local-only actions. Each needs its typed confirmation."),
      h("p", { class: "reset-safe-note" }, [
        h("span", { class: "reset-safe-dot", "aria-hidden": "true" }),
        "Voidware credentials, saved provider keys, and broker grants are not affected by any reset.",
      ]),
      h("div", { class: "reset-actions" }, RESET_SCOPES.map(resetCard)),
    ]);
  }

  function resetCard(item) {
    const typed = (state.resetTokens && state.resetTokens[item.scope]) || "";
    const ready = typed === item.token;
    const busy = state.resetBusy === item.scope;
    return h("div", { class: "reset-card" + (item.scope === "full" ? " is-danger" : "") }, [
      h("div", { class: "reset-card-text" }, [
        h("strong", { class: "reset-card-title" }, item.title),
        h("p", { class: "reset-card-copy" }, item.copy),
      ]),
      h("div", { class: "reset-card-action" }, [
        h("label", { class: "field reset-confirm-field" }, [
          h("span", { class: "sr-only" }, "Type " + item.token + " to confirm"),
          h("input", {
            type: "text",
            value: typed,
            placeholder: "Type " + item.token,
            "aria-label": "Type " + item.token + " to confirm " + item.title,
            autocomplete: "off",
            spellcheck: "false",
            oninput: (e) => { state.resetTokens = { ...(state.resetTokens || {}), [item.scope]: e.target.value }; updateResetButton(item); },
          }),
        ]),
        h("button", {
          class: "vw-btn " + (item.scope === "full" ? "vw-btn-danger" : "vw-btn-secondary") + " reset-run-btn",
          type: "button",
          "data-scope": item.scope,
          disabled: !ready || busy,
          onclick: () => performReset(item),
        }, busy ? "Resetting…" : "Reset"),
      ]),
    ]);
  }

  // Live-toggle the button without a full re-render so the input keeps focus.
  function updateResetButton(item) {
    const typed = (state.resetTokens && state.resetTokens[item.scope]) || "";
    const btn = document.querySelector(`.reset-run-btn[data-scope="${item.scope}"]`);
    if (btn) btn.disabled = typed !== item.token || state.resetBusy === item.scope;
  }

  async function performReset(item) {
    state.resetBusy = item.scope;
    render();
    try {
      const data = await api("/api/reset", { method: "POST", body: { scope: item.scope, confirm_token: item.token } });
      state.resetBusy = "";
      state.resetTokens = { ...(state.resetTokens || {}), [item.scope]: "" };
      await applyResetAftermath(item.scope, data);
      toast(item.title + " complete", "success");
    } catch (error) {
      state.resetBusy = "";
      toast(message(error), "error");
      render();
    }
  }

  async function applyResetAftermath(scope, data) {
    if (scope === "full") {
      location.assign(location.pathname + "?reset=1");
      return;
    }
    if (scope === "changelog") { state.changelogBodies = {}; state.activeChangelogDate = ""; }
    if (scope === "models") { state.ui.compare = []; state.ui.inspect = ""; state.focusIndex = 0; }
    await loadDatabase();
    await pollMeta();
    refreshModels();
    render();
  }

  function settingsProvider() {
    const f = state.forms.provider;
    return panel("Connection", providerStatusCopy(), [
      state.credentials.length ? h("label", { class: "field" }, [
        h("span", null, "Saved Voidware key"),
        h("select", { value: f.provider_credential_name || "", onchange: (e) => { f.provider_credential_name = e.target.value; } }, [
          h("option", { value: "" }, "Use typed key or current saved key"),
          ...state.credentials.map((c) => h("option", { value: c.name }, c.label || c.name)),
        ]),
      ]) : h("p", { class: "settings-note" }, "No saved API key on file yet."),
      h("label", { class: "field" }, [h("span", null, "Base URL"), input(f, "base_url", "https://api.openai.com")]),
      h("label", { class: "field" }, [h("span", null, "API key"), input(f, "api_key", "Only needed when saving a new key", "password")]),
      h("label", { class: "field" }, [h("span", null, "Models URL override"), input(f, "models_override_url", "Optional")]),
      h("label", { class: "field" }, [h("span", null, "Endpoint mode"), h("select", { value: f.endpoint_mode, onchange: (e) => { f.endpoint_mode = e.target.value; } }, [
        h("option", { value: "append_v1" }, "Append /v1"),
        h("option", { value: "root" }, "Use URL as root"),
      ])]),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: testConnection }, "Test connection"),
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: saveProviderSettings }, "Save connection"),
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: openManualPrompt }, "Manual prompt"),
      ]),
    ]);
  }

  function settingsModels() {
    const f = state.forms.models;
    return panel("Models", "Choose the default model and an optional backup for update runs.", [
      h("label", { class: "field" }, [h("span", null, "Default model"), input(f, "default_model", "e.g. gpt-4.1")]),
      h("label", { class: "field" }, [h("span", null, "Backup model"), input(f, "backup_model", "Optional fallback")]),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => testModel("default") }, "Test default"),
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => testModel("backup") }, "Test backup"),
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: saveProviderSettings }, "Save models"),
      ]),
    ]);
  }

  function settingsResearch() {
    const f = state.forms.research;
    return panel("Research", "Add API keys here. They're stored locally, not in the repo.", [
      h("div", { class: "status-row" }, [statusPill(state.provider.exa_configured ? "Configured" : "Not configured", state.provider.exa_configured ? "fresh" : "unknown"), h("span", null, "Exa search")]),
      h("label", { class: "field" }, [h("span", null, "Exa API key"), input(f, "exa", "Paste to save", "password")]),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: saveExa }, "Save Exa"),
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: removeExa }, "Remove Exa"),
      ]),
      h("div", { class: "status-row" }, [statusPill(state.provider.llmstats_configured ? "Configured" : "Not configured", state.provider.llmstats_configured ? "fresh" : "unknown"), h("span", null, "LLM Stats")]),
      h("label", { class: "field" }, [h("span", null, "LLM Stats API key"), input(f, "llmstats", "Optional", "password")]),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: saveLLMStats }, "Save LLM Stats"),
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: testLLMStats }, "Test"),
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: removeLLMStats }, "Remove"),
      ]),
    ]);
  }

  function settingsSchedule() {
    const f = state.forms.schedule;
    return panel("Schedule", state.schedule.enabled ? `${state.schedule.cadence} at ${state.schedule.time_local}` : "Automatic updates are off.", [
      h("label", { class: "field" }, [h("span", null, "Cadence"), h("select", { value: f.cadence, onchange: (e) => { f.cadence = e.target.value; render(); } }, [
        h("option", { value: "off" }, "Off"),
        h("option", { value: "daily" }, "Daily"),
        h("option", { value: "weekly" }, "Weekly"),
        h("option", { value: "monthly" }, "Monthly"),
      ])]),
      h("label", { class: "field" }, [h("span", null, "Local time"), input(f, "time_local", "09:00", "time")]),
      f.cadence === "weekly" ? h("label", { class: "field" }, [h("span", null, "Weekday"), h("select", { value: String(f.day_of_week), onchange: (e) => { f.day_of_week = Number(e.target.value); } }, [
        h("option", { value: "1" }, "Monday"),
        h("option", { value: "2" }, "Tuesday"),
        h("option", { value: "3" }, "Wednesday"),
        h("option", { value: "4" }, "Thursday"),
        h("option", { value: "5" }, "Friday"),
        h("option", { value: "6" }, "Saturday"),
        h("option", { value: "7" }, "Sunday"),
      ])]) : null,
      f.cadence === "monthly" ? h("label", { class: "field" }, [h("span", null, "Day of month"), h("select", { value: String(Math.min(Number(f.day_of_month) || 1, 28)), onchange: (e) => { f.day_of_month = Number(e.target.value); } }, Array.from({ length: 28 }, (_, i) => h("option", { value: String(i + 1) }, String(i + 1))))]) : null,
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: saveSchedule }, "Save schedule"),
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: removeSchedule }, "Turn off"),
      ]),
      state.schedule.log_path ? h("p", { class: "settings-note" }, "Last log: " + state.schedule.log_path) : null,
    ]);
  }

  function panel(title, summary, children) {
    return h("section", { class: "settings-panel panel-card", "aria-label": title }, [
      summary ? h("p", { class: "settings-summary" }, summary) : null,
      h("div", { class: "settings-fields" }, children),
    ]);
  }

  async function saveProviderSettings() {
    const payload = {
      ...state.forms.provider,
      ...state.forms.models,
      api_key: state.forms.provider.api_key || null,
      provider_credential_name: state.forms.provider.provider_credential_name || null,
    };
    try {
      state.provider = await api("/api/provider", { method: "POST", body: payload });
      hydrateForms();
      toast("Connection saved", "success");
      render();
    } catch (error) {
      const detail = error.payload && error.payload.detail;
      if (detail && (detail.code === "approval_pending" || detail.code === "approval_waiting")) {
        state.approval = { open: true, password: "", secret: "", error: "", after: saveProviderSettings };
        render();
      } else toast(message(error), "error");
    }
  }

  async function testConnection() {
    try {
      const data = await api("/api/provider/test-connection", { method: "POST", body: { ...state.forms.provider, ...state.forms.models } });
      toast(data.ok ? `${data.models_count || 0} models visible` : `Provider returned HTTP ${data.status_code}`, data.ok ? "success" : "warning");
    } catch (error) { toast(message(error), "error"); }
  }

  async function testModel(target) {
    try {
      const data = await api("/api/provider/test-model", { method: "POST", body: { target } });
      toast(data.ok ? `${target} model replied` : `${target} model failed`, data.ok ? "success" : "warning");
    } catch (error) { toast(message(error), "error"); }
  }

  async function saveExa() {
    if (!state.forms.research.exa.trim()) return toast("Paste an Exa key first.", "warning");
    try {
      await api("/api/exa", { method: "POST", body: { api_key: state.forms.research.exa.trim() } });
      state.forms.research.exa = "";
      await loadProvider();
      toast("Exa saved", "success");
      render();
    } catch (error) { if (!openApproval(error, saveExa)) toast(message(error), "error"); }
  }

  async function removeExa() {
    if (!confirm("Remove the saved Exa key?")) return;
    try { await api("/api/exa", { method: "DELETE" }); await loadProvider(); toast("Exa removed", "success"); render(); }
    catch (error) { toast(message(error), "error"); }
  }

  async function saveLLMStats() {
    if (!state.forms.research.llmstats.trim()) return toast("Paste an LLM Stats key first.", "warning");
    try {
      await api("/api/llmstats", { method: "POST", body: { api_key: state.forms.research.llmstats.trim() } });
      state.forms.research.llmstats = "";
      await loadProvider();
      toast("LLM Stats saved", "success");
      render();
    } catch (error) { if (!openApproval(error, saveLLMStats)) toast(message(error), "error"); }
  }

  async function testLLMStats() {
    try { const data = await api("/api/llmstats/test-connection"); toast(data.ok ? "LLM Stats is reachable" : "LLM Stats test failed", data.ok ? "success" : "warning"); }
    catch (error) { toast(message(error), "error"); }
  }

  async function removeLLMStats() {
    if (!confirm("Remove the saved LLM Stats key?")) return;
    try { await api("/api/llmstats", { method: "DELETE" }); await loadProvider(); toast("LLM Stats removed", "success"); render(); }
    catch (error) { toast(message(error), "error"); }
  }

  async function saveSchedule() {
    try {
      const f = state.forms.schedule;
      const payload = { ...f, day_of_month: Math.min(Math.max(Number(f.day_of_month) || 1, 1), 28), day_of_week: Math.min(Math.max(Number(f.day_of_week) || 1, 1), 7) };
      state.schedule = f.cadence === "off" ? await api("/api/schedule", { method: "DELETE" }) : await api("/api/schedule", { method: "POST", body: payload });
      toast(f.cadence === "off" ? "Schedule turned off" : "Schedule saved", "success");
      render();
    } catch (error) { toast(message(error), "error"); }
  }

  async function removeSchedule() {
    try { state.schedule = await api("/api/schedule", { method: "DELETE" }); state.forms.schedule.cadence = "off"; toast("Schedule turned off", "success"); render(); }
    catch (error) { toast(message(error), "error"); }
  }

  async function approveVoidware() {
    try {
      await api("/api/voidware/broker/approval", { method: "POST", body: { password: state.approval.password, secret: state.approval.secret } });
      const after = state.approval.after;
      state.approval = { open: false, password: "", secret: "", error: "", after: null };
      render();
      if (typeof after === "function") await after();
    } catch (error) {
      state.approval.error = message(error);
      render();
    }
  }

  function openApproval(error, after) {
    const detail = error && error.payload && error.payload.detail;
    if (!detail || (detail.code !== "approval_pending" && detail.code !== "approval_waiting")) return false;
    state.approval = { open: true, password: "", secret: "", error: "", after };
    render();
    return true;
  }

  async function handleRefresh() {
    if (!state.provider.has_provider) {
      navigate("settings", "provider");
      toast("Add a provider connection first.", "warning");
      return;
    }
    try {
      const data = await api("/api/run-update", { method: "POST" });
      state.run = { open: true, id: data.id, state: data.state || "running", started: Date.now(), tail: "", error: "" };
      render();
      pollRun();
    } catch (error) { toast(message(error), "error"); }
  }

  async function pollRun() {
    if (!state.run.id) return;
    window.clearTimeout(state.runTimer);
    try {
      const data = await api("/api/run-update/" + encodeURIComponent(state.run.id));
      state.run.state = data.state || "running";
      state.run.tail = data.tail || "";
      if (state.run.state === "succeeded") {
        toast("Dashboard update finished", "success");
        await loadDatabase();
        refreshModels();
        render();
      } else if (state.run.state === "failed") {
        state.run.error = data.tail || "Update failed.";
        render();
      } else {
        render();
        state.runTimer = window.setTimeout(pollRun, RUN_POLL_MS);
      }
    } catch (error) {
      state.run.error = message(error);
      state.run.state = "failed";
      render();
    }
  }

  async function openManualPrompt() {
    state.manualOpen = true;
    state.prompt = "";
    render();
    try {
      const data = await api("/api/prompt");
      state.prompt = data.prompt || "";
      await copyText(state.prompt);
      toast("Prompt copied", "success");
      render();
    } catch (error) {
      state.prompt = message(error);
      render();
    }
  }

  function renderOverlay() {
    const nodes = [];
    if (state.helpOpen) nodes.push(modal("Keyboard shortcuts", [
      shortcut("/", "Search models"),
      shortcut("j / k", "Move through visible models"),
      shortcut("Enter", "Inspect the focused model (bars view)"),
      shortcut("c / x", "Toggle the focused model in compare"),
      shortcut("e", "Export current models"),
      shortcut("r", "Run refresh"),
      shortcut("?", "Open this panel"),
      shortcut("Esc", "Close drawer or dialogs"),
      h("p", { class: "shortcut-note" }, "Tip: check the Compare box on a row (or double-click a chart point) to stack models. One model shows bars, several show grade boxes. Click a provider in the chart legend to filter."),
    ], () => { state.helpOpen = false; render(); }));
    if (state.manualOpen) nodes.push(modal("Manual update prompt", [
      h("p", null, "The prompt is copied when possible. Use it with Claude, Codex, Gemini, or another agent in this repo."),
      h("textarea", { class: "prompt-box", readonly: "", value: state.prompt || "Loading prompt..." }),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => copyText(state.prompt).then(() => toast("Prompt copied", "success")) }, "Copy again"),
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: openTerminal }, "Open terminal"),
      ]),
    ], () => { state.manualOpen = false; render(); }));
    if (state.run.open) nodes.push(modal("Refresh run", [
      h("div", { class: "run-status" }, [statusPill(state.run.state, state.run.state === "failed" ? "expired" : state.run.state === "succeeded" ? "fresh" : "stale"), h("span", null, state.run.id || "starting")]),
      h("pre", { class: "run-log" }, state.run.tail || state.run.error || "Waiting for update logs..."),
      state.run.state === "succeeded" || state.run.state === "failed" ? h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => { state.run.open = false; render(); } }, "Close") : null,
    ], state.run.state === "running" ? null : () => { state.run.open = false; render(); }));
    if (state.approval.open) nodes.push(modal("Voidware approval", [
      h("p", null, "Unlock Voidware once so LLM-Dash can save the requested credential."),
      state.approval.error ? h("p", { class: "error-copy" }, state.approval.error) : null,
      h("label", { class: "field" }, [h("span", null, "Password"), h("input", { type: "password", value: state.approval.password, oninput: (e) => { state.approval.password = e.target.value; } })]),
      h("label", { class: "field" }, [h("span", null, "Secret"), h("input", { type: "password", value: state.approval.secret, oninput: (e) => { state.approval.secret = e.target.value; } })]),
      h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: approveVoidware }, "Approve"),
    ], () => { state.approval.open = false; render(); }));
    els.overlay.replaceChildren(...nodes);
    document.body.classList.toggle("has-overlay", nodes.length > 0 || state.drawerOpen);
  }

  function modal(title, children, onClose) {
    return h("div", { class: "modal-backdrop", role: "presentation" }, [
      h("section", { class: "modal-card", role: "dialog", "aria-modal": "true", "aria-label": title }, [
        h("header", { class: "modal-head" }, [
          h("h2", null, title),
          onClose ? h("button", { class: "icon-action", type: "button", onclick: onClose, "aria-label": "Close" }, "×") : null,
        ]),
        h("div", { class: "modal-body" }, children),
      ]),
    ]);
  }

  function syncShell() {
    const config = AREA[state.area] || AREA.models;
    if (els.mobileTitle) els.mobileTitle.textContent = config.title;
    document.querySelectorAll(".view-btn[data-area]").forEach((btn) => {
      const current = btn.dataset.area === state.area;
      btn.toggleAttribute("aria-current", current);
      btn.classList.toggle("active", current);
    });
    updateFreshness();
    els.sidebar.classList.toggle("open", state.drawerOpen);
    els.sidebar.dataset.vwOpen = state.drawerOpen ? "true" : "false";
    els.backdrop.classList.toggle("open", state.drawerOpen);
    els.backdrop.dataset.vwOpen = state.drawerOpen ? "true" : "false";
    els.toggle.setAttribute("aria-expanded", String(state.drawerOpen));
    els.content.toggleAttribute("inert", state.drawerOpen);
  }

  function updateFreshness() {
    if (!els.freshness) return;
    els.freshness.removeAttribute("role");
    els.freshness.removeAttribute("tabindex");
    if (!state.lastUpdated) {
      els.freshness.textContent = "Last update: never";
      els.freshness.title = "No update recorded yet";
      return;
    }
    const age = Date.now() - Date.parse(state.lastUpdated);
    els.freshness.textContent = "Last update: " + humanAge(age);
    els.freshness.title = new Date(state.lastUpdated).toLocaleString();
  }

  function bindShell() {
    document.querySelectorAll(".view-btn[data-area]").forEach((btn) => btn.addEventListener("click", () => navigate(btn.dataset.area, btn.dataset.view === "chart" ? "chart" : btn.dataset.area === "models" ? "table" : btn.dataset.area === "settings" ? "provider" : "index")));
    els.refresh.addEventListener("click", handleRefresh);
    els.help.addEventListener("click", () => { state.helpOpen = true; render(); });
    els.toggle.addEventListener("click", () => { state.drawerOpen = true; render(); });
    els.backdrop.addEventListener("click", closeDrawer);
    els.close.addEventListener("click", closeDrawer);
    window.addEventListener("hashchange", () => { applyRoute(parseHash(location.hash)); render(); });
    window.addEventListener("popstate", () => { applyRoute(parseHash(location.hash)); render(); });
    window.addEventListener("keydown", keydown);
    window.addEventListener("resize", () => {
      window.clearTimeout(state.chartResize);
      state.chartResize = window.setTimeout(() => { if (state.area === "models" && state.subpage.models === "chart") render(); }, 150);
    });
  }

  function keydown(event) {
    if (event.key === "Escape") {
      if (state.helpOpen || state.manualOpen || state.approval.open) {
        state.helpOpen = false; state.manualOpen = false; state.approval.open = false; render(); return;
      }
      if (state.drawerOpen) { closeDrawer(); return; }
      if (state.run.open && state.run.state !== "running") { state.run.open = false; render(); return; }
    }
    if (state.drawerOpen || state.helpOpen || state.manualOpen || state.approval.open) return;
    if (event.key === "/" && state.area === "models") {
      event.preventDefault();
      document.getElementById("model-search")?.focus();
    } else if (event.key === "e") exportModels();
    else if (event.key === "r") handleRefresh();
    else if (event.key === "?") { state.helpOpen = true; render(); }
    else if (event.key === "j" || event.key === "k") moveFocus(event.key === "j" ? 1 : -1);
  }

  function closeDrawer() {
    state.drawerOpen = false;
    render();
    els.toggle.focus({ preventScroll: true });
  }

  function navigate(area, subpage) {
    state.area = area || "models";
    if (subpage && state.subpage[state.area] !== undefined) state.subpage[state.area] = subpage;
    state.drawerOpen = false;
    history.pushState({}, "", hashFor(state.area, state.subpage[state.area]));
    render();
  }

  function parseHash(hash) {
    const raw = String(hash || "").replace(/^#/, "");
    const legacy = { table: ["models", "table"], chart: ["models", "chart"], data: ["settings", "provider"], settings: ["settings", "provider"], changelog: ["changelog", "index"], stats: ["stats", "index"] };
    if (!raw) return ["models", "table"];
    if (legacy[raw]) return legacy[raw];
    const [area, sub] = raw.split(/[/?]/);
    return [AREA[area] ? area : "models", sub || (area === "settings" ? "provider" : area === "models" ? "table" : "index")];
  }

  function applyRoute(route) {
    state.area = route[0];
    if (state.subpage[state.area] !== undefined) state.subpage[state.area] = route[1];
  }

  function hashFor(area, sub) {
    if (area === "models") return "#models/" + (sub || "table");
    if (area === "settings") return "#settings/" + (sub || "provider");
    return "#" + area;
  }

  function compareModels() {
    const byId = new Map(state.filteredModels.map((m) => [m.id, m]));
    return state.ui.compare.map((id) => byId.get(id)).filter(Boolean);
  }

  function inspectModel() {
    const byId = new Map(state.filteredModels.map((m) => [m.id, m]));
    return byId.get(state.ui.inspect) || state.filteredModels[0] || null;
  }

  function setInspect(id) {
    state.ui.inspect = id;
    const idx = state.filteredModels.findIndex((m) => m.id === id);
    if (idx >= 0) state.focusIndex = idx;
    savePrefs();
    render();
  }

  function toggleCompare(id) {
    const list = state.ui.compare;
    if (list.includes(id)) {
      state.ui.compare = list.filter((x) => x !== id);
    } else if (list.length >= MAX_COMPARE) {
      toast(`Compare holds up to ${MAX_COMPARE} models. Uncheck one first.`, "warning");
      return;
    } else {
      state.ui.compare = [...list, id];
    }
    savePrefs();
    render();
  }

  function clearCompare() {
    state.ui.compare = [];
    savePrefs();
    render();
  }

  function pointKey(event, id) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setInspect(id); }
    if (event.key === "c" || event.key === "x") { event.preventDefault(); toggleCompare(id); }
  }

  function rowKey(event, index, id) {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setInspect(id); }
    if (event.key === "c" || event.key === "x") { event.preventDefault(); toggleCompare(id); }
    if (event.key === "j" || event.key === "ArrowDown") { event.preventDefault(); moveFocus(1, index); }
    if (event.key === "k" || event.key === "ArrowUp") { event.preventDefault(); moveFocus(-1, index); }
  }

  function moveFocus(delta, from) {
    if (state.area !== "models" || !state.filteredModels.length) return;
    const idx = clamp(Number.isFinite(from) ? from + delta : state.focusIndex + delta, 0, state.filteredModels.length - 1);
    state.focusIndex = idx;
    document.querySelectorAll("table.models tbody tr")[idx]?.focus();
  }

  function setSort(key) {
    if (state.ui.sortKey === key) state.ui.sortDir = state.ui.sortDir === "desc" ? "asc" : "desc";
    else { state.ui.sortKey = key; state.ui.sortDir = "desc"; }
    refreshModels();
    render();
  }

  function debounceSearch(value) {
    window.clearTimeout(state.searchDebounce);
    state.searchDebounce = window.setTimeout(() => {
      state.ui.text = value;
      refreshModels();
      render();
    }, 180);
  }

  function resetFilters() {
    Object.assign(state.ui, {
      text: "", vendors: [], tier: "", status: "", minOverall: 0, hasPricing: false, releasedAfter: "",
      inputCapabilities: [], hideDeprecated: false,
    });
    refreshModels();
    render();
  }

  function filterCount() {
    const ui = state.ui;
    return [
      ui.text.trim(),
      ui.vendors.length,
      ui.tier,
      ui.status,
      Number(ui.minOverall) > 0,
      ui.hasPricing,
      ui.releasedAfter,
      ui.inputCapabilities.length,
      ui.hideDeprecated,
    ].filter(Boolean).length;
  }

  function exportModels() {
    if (!state.filteredModels.length) return toast("No models to export. Clear filters or reset the view.", "warning");
    const headers = ["rank", "model", "vendor", "status", "deprecated_on", "input_capabilities", "released", "tracked_since", "pricing", "intelligence", "coding", "agent", "speed", "cost", "overall", "value"];
    const lines = [headers.join(",")];
    state.filteredModels.forEach((m, i) => lines.push([i + 1, m.name, m.vendor, m.status, m.deprecated_on || "", modelCapabilities(m).join("|"), m.released, m.first_seen, m.pricing, m.intelligence, m.coding, m.agents, m.speed, m.cost, overall(m), valueScore(m)].map(csv).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = h("a", { href: url, download: "llm-dash-models.csv" });
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast(`Exported ${state.filteredModels.length} models`, "success");
  }

  async function pollMeta() {
    try {
      const data = await api("/api/meta");
      if (data.last_updated && state.metaSeen && data.last_updated !== state.metaSeen) {
        state.lastUpdated = data.last_updated;
        state.metaSeen = data.last_updated;
        toast("New dashboard data is ready", "success", "Reload", async () => { await loadDatabase(); refreshModels(); render(); });
      } else if (data.last_updated) {
        state.lastUpdated = data.last_updated;
        state.metaSeen = data.last_updated;
        updateFreshness();
      }
    } catch (_) {}
  }

  function toast(text, tone, actionLabel, action) {
    const modalOpen = state.helpOpen || state.manualOpen || state.approval.open || state.run.open;
    if (modalOpen && tone !== "error") return;
    const id = ++state.toastId;
    const node = h("div", { class: "vw-toast toast", "data-tone": tone || "info", role: tone === "error" ? "alert" : "status" }, [
      h("span", null, text),
      actionLabel ? h("button", { type: "button", onclick: action }, actionLabel) : null,
      h("button", { type: "button", "aria-label": "Dismiss", onclick: () => node.remove() }, "×"),
    ]);
    els.toast.appendChild(node);
    while (els.toast.children.length > 2) els.toast.firstChild.remove();
    window.setTimeout(() => { if (node.isConnected && id <= state.toastId) node.remove(); }, 4500);
  }

  function h(tag, attrs, children) {
    const svgTags = new Set(["svg", "rect", "line", "text", "circle", "polygon", "g", "path"]);
    const el = svgTags.has(tag)
      ? document.createElementNS("http://www.w3.org/2000/svg", tag)
      : document.createElement(tag);
    let pendingValue;
    if (attrs) {
      for (const [key, value] of Object.entries(attrs)) {
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") {
          if (el instanceof SVGElement) el.setAttribute("class", value);
          else el.className = value;
        }
        else if (key === "style") {
          // Custom properties (--x) must go through setProperty; direct
          // assignment / Object.assign silently drops them.
          for (const [prop, val] of Object.entries(value)) {
            if (prop.startsWith("--")) el.style.setProperty(prop, val == null ? "" : String(val));
            else el.style[prop] = val;
          }
        }
        else if (key === "value") {
          pendingValue = value;
          if (tag !== "select") el.value = value;
        }
        else if (key === "checked") el.checked = Boolean(value);
        else if (key === "readonly") el.readOnly = true;
        else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
        else el.setAttribute(key, value);
      }
    }
    if (children !== undefined && children !== null) {
      (Array.isArray(children) ? children : [children]).flat().forEach((child) => {
        if (child === null || child === undefined || child === false) return;
        el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
      });
    }
    if (pendingValue !== undefined) el.value = pendingValue;
    return el;
  }

  function mount(node) {
    els.body.replaceChildren(node);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function modelIdentity(model) {
    const deprecated = model.status === "deprecated";
    return h("div", { class: "model-cell", style: { "--model-color": safeColor(model.color) } }, [
      h("div", { class: "model-cell-text" }, [
        h("div", { class: "model-cell-name-row" }, [
          h("strong", { class: "name" }, highlight(model.name || "Unknown model")),
          deprecated ? h("span", { class: "deprecated-badge", title: depTitle(model) }, "Deprecated") : null,
        ]),
        h("div", { class: "model-cell-meta" }, [
          model.pricing ? h("span", { class: "sub" }, model.pricing) : null,
          capabilityChips(model, 13),
        ]),
      ]),
    ]);
  }

  function depTitle(model) {
    return model.deprecated_on ? "Deprecated " + fmtDate(model.deprecated_on) : "Deprecated";
  }

  function capabilityChips(model, size) {
    const caps = modelCapabilities(model);
    const px = size || 14;
    return h("span", { class: "cap-chips", "aria-label": "Inputs: " + caps.map((c) => CAPABILITY[c].label).join(", ") }, caps.map((c) => {
      const meta = CAPABILITY[c];
      return h("span", { class: "cap-chip", style: { "--cap-color": meta.color, width: px + "px", height: px + "px" }, title: meta.label }, [
        h("svg", { viewBox: "0 0 20 20", "aria-hidden": "true", fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round" }, [
          h("path", { d: meta.glyph }),
        ]),
      ]);
    }));
  }

  function highlight(text) {
    const q = state.ui.text.trim();
    if (!q) return text;
    const frag = document.createDocumentFragment();
    const lower = String(text).toLowerCase();
    const needle = q.toLowerCase();
    let pos = 0, idx;
    while ((idx = lower.indexOf(needle, pos)) !== -1) {
      frag.appendChild(document.createTextNode(String(text).slice(pos, idx)));
      frag.appendChild(h("mark", null, String(text).slice(idx, idx + q.length)));
      pos = idx + q.length;
    }
    frag.appendChild(document.createTextNode(String(text).slice(pos)));
    return frag;
  }

  function scoreTd(score) {
    return h("td", { class: "score-td" }, scoreChip(score));
  }

  function scoreChip(score) {
    const t = tier(score);
    return h("span", { class: "score-chip " + t.cls, title: fmtScore(score) + " · " + t.label + " tier" }, [
      h("span", { class: "score-num" }, fmtScore(score)),
      h("span", { class: "tier-square" }, t.label),
    ]);
  }

  function scoreBlock(label, score) {
    return h("div", { class: "score-block " + tier(score).cls }, [
      h("span", null, label),
      h("strong", null, fmtScore(score)),
      h("em", null, tier(score).label),
    ]);
  }

  function metricSelect(label, key) {
    return h("label", { class: "field compact" }, [
      h("span", null, label),
      h("select", { value: state.ui[key], onchange: (e) => { state.ui[key] = e.target.value; normalizeChartAxes(); savePrefs(); render(); } },
        CHART_METRIC_KEYS.map((metric) => h("option", { value: metric }, labelFor(metric)))),
    ]);
  }

  function modeButton(mode, label) {
    return h("button", {
      type: "button",
      class: state.ui.chartMode === mode ? "active" : "",
      "aria-pressed": String(state.ui.chartMode === mode),
      onclick: () => { state.ui.chartMode = mode; savePrefs(); render(); },
    }, label);
  }

  function statCard(label, value, hint) {
    return h("article", { class: "stat-card" }, [h("span", null, label), h("strong", null, value), h("p", null, hint)]);
  }

  function miniBars(data, key, aria) {
    if (data.length < 2) {
      return h("div", { class: "chart-empty-note" }, [
        h("strong", null, "Needs more runs"),
        h("p", null, "Run Refresh again to turn this into a trend."),
      ]);
    }
    const values = data.slice().reverse().map((r) => Number(r[key]) || 0);
    const max = Math.max(...values, 1);
    const fmtVal = (n) => key === "cost_usd" ? money.format(n) : `${Math.round(n)}s`;
    return h("div", { class: "mini-bars-wrap" }, [
      h("div", { class: "mini-bars", role: "img", "aria-label": aria }, values.map((v) => h("span", { style: { height: Math.max(4, (v / max) * 100) + "%" }, title: fmtVal(v) }))),
      h("div", { class: "mini-bars-axis" }, [
        h("span", null, `${values.length} runs (oldest → newest)`),
        h("span", null, `peak ${fmtVal(max)}`),
      ]),
    ]);
  }

  function leaderboard(data) {
    if (data.length < 3) {
      return h("div", { class: "chart-empty-note" }, [
        h("strong", null, "Runtime leaderboard needs more runs"),
        h("p", null, "Run Refresh until an agent has at least 3 timed runs."),
      ]);
    }
    const map = new Map();
    data.forEach((r) => {
      const key = agentKey(r);
      const item = map.get(key) || { label: displayAgent(r.agent_name, r.agent_runtime), runs: 0, cost: 0, words: 0 };
      item.runs += 1; item.cost += Number(r.cost_usd) || 0; item.words += Number(r.word_count) || 0;
      map.set(key, item);
    });
    return h("div", { class: "leaderboard-list" }, [...map.values()].sort((a, b) => b.runs - a.runs).map((item) => h("div", { class: "leader-row" }, [
      h("strong", null, item.label),
      h("span", null, `${item.runs} ${item.runs === 1 ? "run" : "runs"} · ${money.format(item.cost)} · ${item.words ? int.format(item.words) : "—"} words`),
    ])));
  }

  function agentKey(row) {
    return [row.agent_name || "unknown", row.agent_runtime || "unknown"].join(" · ");
  }

  function titleCaseSlug(value) {
    return String(value || "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).trim();
  }

  function displayAgent(name, runtime) {
    const RUNTIMES = { "claude-code": "Claude Code", "init-script": "init script", "unknown": "unknown" };
    const human = (v) => /^claude-/i.test(v || "") ? titleCaseSlug(String(v).replace(/^claude-/i, "Claude ")) : titleCaseSlug(v) || "Unknown";
    const rt = RUNTIMES[runtime] || titleCaseSlug(runtime) || "unknown";
    return `${human(name)} (${rt})`;
  }

  function agentSelect() {
    const seen = new Map();
    state.metrics.forEach((m) => { const k = agentKey(m); if (!seen.has(k)) seen.set(k, displayAgent(m.agent_name, m.agent_runtime)); });
    const agents = [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
    return h("select", { value: state.ui.statsAgent, onchange: (e) => { state.ui.statsAgent = e.target.value; savePrefs(); render(); } }, [
      h("option", { value: "" }, "All agents"),
      ...agents.map(([key, label]) => h("option", { value: key }, label)),
    ]);
  }

  function rangeSelect() {
    return h("select", { value: state.ui.statsRange, onchange: (e) => { state.ui.statsRange = e.target.value; savePrefs(); render(); } }, [
      h("option", { value: "all" }, "All runs"),
      h("option", { value: "30" }, "Last 30 days"),
      h("option", { value: "7" }, "Last 7 days"),
    ]);
  }

  function filteredMetrics() {
    const now = Date.now();
    return state.metrics.filter((m) => {
      const agent = [m.agent_name || "unknown", m.agent_runtime || "unknown"].join(" · ");
      if (state.ui.statsAgent && agent !== state.ui.statsAgent) return false;
      if (state.ui.statsRange !== "all") {
        const date = Date.parse(m.changelog_date);
        if (Number.isFinite(date) && now - date > Number(state.ui.statsRange) * 86400000) return false;
      }
      return true;
    });
  }

  function emptyState(title, copy, actionLabel, action, tone) {
    return h("section", { class: "empty-state vw-feature-empty-state" + (tone ? " " + tone : "") }, [
      h("div", { class: "empty-icon", "aria-hidden": "true" }, "◇"),
      h("div", { class: "vw-feature-empty-state-copy" }, [
        h("h3", null, title),
        copy ? h("p", null, copy) : null,
        actionLabel ? h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: action }, actionLabel) : null,
      ]),
    ]);
  }

  function renderMarkdown(markdown, title, summary) {
    const box = h("div", null);
    if (!markdown) {
      box.appendChild(h("p", null, "Loading changelog..."));
      return box;
    }
    let text = String(markdown).replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "");
    text = text.replace(/^#\s+.+(?:\r?\n|$)/, "");
    if (title) text = text.replace(new RegExp("^#\\s+" + escapeRegExp(title) + "\\s*", "i"), "");
    if (summary) {
      const normalizedSummary = String(summary).trim().replace(/\s+/g, " ");
      const lines = text.split(/\r?\n/);
      while (lines.length && !lines[0].trim()) lines.shift();
      if (lines[0] && lines[0].trim().replace(/\s+/g, " ") === normalizedSummary) lines.shift();
      text = lines.join("\n").replace(/^\s+/, "");
    }
    box.innerHTML = window.marked ? window.marked.parse(text) : "<pre></pre>";
    if (!window.marked) box.firstChild.textContent = text;
    return box;
  }

  function input(obj, key, placeholder, type) {
    return h("input", { type: type || "text", value: obj[key] || "", placeholder, oninput: (e) => { obj[key] = e.target.value; } });
  }

  function statusPill(label, stateName) {
    return h("span", { class: "vw-status-chip freshness-chip", "data-state": stateName || "unknown" }, label);
  }

  function providerStatusCopy() {
    const broker = state.provider.auth && state.provider.auth.broker ? state.provider.auth.broker : {};
    if (broker.error_code === "legacy_install_over_marker") {
      return "Old install marker found. No saved credentials were loaded; saving a new key will move the marker aside.";
    }
    return state.provider.has_provider ? "Connected. Your key is stored securely on this machine." : "Add a provider to let Refresh run from the dashboard.";
  }

  function shortcut(keys, label) {
    return h("div", { class: "shortcut-row" }, [h("kbd", null, keys), h("span", null, label)]);
  }

  function loadPrefs() {
    try {
      const stored = JSON.parse(localStorage.getItem(STORE_KEY) || "{}");
      if (stored && typeof stored === "object") Object.assign(state.ui, stored);
    } catch (_) {}
    // Normalize against the current shape; never resurrect an auto-selected
    // compare model from older prefs.
    const ui = state.ui;
    ui.compare = Array.isArray(ui.compare) ? ui.compare.slice(0, MAX_COMPARE) : [];
    ui.inspect = typeof ui.inspect === "string" ? ui.inspect : "";
    if (!Array.isArray(ui.vendors)) {
      ui.vendors = typeof ui.vendor === "string" && ui.vendor ? [ui.vendor] : [];
    }
    delete ui.vendor;
    delete ui.selected;
    ui.minOverall = Number(ui.minOverall) || 0;
    ui.hasPricing = Boolean(ui.hasPricing);
    if (typeof ui.status !== "string") ui.status = "";
    if (typeof ui.releasedAfter !== "string") ui.releasedAfter = "";
    ui.inputCapabilities = Array.isArray(ui.inputCapabilities)
      ? ui.inputCapabilities.filter((c) => CAPABILITY_ORDER.includes(c)) : [];
    ui.hideDeprecated = Boolean(ui.hideDeprecated);
    ui.tableZoom = clampZoom(ui.tableZoom);
    ui.colWidths = ui.colWidths && typeof ui.colWidths === "object" && !Array.isArray(ui.colWidths)
      ? Object.fromEntries(Object.entries(ui.colWidths).filter(([, v]) => Number.isFinite(Number(v)))) : {};
    if (!SORT_KEYS.has(ui.sortKey)) ui.sortKey = "overall";
    if (ui.sortDir !== "asc" && ui.sortDir !== "desc") ui.sortDir = "desc";
  }

  function consumeResetFlag() {
    const params = new URLSearchParams(location.search);
    if (!params.has("reset")) return false;
    state.resetMode = true;
    state.ui = { ...DEFAULT_UI };
    try { localStorage.removeItem(STORE_KEY); } catch (_) {}
    params.delete("reset");
    const query = params.toString();
    history.replaceState({}, "", location.pathname + (query ? "?" + query : "") + "#settings/provider");
    return true;
  }

  function savePrefs() {
    if (state.resetMode) return;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(state.ui)); } catch (_) {}
  }

  async function api(url, opts) {
    const options = opts || {};
    const res = await fetch(url, {
      method: options.method || "GET",
      cache: "no-store",
      headers: options.body ? { "Content-Type": "application/json" } : undefined,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let payload = {};
    if (text) {
      try { payload = JSON.parse(text); } catch (_) { payload = { message: text }; }
    }
    if (!res.ok) {
      const err = new Error((payload.detail && (payload.detail.message || payload.detail)) || payload.message || "HTTP " + res.status);
      err.payload = payload;
      err.status = res.status;
      throw err;
    }
    return payload;
  }

  async function openTerminal() {
    try { const data = await api("/api/open-terminal", { method: "POST" }); toast(data.launcher ? `Opened ${data.launcher}` : "Opened terminal", "success"); }
    catch (error) { toast(message(error), "error"); }
  }

  async function copyText(text) {
    if (!text) return false;
    if (navigator.clipboard?.writeText) {
      try { await navigator.clipboard.writeText(text); return true; } catch (_) {}
    }
    const input = h("textarea", { value: text });
    document.body.appendChild(input);
    input.select();
    const ok = document.execCommand("copy");
    input.remove();
    return ok;
  }

  function safeColor(color) {
    return /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(String(color || "")) ? color : "var(--vw-accent)";
  }

  function labelFor(key) {
    return key === "agents" ? "Agent" : key.charAt(0).toUpperCase() + key.slice(1);
  }

  function fmtScore(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(1) : "—";
  }

  function fmtDate(v, short) {
    const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(v || "") ? v + "T00:00:00Z" : v);
    if (Number.isNaN(d.getTime())) return v || "Unknown";
    return d.toLocaleDateString("en-US", short ? { month: "short", day: "numeric", timeZone: "UTC" } : { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
  }

  function humanAge(ms) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    if (sec < 60) return sec + "s ago";
    const min = Math.floor(sec / 60);
    if (min < 60) return min + "m ago";
    const hr = Math.floor(min / 60);
    if (hr < 48) return hr + "h ago";
    return Math.floor(hr / 24) + "d ago";
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function csv(value) {
    return `"${String(value ?? "").replace(/"/g, '""')}"`;
  }

  function message(error) {
    if (!error) return "Unknown error";
    if (typeof error === "string") return error;
    return String(error.message || error.detail || error);
  }

  function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
