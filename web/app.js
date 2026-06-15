// LLM-Dash frontend. Zero-build, package-vendored Voidware, browser SQLite.

(function () {
  "use strict";

  const METRIC_KEYS = ["intelligence", "coding", "agents", "speed", "cost"];
  const CHART_METRIC_KEYS = ["cost", "overall", "value", "intelligence", "coding", "agents", "speed"];

  // Single source of truth for per-metric label + signature color. Every view
  // (list bars, detail bars, table header dots, radar) reads from here so a
  // metric is always the same hue. Field key is `agents` (plural); label "Agent".
  // Color map is canonical — score-spark hues and BAR_COLOR were unified onto it.
  const METRIC_META = {
    intelligence: { label: "Intelligence", short: "Intel",   colorVar: "var(--vw-iridescent-7)" },
    coding:       { label: "Coding",       short: "Coding",  colorVar: "var(--vw-iridescent-3)" },
    agents:       { label: "Agent",        short: "Agent",   colorVar: "var(--vw-iridescent-4)" },
    speed:        { label: "Speed",        short: "Speed",   colorVar: "var(--vw-iridescent-2)" },
    overall:      { label: "Overall",      short: "Overall", colorVar: "var(--vw-iridescent-6)" },
    cost:         { label: "Cost",         short: "Cost",    colorVar: "var(--vw-iridescent-1)" },
    value:        { label: "Value",        short: "Value",   colorVar: "var(--vw-iridescent-5)" },
  };
  const metricColor = (key) => (METRIC_META[key] && METRIC_META[key].colorVar) || "var(--model-color)";
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
  const STORE_KEY = "llm-dash-ui-state-v6";
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
    { key: "provider", label: "Provider", sort: "vendor", w: 210 },
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
  const CREDENTIAL_SLOTS = ["provider", "exa", "llmstats", "aa"];
  const SLOT_TITLES = { provider: "Connection", exa: "Exa", llmstats: "LLM Stats", aa: "Artificial Analysis" };
  const DEFAULT_SLOT_FORM = () => ({ pickKey: "", apiKey: "", mode: "select" });
  const EMPTY_APPROVAL = () => ({
    open: false,
    password: "",
    secret: "",
    error: "",
    after: null,
    stagedSecret: "",
    slot: "",
    operation: "",
    target: "",
    scopes: [],
    ttl: "120d",
    passwordRequired: true,
    secretRequired: false,
  });

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
    tableZoom: 1.0,
    colWidths: {},
    filtersOpen: false,
    chartMode: "scatter",
    chartX: "cost",
    chartY: "overall",
    compare: [],
    compareOpen: false,
    inspect: "",
    statsAgent: "",
    statsRange: "all",
  };

  const AREA = {
    models: {
      title: "Models",
      subpages: [
        ["list", "List"],
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
    subpage: { models: "list", settings: "provider" },
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
    seedTimer: 0,
    metaTimer: 0,
    chartResize: 0,
    resetMode: false,
    setupMode: false,
    setupStep: "provider",
    focusIndex: 0,
    drawerOpen: false,
    helpOpen: false,
    manualOpen: false,
    resetTokens: {},
    resetBusy: "",
    resetOp: { busy: "", phase: "", result: null, error: "", postAction: "" },
    prompt: "",
    provider: {},
    credentialDiscovery: { slots: {}, refs_available: false, same_name_warnings: [] },
    credentialSlots: {},
    credentialSlotForms: {
      provider: DEFAULT_SLOT_FORM(),
      exa: DEFAULT_SLOT_FORM(),
      llmstats: DEFAULT_SLOT_FORM(),
      aa: DEFAULT_SLOT_FORM(),
    },
    catalog: {
      selected: "exa",
      aaCount: 50,
      aaIndex: "intelligence",
      llmstatsCount: 25,
      exaCount: 25,
      openrouterCount: 25,
      customCount: 25,
      customPrompt: "",
      customEndpoint: "",
      customCredential: "",
    },
    seed: { id: "", state: "", tail: "", error: "", preset: "", started: 0 },
    presets: [],
    schedule: {},
    run: { open: false, id: "", state: "idle", started: 0, tail: "", error: "" },
    approval: EMPTY_APPROVAL(),
    ui: { ...DEFAULT_UI },
    forms: {
      provider: { base_url: "", models_override_url: "", endpoint_mode: "append_v1" },
      models: { default_model: "", backup_model: "" },
      schedule: { cadence: "off", time_local: "09:00", day_of_week: 1, day_of_month: 1 },
    },
  };

  const els = {};
  const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
  const int = new Intl.NumberFormat("en-US");
  const compact = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });

  function boot() {
    cacheEls();
    const enteredSetup = consumeSetupFlag();
    if (!enteredSetup && !consumeResetFlag()) loadPrefs();
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
      rail: byId("detail-rail"),
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
      const bootstrap = await waitForBootstrap();
      if (bootstrap === "needs_setup") {
        state.setupMode = true;
        // Enter at the first step (Connection) so a fresh/full-reset machine with
        // no provider configured is walked through the linear flow before Catalog.
        state.setupStep = "provider";
        await Promise.all([loadProvider(), loadPresets(), loadCredentialDiscovery(), loadSchedule()]);
        hydrateForms();
        state.ready = true;
        els.app.removeAttribute("data-booting");
        navigate("settings", "provider");
        render();
        pollMeta();
        state.metaTimer = window.setInterval(pollMeta, META_POLL_MS);
        return;
      }
      await Promise.all([loadDatabase(), loadProvider(), loadPresets(), loadCredentialDiscovery(), loadSchedule()]);
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
      if (data.state === "ready" || data.state === "unsupported") return data.state;
      if (data.state === "needs_setup") return "needs_setup";
      if (data.state === "error") throw new Error(data.detail || data.message || "Bootstrap failed.");
      renderBoot(data.message || "Preparing dashboard database...");
      await sleep(BOOT_POLL_MS);
    }
  }

  async function loadDatabase() {
    if (typeof window.initSqlJs !== "function") throw new Error("sql.js did not load.");
    state.SQL = await window.initSqlJs({ locateFile: (file) => "vendor/" + file });
    const res = await fetch("/data/dash.sqlite?t=" + Date.now(), { cache: "no-store" });
    if (!res.ok) {
      if (state.db) state.db.close();
      state.db = null;
      return;
    }
    if (state.db) state.db.close();
    state.db = new state.SQL.Database(new Uint8Array(await res.arrayBuffer()));
    loadStaticData();
  }

  function loadStaticData() {
    if (!state.db) return;
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

  async function loadCredentialDiscovery() {
    await refreshCredentialState();
  }

  async function refreshCredentialState() {
    const [discovery, slotsData] = await Promise.all([
      api("/api/credentials/discovery").catch(() => ({ slots: {}, refs_available: false, same_name_warnings: [] })),
      api("/api/credentials/slots").catch(() => ({ slots: {} })),
    ]);
    state.credentialDiscovery = discovery;
    state.credentialSlots = slotsData.slots || {};
    await loadProvider();
    syncSlotFormPickKeys();
  }

  async function loadSchedule() {
    state.schedule = await api("/api/schedule").catch(() => ({ enabled: false, cadence: "off" }));
  }

  function hydrateForms() {
    state.forms.provider = {
      base_url: state.provider.base_url || "",
      models_override_url: state.provider.models_override_url || "",
      endpoint_mode: state.provider.endpoint_mode || "append_v1",
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
    if (!state.db) return [];
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
    if (!state.db) {
      state.models = [];
      state.filteredModels = [];
      return;
    }
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
      renderDetailRail();
      return;
    }
    if (!state.ready) return;
    if (state.area === "models") mount(renderModels());
    else if (state.area === "changelog") mount(renderChangelog());
    else if (state.area === "stats") mount(renderStats());
    else mount(renderSettings());
    renderDetailRail();
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
    if (state.setupMode) {
      els.subnav.hidden = true;
      els.subnav.replaceChildren();
      return;
    }
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
    if (!state.db) {
      return emptyState("No catalog yet", "Complete setup to seed your model catalog.", "Open Setup", () => navigate("settings", "catalog"));
    }
    refreshModels();
    normalizeChartAxes();
    const view = state.subpage.models;
    return h("section", { class: "models-workbench" }, [
      renderModelToolbar(),
      view === "chart" ? renderChart() : view === "table" ? renderTable() : renderList(),
      renderCompareTray(),
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
        h("div", { class: "filter-anchor" }, [
          h("button", {
            class: "vw-btn vw-btn-secondary toolbar-filter-btn" + (count ? " has-active" : ""),
            type: "button",
            "aria-expanded": String(state.ui.filtersOpen),
            "aria-haspopup": "dialog",
            onclick: () => { state.ui.filtersOpen = !state.ui.filtersOpen; savePrefs(); render(); },
          }, count ? `Filters (${count})` : "Filters"),
          state.ui.filtersOpen ? h("div", { class: "filter-pop-backdrop", "aria-hidden": "true", onclick: closeFilters }) : null,
          state.ui.filtersOpen ? h("div", { class: "filter-pop", role: "dialog", "aria-label": "Filters" }, renderFilters()) : null,
        ]),
      ]),
      h("div", { class: "toolbar-actions" }, [
        isTable ? zoomControl() : null,
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: exportModels }, "Export CSV"),
        count && state.filteredModels.length ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: resetFilters }, "Reset view") : null,
      ]),
    ]);
  }

  function closeFilters() {
    if (!state.ui.filtersOpen) return;
    state.ui.filtersOpen = false;
    savePrefs();
    render();
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
    if (slug) return h("img", { class: "provider-logo", src: "vendor/logos/" + slug + ".svg", alt: "", width: 24, height: 24, loading: "lazy", style: { "--provider-logo-size": "24px" } });
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
            "data-testid": "model-row",
            "data-model": model.name || "",
            onclick: () => setInspect(model.id),
            onkeydown: (e) => rowKey(e, index, model.id),
            style: { "--model-color": safeColor(model.color) },
          }, COLUMNS.map((col) => bodyCell(col, model, index))))),
        ]),
      ]),
      h("div", { class: "models-mobile-list" }, state.filteredModels.map((model, index) => modelCard(model, index))),
    ]);
  }

  function renderList() {
    if (!state.totalModelCount) return emptyState("No models tracked yet", "Run Refresh to discover and score models.", "Run Refresh", handleRefresh);
    if (!state.filteredModels.length) return emptyState("No models match this view", "Clear filters or search for another vendor.", "Reset view", resetFilters);
    return h("section", { class: "model-list-layout" }, [
      h("div", { class: "list-sort-bar" }, [
        h("label", { class: "field compact list-sort-field" }, [
          h("span", null, "Sort"),
          h("select", { value: state.ui.sortKey, onchange: (e) => setSort(e.target.value) },
            MOBILE_SORTS.map(([key, label]) => h("option", { value: key }, label))),
        ]),
      ]),
      h("div", { class: "model-list vw-scroll-shadow" },
        state.filteredModels.map((model, index) => listRow(model, index))),
    ]);
  }

  const LIST_BAR_METRICS = ["intelligence", "coding", "agents", "speed"];

  function listRow(model, index) {
    const color = safeColor(model.color);
    const g = tier(overall(model));
    return h("div", {
      // Focusable container, not role=button: a button must not nest the compare
      // checkbox (axe nested-interactive). Keyboard nav still works via tabindex.
      class: rowClasses(model.id) + " model-list-row",
      tabindex: "0",
      "aria-label": (model.name || "Unknown model") + " — Enter to inspect, c to compare",
      "data-testid": "model-row",
      "data-model": model.name || "",
      style: { "--model-color": color },
      onclick: () => setInspect(model.id),
      onkeydown: (e) => rowKey(e, index, model.id),
    }, [
      h("span", { class: "list-rank" + (index < 3 ? " top r" + (index + 1) : "") }, index + 1),
      compareCheckbox(model),
      providerLogo(model, 30),
      listIdentity(model),
      h("div", { class: "list-overall" }, [
        h("span", { class: "list-overall-num " + g.cls }, fmtScore(overall(model))),
        h("span", { class: "list-overall-grade" }, "Grade " + g.label),
      ]),
      listBars(model),
      h("span", { class: "list-go", "aria-hidden": "true" }, [
        h("svg", { viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2", "stroke-linecap": "round", "stroke-linejoin": "round" }, [h("path", { d: "M9 6l6 6-6 6" })]),
      ]),
    ]);
  }

  // Compact open-weight chip, derived from the type/params string (no DB flag).
  function openChip(model) {
    return /open[- ]?weight/i.test(model.params || "") ? h("span", { class: "list-chip open", title: "Open-weight" }, "open") : null;
  }

  // Bare inline modality glyphs (no chip boxes) per the Voidware rail spec.
  function modalityRow(model, size) {
    const px = size || 13;
    return h("span", { class: "list-modality", "aria-hidden": "true" }, modelCapabilities(model).map((c) => h("svg", {
      viewBox: "0 0 20 20", width: px, height: px, fill: "none", stroke: "currentColor", "stroke-width": "1.7", "stroke-linecap": "round", "stroke-linejoin": "round", title: CAPABILITY[c].label,
    }, [h("path", { d: CAPABILITY[c].glyph })])));
  }

  function listIdentity(model) {
    return h("div", { class: "list-model-identity" }, [
      h("div", { class: "list-name-row" }, [
        h("strong", { class: "list-model-name" }, highlight(model.name || "Unknown model")),
        openChip(model),
        model.status === "deprecated" ? h("span", { class: "list-chip dep", title: depTitle(model) }, "deprecated") : null,
      ]),
      h("div", { class: "list-sub-row" }, [
        h("span", { class: "list-model-vendor" }, model.vendor || "Unknown"),
        h("span", { class: "list-sub-sep" }, "·"),
        modalityRow(model),
      ]),
    ]);
  }

  function listBars(model) {
    return h("div", { class: "list-bars" }, LIST_BAR_METRICS.map((k) => {
      const val = clamp(Number(model[k]) || 0, 0, 10);
      return h("div", { class: "list-bar-cell" }, [
        h("div", { class: "list-bar-k" }, [h("span", null, METRIC_META[k].short), h("b", null, fmtScore(model[k]))]),
        h("div", { class: "list-bar-track" }, h("i", { style: { width: (val * 10) + "%", "--bar-color": metricColor(k) } })),
      ]);
    }));
  }

  function headerCell(col) {
    const active = col.sort && state.ui.sortKey === col.sort;
    const ariaSort = active ? (state.ui.sortDir === "asc" ? "ascending" : "descending") : (col.sort ? "none" : null);
    const cls = (col.key === "rank" ? "rank-col" : col.key === "compare" ? "compare-col" : "") + (col.sort ? " is-sortable" : "");
    const inner = [];
    if (col.key === "compare") inner.push(h("span", { class: "sr-only" }, "Compare"));
    else if (col.sort) {
      const dot = col.score && METRIC_META[col.key] ? h("span", { class: "th-dot", "aria-hidden": "true", style: { background: metricColor(col.key) } }) : null;
      inner.push(h("button", {
        class: "th-sort" + (active ? " is-active" : "") + (col.score ? " th-metric" : ""),
        type: "button",
        onclick: () => setSort(col.sort),
        title: "Sort by " + col.label,
      }, [dot, col.label, h("span", { class: "sort-caret", "aria-hidden": "true" }, active ? (state.ui.sortDir === "asc" ? "▲" : "▼") : "")]));
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
      providerLogo(model, 32),
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
        style: { "--provider-logo-size": px + "px" },
      });
    }
    return h("span", {
      class: "provider-monogram",
      "aria-hidden": "true",
      style: { "--provider-logo-size": px + "px", "--model-color": safeColor(model.color) },
    }, String(model.vendor || "?").trim().charAt(0).toUpperCase() || "?");
  }

  function modelCard(model, index) {
    const inCompare = state.ui.compare.includes(model.id);
    return h("article", {
      class: "mobile-model-card" + (state.ui.inspect === model.id ? " is-inspect" : "") + (inCompare ? " is-compare" : ""),
      style: { "--model-color": safeColor(model.color) },
      // Focusable container, not role=button: avoids nesting the compare checkbox
      // inside an interactive role (axe nested-interactive). aria-pressed dropped
      // with the role (only valid on a button); is-inspect class carries state.
      tabindex: "0",
      "aria-label": (model.name || "Unknown model") + " — Enter to inspect, c to compare",
      "data-testid": "model-card",
      "data-model": model.name || "",
      onclick: () => setInspect(model.id),
      onkeydown: (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setInspect(model.id); }
        if (e.key === "c" || e.key === "x") { e.preventDefault(); toggleCompare(model.id); }
      },
    }, [
      h("div", { class: "mobile-model-card-head" }, [
        h("span", { class: "mobile-rank" }, index + 1),
        providerLogo(model, 28),
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
          onmouseenter: (e) => showChartTip(e, `${model.name} · ${METRIC_META[xKey] ? METRIC_META[xKey].short : labelFor(xKey)} ${fmtScore(metricValue(model, xKey))} · ${METRIC_META[yKey] ? METRIC_META[yKey].short : labelFor(yKey)} ${fmtScore(metricValue(model, yKey))}`),
          onmousemove: moveChartTip,
          onmouseleave: hideChartTip,
          onkeydown: (e) => pointKey(e, model.id),
        });
      }),
    ]);
    return h("div", { class: "svg-shell" }, [svg, h("div", { class: "chart-tip", id: "chart-tip", hidden: true }), renderLegend()]);
  }

  // Direct-DOM tooltip so hovering a point doesn't trigger a full re-render.
  function showChartTip(e, text) {
    const tip = document.getElementById("chart-tip");
    if (!tip) return;
    tip.textContent = text;
    tip.hidden = false;
    moveChartTip(e);
  }
  function moveChartTip(e) {
    const tip = document.getElementById("chart-tip");
    if (!tip || tip.hidden) return;
    const shell = tip.parentElement.getBoundingClientRect();
    tip.style.left = (e.clientX - shell.left) + "px";
    tip.style.top = (e.clientY - shell.top) + "px";
  }
  function hideChartTip() {
    const tip = document.getElementById("chart-tip");
    if (tip) tip.hidden = true;
  }

  function renderRadar(models) {
    const chosen = models.length ? models : [state.filteredModels[0]];
    const metrics = METRIC_KEYS;
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
            h("text", { x: lx, y: ly + dy, "text-anchor": anchor, class: "radar-label", style: { fill: metricColor(metric) } }, METRIC_META[metric] ? METRIC_META[metric].short : labelFor(metric)),
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

  // ── Docked detail rail (persistent 3rd shell column) ──────────────────────
  // Binds to the inspected model only. Compare is orthogonal and lives in the
  // overlay, so toggling compare checkboxes never changes rail content.
  const RAIL_METRICS = ["overall", "value", "intelligence", "coding", "agents", "speed", "cost"];

  function railValue(model, key) {
    if (key === "overall") return overall(model);
    if (key === "value") return valueScore(model);
    return Number(model[key]);
  }

  function renderDetailRail() {
    if (!els.rail) return;
    if (state.area !== "models" || state.setupMode || !state.ready) {
      els.rail.replaceChildren();
      return;
    }
    const model = inspectModel();
    if (!model) {
      els.rail.replaceChildren(h("div", { class: "detail-rail-empty" }, [
        h("p", null, "Select a model to see its full scorecard."),
      ]));
      return;
    }
    const card = modelCardUrl(model);
    const t = tier(overall(model));
    const head = h("header", { class: "detail-rail-head", style: { "--model-color": safeColor(model.color) } }, [
      h("div", { class: "detail-rail-id" }, [
        providerLogo(model, 42),
        h("div", { class: "detail-rail-titles" }, [
          h("strong", { class: "detail-rail-name" }, model.name || "Unknown model"),
          h("span", { class: "detail-rail-vendor" }, model.vendor || "Unknown vendor"),
        ]),
        h("span", { class: "detail-rail-grade " + t.cls, title: "Overall " + fmtScore(overall(model)) }, t.label),
      ]),
    ]);
    const meta = h("dl", { class: "detail-rail-meta" }, [
      metaItem("Price", model.pricing || (Number.isFinite(Number(model.cost)) ? "Cost score " + fmtScore(model.cost) : "Not listed")),
      metaItem("Released", model.released || "Unknown"),
      metaItem("Tracked since", fmtDate(model.first_seen) || "Unknown"),
      metaItem("Type", model.params || "Unknown"),
      model.status && model.status !== "active" ? metaItem("Status", titleCaseSlug(model.status)) : null,
      model.deprecated_on ? metaItem("Deprecated", fmtDate(model.deprecated_on)) : null,
      h("div", { class: "meta-item meta-item-caps", style: { "grid-column": "1 / -1" } }, [h("dt", null, "Inputs"), h("dd", null, capabilityChips(model, 18))]),
    ]);
    const note = model.notes ? h("p", { class: "detail-rail-note" }, model.notes) : null;
    const link = card.url ? h("a", { class: "detail-rail-link", href: card.url, target: "_blank", rel: "noopener noreferrer" }, [card.official ? "Model card" : "Find model card", h("span", { "aria-hidden": "true" }, " ↗")]) : null;
    els.rail.replaceChildren(h("div", { class: "detail-rail-inner vw-scroll-shadow" }, [
      head,
      h("div", { class: "detail-rail-body" }, [
        meta,
        note,
        link,
        h("div", { class: "detail-rail-bars" }, statBars(model)),
        railFooter(model),
      ]),
    ]));
  }

  // Board rank + strongest/weakest, filling the rail's bottom per the design.
  function railFooter(model) {
    const all = state.models.slice().sort((a, b) => overall(b) - overall(a));
    const rank = all.findIndex((m) => m.id === model.id) + 1;
    const cmp = ["intelligence", "coding", "agents", "speed", "value", "cost"]
      .map((k) => ({ k, label: METRIC_META[k].short, color: metricColor(k), v: railValue(model, k) }))
      .filter((x) => Number.isFinite(x.v));
    const strong = cmp.reduce((a, b) => (b.v > a.v ? b : a), cmp[0]);
    const weak = cmp.reduce((a, b) => (b.v < a.v ? b : a), cmp[0]);
    return h("div", { class: "detail-rail-foot" }, [
      h("div", { class: "drf-rank" }, [
        h("span", { class: "drf-k" }, "Board rank"),
        h("span", { class: "drf-v" }, [rank > 0 ? "#" + rank : "—", h("small", null, " / " + all.length)]),
      ]),
      strong && weak ? h("div", { class: "drf-chips" }, [
        h("span", { class: "drf-chip", style: { "--c": strong.color } }, [h("em", null, "▲"), strong.label, " ", fmtScore(strong.v)]),
        h("span", { class: "drf-chip", style: { "--c": weak.color } }, [h("em", null, "▼"), weak.label, " ", fmtScore(weak.v)]),
      ]) : null,
    ]);
  }

  // ── Compare tray + overlay ────────────────────────────────────────────────
  function renderCompareTray() {
    const models = compareModels();
    if (!models.length) return null;
    return h("div", { class: "compare-tray", role: "region", "aria-label": "Compare selection" }, [
      h("span", { class: "compare-tray-count" }, [h("b", null, String(models.length)), " selected"]),
      h("div", { class: "compare-tray-chips" }, models.map((m) => h("span", { class: "compare-tray-chip" }, [
        providerLogo(m, 18),
        h("span", { class: "compare-tray-chip-name" }, m.name || "Unknown"),
        h("button", { class: "compare-tray-remove", type: "button", "aria-label": "Remove " + (m.name || "model"), onclick: () => toggleCompare(m.id) }, "×"),
      ]))),
      h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: clearCompare }, "Clear"),
      h("button", { class: "vw-btn vw-btn-primary", type: "button", disabled: models.length < 2, onclick: () => { state.compareOpen = true; render(); } }, "Compare"),
    ]);
  }

  function compareOverlay() {
    const models = compareModels();
    if (models.length < 2) return null;
    const best = {};
    RAIL_METRICS.forEach((k) => { best[k] = Math.max(...models.map((m) => railValue(m, k)).filter(Number.isFinite)); });
    const close = () => { state.compareOpen = false; render(); };
    const headRow = h("tr", null, [h("th", null, "Metric"), ...models.map((m) => h("th", null, h("div", { class: "cmp-th" }, [providerLogo(m, 20), h("span", null, m.name || "Unknown")])))]);
    const metricRows = RAIL_METRICS.map((k) => h("tr", null, [
      h("td", { class: "cmp-metric" }, [h("span", { class: "cmp-dot", style: { background: metricColor(k) } }), METRIC_META[k].label]),
      ...models.map((m) => {
        const v = railValue(m, k);
        const isBest = models.length > 1 && Number.isFinite(v) && v === best[k];
        return h("td", { class: "cmp-score" + (isBest ? " is-best" : "") + " " + tier(v).cls }, fmtScore(v));
      }),
    ]));
    const inputsRow = h("tr", { class: "cmp-inputs-row" }, [
      h("td", { class: "cmp-metric" }, "Inputs"),
      ...models.map((m) => h("td", { class: "cmp-inputs-cell" }, capabilityChips(m, 16))),
    ]);
    return modal("Compare " + models.length + " models", [
      h("div", { class: "cmp-body" }, [
        h("div", { class: "cmp-radar" }, renderRadar(models)),
        h("table", { class: "cmp-table" }, [
          h("thead", null, headRow),
          h("tbody", null, [...metricRows, inputsRow]),
        ]),
      ]),
    ], close);
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

  function statBars(model) {
    const rowsOut = [["overall", "Overall", overall(model)], ["value", "Value", valueScore(model)]]
      .concat(BAR_METRICS.map(([k, label]) => [k, label, Number(model[k])]));
    return h("div", { class: "stat-bars" }, rowsOut.map(([key, label, value]) => {
      const v = Number(value);
      const pct = Number.isFinite(v) ? clamp(v, 0, 10) * 10 : 0;
      return h("div", { class: "stat-bar" + (key === "overall" || key === "value" ? " is-headline" : ""), style: { "--bar-color": metricColor(key) } }, [
        h("span", { class: "stat-bar-label" }, label),
        h("div", { class: "stat-bar-track" }, h("div", { class: "stat-bar-fill", style: { width: pct + "%" } })),
        h("span", { class: "stat-bar-val" }, fmtScore(value)),
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
    if (!state.db) return emptyState("No changelog entries yet", "Seed the catalog from Setup before running updates.", "Open Setup", () => navigate("settings", "catalog"));
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
    if (!state.db) return emptyState("No run telemetry yet", "Seed the catalog from Setup before running updates.", "Open Setup", () => navigate("settings", "catalog"));
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
    return h("section", { class: "settings-workbench" + (state.setupMode ? " is-setup" : "") }, [
      state.setupMode ? renderSetupRail() : null,
      h("div", { class: "settings-detail" }, renderSettingsSubpage()),
    ]);
  }

  const SETUP_STEPS = [
    ["provider", "Connection"],
    ["models", "Agent model"],
    ["research", "Research"],
    ["catalog", "Catalog"],
    ["seed", "Seed"],
    ["finish", "Finish"],
  ];

  function renderSetupRail() {
    const current = state.subpage.settings;
    return h("nav", { class: "setup-rail panel-card", "aria-label": "Setup steps" }, [
      h("div", { class: "setup-rail-head" }, [
        h("strong", { class: "setup-rail-title" }, "Setup"),
        h("p", { class: "setup-rail-copy" }, "Connect a provider, add research keys, seed your catalog, and you're in."),
      ]),
      h("ol", { class: "setup-rail-steps" }, SETUP_STEPS.map(([key, label], index) => {
        const active = current === key;
        const done = SETUP_STEPS.findIndex(([step]) => step === current) > index;
        return h("li", { class: "setup-rail-step" + (active ? " is-active" : "") + (done ? " is-done" : "") }, [
          h("button", {
            type: "button",
            class: "setup-rail-btn",
            "aria-current": active ? "step" : undefined,
            onclick: () => navigate("settings", key),
          }, label),
        ]);
      })),
    ]);
  }

  function settingsFinish() {
    const seeded = catalogReady();
    return h("section", { class: "settings-panel panel-card setup-finish-panel", "aria-label": "Finish setup" }, [
      h("h2", { class: "settings-panel-title" }, "Finish setup"),
      h("p", { class: "settings-summary" }, seeded
        ? "Connection, agent model, and research keys are saved locally. Open the Models dashboard when you are ready."
        : "Your catalog is still empty. Seed it from the Catalog step before opening the dashboard."),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-primary", type: "button", disabled: !seeded, onclick: finishSetup }, "Open Models dashboard"),
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => navigate("settings", seeded ? "provider" : "catalog") }, seeded ? "Review Connection" : "Go to Catalog"),
      ]),
    ]);
  }

  // A catalog is ready once the in-browser DB has at least one model. Guards the
  // wizard from "finishing" into an empty dashboard before a seed lands.
  function catalogReady() {
    return Boolean(state.db) && Number(state.totalModelCount) > 0;
  }

  function finishSetup() {
    if (!catalogReady()) {
      navigate("settings", "catalog");
      toast("Seed your catalog before opening the dashboard.", "warning");
      return;
    }
    state.setupMode = false;
    state.setupStep = "provider";
    navigate("models", "list");
  }

  function renderSettingsSubpage() {
    if (state.setupMode && state.subpage.settings === "finish") return settingsFinish();
    if (state.subpage.settings === "catalog") return settingsCatalog();
    if (state.subpage.settings === "seed") return settingsSeed();
    if (state.subpage.settings === "models") return settingsModels();
    if (state.subpage.settings === "research") return settingsResearch();
    if (state.subpage.settings === "schedule") return settingsSchedule();
    if (state.subpage.settings === "reset") return settingsReset();
    return settingsProvider();
  }

  function catalogCountSelect(catalog, key, counts) {
    return h("label", { class: "field catalog-field" }, [
      h("span", null, "Count"),
      h("select", {
        value: String(catalog[key]),
        onchange: (e) => { catalog[key] = Number(e.target.value); },
      }, counts.map((n) => h("option", { value: String(n) }, String(n)))),
    ]);
  }

  function catalogIndexRadios(catalog) {
    const options = [
      ["intelligence", "Intelligence"],
      ["coding", "Coding"],
      ["agentic", "Agentic"],
    ];
    return h("fieldset", { class: "catalog-index-field" }, [
      h("legend", null, "Rank by"),
      h("div", { class: "catalog-index-options" }, options.map(([value, label]) => h("label", { class: "catalog-radio" }, [
        h("input", {
          type: "radio",
          name: "aa-index",
          value,
          checked: catalog.aaIndex === value,
          onchange: () => { catalog.aaIndex = value; render(); },
        }),
        h("span", null, label),
      ]))),
    ]);
  }

  function catalogSources(c) {
    return [
      {
        id: "aa",
        title: "Artificial Analysis",
        sub: "AA Data API",
        description: "Top models from the AA Data API, ranked by your chosen index.",
        enabled: Boolean(state.provider.aa_configured),
        gateHint: "Add an Artificial Analysis key in the Research step to enable.",
        inputs: [catalogCountSelect(c, "aaCount", [10, 50, 100]), catalogIndexRadios(c)],
        onSeed: () => startSeed({ preset: "aa", count: c.aaCount, index: c.aaIndex }),
      },
      {
        id: "llmstats",
        title: "LLM Stats",
        sub: "LLM Stats API",
        description: "Top models from the LLM Stats catalog API.",
        enabled: Boolean(state.provider.llmstats_configured),
        gateHint: "Add an LLM Stats key in the Research step to enable.",
        inputs: [catalogCountSelect(c, "llmstatsCount", [10, 25, 50])],
        onSeed: () => startSeed({ preset: "llmstats", count: c.llmstatsCount }),
      },
      {
        id: "exa",
        title: "Exa search",
        sub: "Web research",
        description: "Discover models via Exa MCP web research (free tier works).",
        enabled: true,
        inputs: [catalogCountSelect(c, "exaCount", [10, 25, 50])],
        onSeed: () => startSeed({ preset: "exa", count: c.exaCount }),
      },
      {
        id: "openrouter",
        title: "OpenRouter",
        sub: "Public catalog",
        description: "Models from the public OpenRouter catalog (largest-context first).",
        enabled: true,
        inputs: [catalogCountSelect(c, "openrouterCount", [10, 25, 50])],
        onSeed: () => startSeed({ preset: "openrouter", count: c.openrouterCount }),
      },
      {
        id: "custom-prompt",
        title: "Custom prompt",
        sub: "Your brief",
        description: "Describe what to discover; the agent builds the catalog from your brief.",
        enabled: true,
        inputs: [
          h("label", { class: "field catalog-field" }, [
            h("span", null, "Discovery brief"),
            h("textarea", {
              class: "catalog-prompt",
              rows: 4,
              value: c.customPrompt,
              placeholder: "e.g. Top coding models released in 2026 with public benchmarks…",
              oninput: (e) => { c.customPrompt = e.target.value; },
            }),
          ]),
          catalogCountSelect(c, "customCount", [10, 25, 50]),
        ],
        onSeed: () => startSeed({ preset: "custom-prompt", count: c.customCount, prompt: c.customPrompt.trim() }),
      },
      {
        id: "custom-endpoint",
        title: "Custom endpoint",
        sub: "OpenAI-compatible",
        description: "Fetch models from an OpenAI-compatible /models endpoint.",
        enabled: Boolean(state.provider.has_provider),
        gateHint: "Add a provider connection in the Connection step to enable.",
        inputs: [
          h("label", { class: "field catalog-field" }, [
            h("span", null, "Endpoint URL"),
            input(c, "customEndpoint", "https://api.example.com/v1/models"),
          ]),
          h("label", { class: "field catalog-field" }, [
            h("span", null, "Credential name (optional)"),
            input(c, "customCredential", "Leave blank to use the connection key"),
          ]),
          catalogCountSelect(c, "customCount", [10, 25, 50]),
        ],
        onSeed: () => {
          const payload = { preset: "custom-endpoint", count: c.customCount, endpoint: c.customEndpoint.trim() };
          if (c.customCredential.trim()) payload.credential = c.customCredential.trim();
          startSeed(payload);
        },
      },
    ];
  }

  function settingsCatalog() {
    const c = state.catalog;
    const sources = catalogSources(c);
    if (!sources.some((s) => s.id === c.selected)) c.selected = sources[0].id;
    const active = sources.find((s) => s.id === c.selected) || sources[0];
    return h("section", { class: "settings-panel panel-card catalog-panel", "aria-label": "Catalog" }, [
      h("h2", { class: "settings-panel-title" }, "Catalog"),
      h("p", { class: "settings-summary" }, "Pick a source, tune its options, then seed. Each source runs the research agent against a different place."),
      h("div", { class: "catalog-workbench" }, [
        h("div", { class: "catalog-sources", role: "tablist", "aria-label": "Seed sources" }, sources.map((s) => h("button", {
          class: "catalog-source" + (s.id === active.id ? " is-active" : "") + (s.enabled ? "" : " is-locked"),
          type: "button",
          role: "tab",
          "aria-selected": s.id === active.id ? "true" : "false",
          onclick: () => { c.selected = s.id; render(); },
        }, [
          h("span", { class: "catalog-source-name" }, s.title),
          h("span", { class: "catalog-source-sub" }, s.enabled ? s.sub : "Locked"),
        ]))),
        h("div", { class: "catalog-detail", role: "tabpanel" }, [
          h("h3", { class: "catalog-detail-title" }, active.title),
          h("p", { class: "catalog-detail-copy" }, active.description),
          h("div", { class: "catalog-detail-fields" }, active.inputs),
          !active.enabled && active.gateHint ? h("p", { class: "catalog-card-hint" }, active.gateHint) : null,
          h("div", { class: "catalog-detail-cta" }, [
            h("button", {
              class: "vw-btn vw-btn-primary",
              type: "button",
              disabled: !active.enabled,
              onclick: active.onSeed,
            }, "Seed catalog"),
          ]),
        ]),
      ]),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => navigate("settings", "research") }, "Back"),
      ]),
    ]);
  }

  function seedPhaseLabel(tail) {
    const text = String(tail || "");
    const batchMatch = text.match(/seed_batch\s+(\d+)\/(\d+)/);
    if (batchMatch) return `Scoring models (batch ${batchMatch[1]} of ${batchMatch[2]})…`;
    if (text.includes("seed_complete")) return "Finishing up…";
    return "Preparing the seed run…";
  }

  function seedTailPreview(tail, maxLines) {
    const lines = String(tail || "").trim().split("\n").filter(Boolean);
    return lines.slice(-(maxLines || 8)).join("\n");
  }

  function settingsSeed() {
    const seed = state.seed;
    if (!seed.id) {
      return h("section", { class: "settings-panel panel-card", "aria-label": "Seed" }, [
        h("h2", { class: "settings-panel-title" }, "Seed"),
        h("p", { class: "settings-summary" }, "Pick a strategy on the Catalog step to begin."),
        h("div", { class: "action-row" }, [
          h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => navigate("settings", "catalog") }, "Back to Catalog"),
        ]),
      ]);
    }
    if (seed.state === "succeeded") {
      const count = state.totalModelCount;
      return h("section", { class: "settings-panel panel-card seed-done-panel", "aria-label": "Seed complete" }, [
        h("div", { class: "seed-complete", "aria-hidden": "true" }, [
          h("span", { class: "seed-complete-check" }),
        ]),
        h("h2", { class: "settings-panel-title seed-done-title" }, "Catalog seeded"),
        count ? h("p", { class: "settings-summary" }, `${count} model${count === 1 ? "" : "s"} ready in your dashboard.`) : null,
        h("div", { class: "action-row" }, [
          h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: finishSetup }, "Let's start!"),
        ]),
      ]);
    }
    if (seed.state === "failed" || seed.error) {
      return h("section", { class: "settings-panel panel-card seed-error-panel", "aria-label": "Seed failed" }, [
        h("h2", { class: "settings-panel-title" }, "Seed failed"),
        h("pre", { class: "seed-log seed-log-error" }, seed.error || "Seed failed."),
        h("div", { class: "action-row" }, [
          h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => { state.seed = { id: "", state: "", tail: "", error: "", preset: "", started: 0 }; navigate("settings", "catalog"); } }, "Try again"),
        ]),
        h("p", { class: "settings-note seed-cli-hint" }, [
          "Or seed from the terminal: ",
          h("code", null, "python scripts/seed_catalog.py --preset exa --count 10"),
        ]),
      ]);
    }
    const preview = seedTailPreview(seed.tail);
    return h("section", { class: "settings-panel panel-card seed-running-panel", "aria-label": "Seed in progress" }, [
      h("h2", { class: "settings-panel-title" }, "Seeding catalog"),
      h("div", { class: "seed-status run-status" }, [
        h("span", { class: "vw-spinner", "aria-hidden": "true" }),
        h("p", { class: "seed-phase-label" }, seedPhaseLabel(seed.tail)),
      ]),
      preview ? h("pre", { class: "seed-log" }, preview) : null,
    ]);
  }

  async function startSeed(payload) {
    if (!state.provider.has_provider) {
      navigate("settings", "provider");
      toast("Add a provider connection first.", "warning");
      return;
    }
    if (payload.preset === "custom-prompt" && !payload.prompt) {
      toast("Enter a discovery brief first.", "warning");
      return;
    }
    if (payload.preset === "custom-endpoint" && !payload.endpoint) {
      toast("Enter an endpoint URL first.", "warning");
      return;
    }
    try {
      const data = await api("/api/seed", { method: "POST", body: payload });
      state.seed = {
        id: data.id,
        state: data.state || "running",
        tail: "",
        error: "",
        started: Date.now(),
        preset: payload.preset,
      };
      navigate("settings", "seed");
      render();
      pollSeed();
    } catch (error) {
      toast(message(error), "error");
    }
  }

  async function pollSeed() {
    if (!state.seed.id) return;
    window.clearTimeout(state.seedTimer);
    try {
      const data = await api("/api/run-update/" + encodeURIComponent(state.seed.id));
      state.seed.state = data.state || "running";
      state.seed.tail = data.tail || "";
      if (state.seed.state === "succeeded") {
        await loadDatabase();
        refreshModels();
        state.seed.state = "succeeded";
        render();
      } else if (state.seed.state === "failed") {
        state.seed.error = data.tail || "Seed failed.";
        render();
      } else {
        render();
        state.seedTimer = window.setTimeout(pollSeed, RUN_POLL_MS);
      }
    } catch (error) {
      state.seed.error = message(error);
      state.seed.state = "failed";
      render();
    }
  }

  const RESET_SCOPES = [
    { scope: "stats", token: "STATS", title: "Reset stats", copy: "Clear run telemetry (tokens, cost, duration, agent leaderboard) and regenerate the metrics CSV. Models, scores, and changelogs stay." },
    { scope: "changelog", token: "CHANGELOG", title: "Reset changelog", copy: "Delete every changelog entry and its run metrics. This is the only sanctioned exception to the append-only rule — update runs never delete history." },
    { scope: "models", token: "MODELS", title: "Reset models", copy: "Clear all models and scores and reset the last update to never, then re-seed the catalog from the setup wizard. Changelogs and stats stay." },
    { scope: "full", token: "RESET", title: "Full reset", copy: "Wipe the local database, metrics CSV, run logs, app config, schedule, and LLM-Dash broker grants, then guide you through setup. Voidware credentials are preserved." },
  ];

  function settingsReset() {
    return h("section", { class: "settings-panel panel-card reset-panel", "aria-label": "Reset" }, [
      h("h2", { class: "settings-panel-title" }, "Reset"),
      h("p", { class: "settings-summary" }, "Destructive, local-only actions. Each needs its typed confirmation."),
      h("p", { class: "reset-safe-note" }, [
        h("span", { class: "reset-safe-dot", "aria-hidden": "true" }),
        "Voidware credentials are preserved. Full reset clears LLM-Dash broker grants and app config; partial resets leave grants alone.",
      ]),
      renderResetStatus(),
      h("div", { class: "reset-actions" }, RESET_SCOPES.map(resetCard)),
    ]);
  }

  function renderResetStatus() {
    const op = state.resetOp;
    if (!op || (!op.phase && !op.error && !op.result)) return null;
    const summary = op.result || {};
    const cleared = Array.isArray(summary.cleared) ? summary.cleared : [];
    const removed = Array.isArray(summary.removed_files) ? summary.removed_files : [];
    const warnings = Array.isArray(summary.warnings) ? summary.warnings : [];
    const reseeded = summary.reseeded;
    const counts = [];
    if (cleared.length) counts.push(`${cleared.length} cleared`);
    if (removed.length) counts.push(`${removed.length} removed`);
    if (typeof reseeded === "number" && reseeded > 0) counts.push(`${reseeded} reseeded`);
    if (warnings.length) counts.push(`${warnings.length} warning${warnings.length === 1 ? "" : "s"}`);
    const tone = op.error ? "error" : op.phase === "done" ? "success" : "busy";
    return h("div", { class: "reset-status reset-status-" + tone, role: "status", "aria-live": "polite" }, [
      h("strong", { class: "reset-status-title" }, op.error ? "Reset failed" : op.phase === "running" ? "Reset in progress…" : "Reset complete"),
      op.error ? h("p", { class: "reset-status-copy" }, op.error) : null,
      op.phase === "running" ? h("p", { class: "reset-status-copy" }, "Applying local reset. Do not close this tab.") : null,
      op.phase === "done" && counts.length ? h("p", { class: "reset-status-copy" }, counts.join(" · ")) : null,
      op.phase === "done" && cleared.length ? h("p", { class: "reset-status-detail" }, "Cleared: " + cleared.join(", ")) : null,
      op.phase === "done" && typeof reseeded === "number" && reseeded > 0 ? h("p", { class: "reset-status-detail" }, "Reseeded " + reseeded + " bootstrap model(s).") : null,
      op.phase === "done" && warnings.length ? h("ul", { class: "reset-status-warnings" }, warnings.map((item) => h("li", null, item))) : null,
    ]);
  }

  function resetCard(item) {
    const typed = (state.resetTokens && state.resetTokens[item.scope]) || "";
    const ready = typed === item.token;
    const globalBusy = Boolean(state.resetOp && state.resetOp.busy);
    const busy = state.resetOp && state.resetOp.busy === item.scope;
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
          disabled: !ready || globalBusy,
          onclick: () => performReset(item),
        }, busy ? "Resetting…" : globalBusy ? "Busy…" : "Reset"),
      ]),
    ]);
  }

  // Live-toggle the button without a full re-render so the input keeps focus.
  function updateResetButton(item) {
    const typed = (state.resetTokens && state.resetTokens[item.scope]) || "";
    const globalBusy = Boolean(state.resetOp && state.resetOp.busy);
    const btn = document.querySelector(`.reset-run-btn[data-scope="${item.scope}"]`);
    if (btn) btn.disabled = typed !== item.token || globalBusy;
  }

  async function performReset(item) {
    const token = ((state.resetTokens && state.resetTokens[item.scope]) || "").trim();
    state.resetOp = { busy: item.scope, phase: "running", result: null, error: "", postAction: "" };
    render();
    try {
      const data = await api("/api/reset", { method: "POST", body: { scope: item.scope, confirm_token: token } });
      state.resetOp = { busy: "", phase: "done", result: data, error: "", postAction: item.scope === "full" ? "setup" : "refresh" };
      state.resetTokens = { ...(state.resetTokens || {}), [item.scope]: "" };
      await applyResetAftermath(item.scope, data);
      toast(item.title + " complete", "success");
    } catch (error) {
      state.resetOp = { busy: "", phase: "error", result: null, error: message(error), postAction: "" };
      toast(message(error), "error");
      render();
    }
  }

  async function applyResetAftermath(scope, data) {
    if (scope === "full") {
      // Show the result summary (counts + grant-cleanup warnings) before
      // leaving for setup mode; warnings get a longer read.
      render();
      const warnings = Array.isArray(data && data.warnings) ? data.warnings : [];
      const delay = warnings.length ? 4000 : 1500;
      window.setTimeout(() => { location.assign(location.pathname + "?setup=1"); }, delay);
      return;
    }
    if (scope === "changelog") { state.changelogBodies = {}; state.activeChangelogDate = ""; }
    if (scope === "models") {
      state.ui.compare = [];
      state.ui.inspect = "";
      state.focusIndex = 0;
      await loadDatabase();
      state.setupMode = true;
      state.setupStep = "catalog";
      await pollMeta();
      navigate("settings", "catalog");
      return;
    }
    await loadDatabase();
    await pollMeta();
    refreshModels();
    render();
  }

  function getSlotDiscovery(slot) {
    const slots = state.credentialDiscovery && state.credentialDiscovery.slots;
    return slots && slots[slot] ? slots[slot] : {};
  }

  function getSlotSelected(slot) {
    const discovery = getSlotDiscovery(slot);
    if (discovery.selected) return discovery.selected;
    const saved = state.credentialSlots && state.credentialSlots[slot];
    return saved || {};
  }

  function getSlotCandidates(slot) {
    const discovery = getSlotDiscovery(slot);
    return Array.isArray(discovery.candidates) ? discovery.candidates : [];
  }

  function candidateKey(candidate) {
    if (!candidate) return "";
    if (candidate.ref && typeof candidate.ref === "object") {
      const ref = candidate.ref;
      return [
        ref.name || candidate.name || "",
        ref.source || candidate.source || "",
        ref.authFilePath || "",
        ref.envVar || "",
      ].join("\0");
    }
    return [candidate.name || "", candidate.source || candidate.source_label || ""].join("\0");
  }

  function findCandidate(slot, pickKey) {
    if (!pickKey) return null;
    return getSlotCandidates(slot).find((item) => candidateKey(item) === pickKey) || null;
  }

  function candidateMatchesSelection(candidate, selected) {
    if (!candidate || !selected) return false;
    if (selected.ref && candidate.ref) return candidateKey(candidate) === candidateKey({ name: selected.name, ref: selected.ref, source: selected.ref.source });
    return String(candidate.name || "") === String(selected.name || "");
  }

  function syncSlotFormPickKeys() {
    for (const slot of CREDENTIAL_SLOTS) {
      const selected = getSlotSelected(slot);
      if (!selected || !selected.name) continue;
      const match = getSlotCandidates(slot).find((item) => candidateMatchesSelection(item, selected));
      if (match) state.credentialSlotForms[slot].pickKey = candidateKey(match);
    }
  }

  function clearSlotFormSecret(slot) {
    state.credentialSlotForms[slot].apiKey = "";
  }

  function slotMetaFromCandidate(slot, candidate) {
    if (!candidate) return {};
    const meta = { name: candidate.name, label: candidate.label || candidate.name };
    if (slot === "provider") {
      if (candidate.base_url) meta.base_url = candidate.base_url;
      if (candidate.models_url) meta.models_url = candidate.models_url;
      if (candidate.chat_url) meta.chat_url = candidate.chat_url;
      if (candidate.endpoint_mode) meta.endpoint_mode = candidate.endpoint_mode;
      if (candidate.safe_custom) meta.safeCustom = candidate.safe_custom;
    }
    if (candidate.ref) meta.ref = candidate.ref;
    return meta;
  }

  function hydrateProviderFromCandidate(candidate) {
    if (!candidate || !candidate.base_url) return;
    const f = state.forms.provider;
    f.base_url = candidate.base_url;
    if (candidate.models_url) f.models_override_url = candidate.models_url;
    if (candidate.endpoint_mode) f.endpoint_mode = candidate.endpoint_mode;
  }

  function candidateOptionLabel(candidate, allCandidates) {
    const name = candidate.label || candidate.name || "Unknown";
    const source = candidate.source_label || candidate.source || "";
    let label = source ? `${name} (${source})` : name;
    const ref = candidate.ref;
    if (ref && ref.authFilePath && Array.isArray(allCandidates)) {
      const sourceKey = `${candidate.name || ""}\0${source}`;
      const hasDuplicate = allCandidates.some((other) => {
        if (other === candidate) return false;
        const otherSource = other.source_label || other.source || "";
        if (`${other.name || ""}\0${otherSource}` !== sourceKey) return false;
        return Boolean(other.ref && other.ref.authFilePath && other.ref.authFilePath !== ref.authFilePath);
      });
      if (hasDuplicate) {
        const basename = String(ref.authFilePath).split(/[/\\]/).pop() || ref.authFilePath;
        label += ` · ${basename}`;
      }
    }
    return label;
  }

  function grantStatusCopy(selected) {
    const status = selected && selected.grant_status;
    if (!status || !status.status || status.status === "none") return "";
    if (status.status === "renewal_needed") return "Grant renewal recommended";
    if (status.status === "expired") return "Grant expired — re-select or save again";
    if (status.expires_at) return "Access until " + fmtDate(status.expires_at, true);
    return "Durable access active";
  }

  function selectedStatusCopy(slot, selected, envOverride) {
    if (envOverride && envOverride.configured) {
      const envName = envOverride.env_var || "environment variable";
      return `Using ${envName} (read-only)`;
    }
    if (!selected || !selected.name) return "No credential selected for " + (SLOT_TITLES[slot] || slot);
    const source = selected.source_label && selected.source_label !== "none" ? selected.source_label : "selected";
    const managed = selected.managed_by_llmdash ? " · LLM-Dash managed" : " · external Voidware credential";
    const grant = grantStatusCopy(selected);
    return `${selected.label || selected.name} (${source})${managed}${grant ? " · " + grant : ""}`;
  }

  function renderCredentialSlot(slot, options) {
    const form = state.credentialSlotForms[slot];
    const discovery = getSlotDiscovery(slot);
    const selected = getSlotSelected(slot);
    const envOverride = discovery.env_override || {};
    const candidates = getSlotCandidates(slot);
    const managed = Boolean(selected.managed_by_llmdash);
    const hasSelection = Boolean(selected.name) || Boolean(envOverride.configured);
    const warnings = Array.isArray(state.credentialDiscovery.same_name_warnings) ? state.credentialDiscovery.same_name_warnings : [];
    const pickKey = form.pickKey || "";
    const picked = findCandidate(slot, pickKey);
    const showNewKey = form.mode === "new";
    const showUpdate = form.mode === "update" && hasSelection && !envOverride.configured;
    const canUseSelected = Boolean(picked) && !envOverride.configured && form.mode === "select";
    const nodes = [
      h("div", { class: "credential-slot-head" }, [
        h("strong", { class: "credential-slot-title" }, (options && options.title) || "Credential"),
        h("p", { class: "credential-slot-status" }, selectedStatusCopy(slot, selected, envOverride)),
      ]),
    ];
    if (warnings.length) {
      nodes.push(h("ul", { class: "credential-slot-warnings" }, warnings.map((item) => h("li", null, item))));
    }
    if (!envOverride.configured) {
      nodes.push(h("label", { class: "field" }, [
        h("span", null, "Source"),
        h("select", {
          value: showNewKey ? "__new__" : (pickKey || ""),
          onchange: (e) => {
            const value = e.target.value;
            if (value === "__new__") {
              form.mode = "new";
              form.pickKey = "";
            } else {
              form.mode = "select";
              form.pickKey = value;
            }
            render();
          },
        }, [
          h("option", { value: "" }, candidates.length ? "Choose an existing credential…" : "No saved credentials yet"),
          ...candidates.map((item) => h("option", { value: candidateKey(item) }, candidateOptionLabel(item, candidates))),
          h("option", { value: "__new__" }, "New key…"),
        ]),
      ]));
    }
    if (showNewKey || showUpdate) {
      nodes.push(h("label", { class: "field" }, [
        h("span", null, showUpdate ? "Replacement API key" : "API key"),
        h("input", {
          type: "password",
          value: form.apiKey,
          placeholder: showUpdate ? "Paste replacement key" : "Paste API key",
          autocomplete: "off",
          oninput: (e) => { form.apiKey = e.target.value; },
        }),
      ]));
    }
    if (!managed && hasSelection && !envOverride.configured) {
      nodes.push(h("p", { class: "credential-slot-external-note" }, "This credential is managed outside LLM-Dash. Editing or deleting it requires a fresh Voidware encryption-password approval."));
    }
    nodes.push(h("div", { class: "credential-slot-actions action-row" }, [
      canUseSelected ? h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => slotSelect(slot) }, "Use selected") : null,
      showNewKey ? h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => slotSaveNew(slot) }, "Save new key") : null,
      showUpdate && managed ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => slotUpdate(slot, false) }, "Update selected key") : null,
      showUpdate && !managed ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => slotUpdate(slot, true) }, "Modify external Voidware credential") : null,
      hasSelection && !envOverride.configured ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => slotClearSelection(slot) }, "Remove selection") : null,
      hasSelection && managed && !envOverride.configured ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => slotDeleteCredential(slot, false) }, "Delete credential") : null,
      hasSelection && !managed && !envOverride.configured ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => slotDeleteCredential(slot, true) }, "Delete external Voidware credential") : null,
      hasSelection && managed && !showUpdate && !envOverride.configured ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => { form.mode = "update"; render(); } }, "Update selected key") : null,
    ].filter(Boolean)));
    return h("section", { class: "credential-slot", "aria-label": (SLOT_TITLES[slot] || slot) + " credential" }, nodes);
  }

  async function slotSelect(slot, isRetry) {
    const form = state.credentialSlotForms[slot];
    const candidate = findCandidate(slot, form.pickKey);
    if (!candidate) return toast("Choose a credential first.", "warning");
    try {
      await api("/api/credentials/slots/" + encodeURIComponent(slot) + "/select", {
        method: "POST",
        body: {
          credential_name: candidate.name,
          credential_ref: candidate.ref || null,
          credential_meta: slotMetaFromCandidate(slot, candidate),
        },
      });
      await refreshCredentialState();
      if (slot === "provider") hydrateProviderFromCandidate(candidate);
      form.mode = "select";
      clearSlotFormSecret(slot);
      toast(SLOT_TITLES[slot] + " credential selected", "success");
      render();
    } catch (error) {
      if (!isRetry && await openApproval(error, () => slotSelect(slot, true), { slot })) return;
      toast(message(error), "error");
    }
  }

  async function slotSaveNew(slot, isRetry) {
    const form = state.credentialSlotForms[slot];
    const apiKey = form.apiKey.trim();
    if (!apiKey) return toast("Enter an API key first.", "warning");
    try {
      await api("/api/credentials/slots/" + encodeURIComponent(slot) + "/save", {
        method: "POST",
        body: { api_key: apiKey },
      });
      await refreshCredentialState();
      form.mode = "select";
      clearSlotFormSecret(slot);
      toast(SLOT_TITLES[slot] + " key saved", "success");
      render();
    } catch (error) {
      if (!isRetry && await openApproval(error, () => slotSaveNew(slot, true), { slot, stagedSecret: apiKey })) return;
      toast(message(error), "error");
    }
  }

  async function slotUpdate(slot, external, isRetry) {
    const form = state.credentialSlotForms[slot];
    const apiKey = form.apiKey.trim();
    if (!apiKey) return toast("Enter a replacement API key first.", "warning");
    try {
      await api("/api/credentials/slots/" + encodeURIComponent(slot) + "/update", {
        method: "POST",
        body: {
          api_key: apiKey,
          external_mutation: external,
          require_fresh_grant: external,
        },
      });
      await refreshCredentialState();
      form.mode = "select";
      clearSlotFormSecret(slot);
      toast(SLOT_TITLES[slot] + " key updated", "success");
      render();
    } catch (error) {
      if (!isRetry && await openApproval(error, () => slotUpdate(slot, external, true), { slot, stagedSecret: apiKey })) return;
      toast(message(error), "error");
    }
  }

  async function slotClearSelection(slot) {
    if (!confirm("Remove the app selection for " + (SLOT_TITLES[slot] || slot) + "? The Voidware credential itself stays on disk.")) return;
    try {
      await api("/api/credentials/slots/" + encodeURIComponent(slot) + "/selection", { method: "DELETE" });
      await refreshCredentialState();
      state.credentialSlotForms[slot].mode = "select";
      clearSlotFormSecret(slot);
      toast("Selection removed", "success");
      render();
    } catch (error) { toast(message(error), "error"); }
  }

  async function slotDeleteCredential(slot, external, isRetry) {
    const label = external ? "Delete this external Voidware credential?" : "Delete the LLM-Dash-managed credential?";
    if (!confirm(label)) return;
    const query = external ? "?external_mutation=true&require_fresh_grant=true" : "";
    try {
      await api("/api/credentials/slots/" + encodeURIComponent(slot) + "/credential" + query, { method: "DELETE" });
      await refreshCredentialState();
      state.credentialSlotForms[slot].mode = "select";
      state.credentialSlotForms[slot].pickKey = "";
      clearSlotFormSecret(slot);
      toast("Credential deleted", "success");
      render();
    } catch (error) {
      if (!isRetry && await openApproval(error, () => slotDeleteCredential(slot, external, true), { slot })) return;
      toast(message(error), "error");
    }
  }

  function settingsProvider() {
    const f = state.forms.provider;
    return panel("Connection", providerStatusCopy(), [
      renderCredentialSlot("provider", { title: "API key" }),
      h("label", { class: "field" }, [h("span", null, "Base URL"), input(f, "base_url", "https://api.openai.com")]),
      h("label", { class: "field" }, [h("span", null, "Models URL override"), input(f, "models_override_url", "Optional")]),
      h("label", { class: "field" }, [h("span", null, "Endpoint mode"), h("select", { value: f.endpoint_mode, onchange: (e) => { f.endpoint_mode = e.target.value; } }, [
        h("option", { value: "append_v1" }, "Append /v1"),
        h("option", { value: "root" }, "Use URL as root"),
      ])]),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => testConnection() }, "Test connection"),
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: saveProviderSettings }, "Save connection"),
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: openManualPrompt }, "Manual prompt"),
      ]),
    ]);
  }

  function settingsModels() {
    const f = state.forms.models;
    return panel("Agent model", "Choose the default model and an optional backup the research agent uses for seeding and update runs.", [
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
    return panel("Research", "Select or create Voidware credentials for research integrations.", [
      h("div", { class: "status-row" }, [
        statusPill(state.provider.exa_configured ? "Configured" : "Not configured", state.provider.exa_configured ? "fresh" : "unknown"),
        h("span", null, "Exa search"),
      ]),
      renderCredentialSlot("exa", { title: "Exa API key" }),
      h("div", { class: "status-row" }, [
        statusPill(state.provider.llmstats_configured ? "Configured" : "Not configured", state.provider.llmstats_configured ? "fresh" : "unknown"),
        h("span", null, "LLM Stats"),
      ]),
      renderCredentialSlot("llmstats", { title: "LLM Stats API key" }),
      h("div", { class: "status-row" }, [
        statusPill(state.provider.aa_configured ? "Configured" : "Not configured", state.provider.aa_configured ? "fresh" : "unknown"),
        h("span", null, "Artificial Analysis"),
      ]),
      renderCredentialSlot("aa", { title: "Artificial Analysis API key" }),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => testLLMStats() }, "Test LLM Stats"),
        h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => testAA() }, "Test Artificial Analysis"),
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
      title ? h("h2", { class: "settings-panel-title" }, title) : null,
      summary ? h("p", { class: "settings-summary" }, summary) : null,
      h("div", { class: "settings-fields" }, children),
    ]);
  }

  async function saveProviderSettings() {
    const payload = {
      base_url: state.forms.provider.base_url,
      models_override_url: state.forms.provider.models_override_url,
      endpoint_mode: state.forms.provider.endpoint_mode,
      default_model: state.forms.models.default_model,
      backup_model: state.forms.models.backup_model,
    };
    try {
      state.provider = await api("/api/provider", { method: "POST", body: payload });
      hydrateForms();
      toast("Connection saved", "success");
      render();
    } catch (error) {
      toast(message(error), "error");
    }
  }

  async function testConnection(isRetry) {
    try {
      const data = await api("/api/provider/test-connection", { method: "POST", body: { ...state.forms.provider, ...state.forms.models } });
      toast(data.ok ? `${data.models_count || 0} models visible` : `Provider returned HTTP ${data.status_code}`, data.ok ? "success" : "warning");
    } catch (error) {
      if (!isRetry && await openApproval(error, () => testConnection(true), { slot: "provider" })) return;
      toast(message(error), "error");
    }
  }

  async function testModel(target) {
    try {
      const data = await api("/api/provider/test-model", { method: "POST", body: { target } });
      toast(data.ok ? `${target} model replied` : `${target} model failed`, data.ok ? "success" : "warning");
    } catch (error) { toast(message(error), "error"); }
  }

  async function testLLMStats(isRetry) {
    try {
      const data = await api("/api/llmstats/test-connection");
      toast(data.ok ? "LLM Stats is reachable" : "LLM Stats test failed", data.ok ? "success" : "warning");
    } catch (error) {
      if (!isRetry && await openApproval(error, () => testLLMStats(true), { slot: "llmstats" })) return;
      toast(message(error), "error");
    }
  }

  async function testAA(isRetry) {
    try {
      const data = await api("/api/aa/test-connection");
      toast(data.ok ? "Artificial Analysis is reachable" : "Artificial Analysis test failed", data.ok ? "success" : "warning");
    } catch (error) {
      if (!isRetry && await openApproval(error, () => testAA(true), { slot: "aa" })) return;
      toast(message(error), "error");
    }
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

  function parseApprovalMeta(meta) {
    const operation = meta && meta.operation;
    return {
      operation: typeof operation === "object" && operation ? (operation.kind || "") : String(operation || ""),
      target: String((meta && meta.target) || (typeof operation === "object" && operation && operation.target) || ""),
      scopes: Array.isArray(meta && meta.scopes) ? meta.scopes : [],
      ttl: String((meta && meta.ttl) || "120d"),
      passwordRequired: meta && meta.passwordRequired !== undefined ? Boolean(meta.passwordRequired) : true,
      secretRequired: Boolean(meta && meta.secretRequired),
    };
  }

  function approvalOperationLabel(approval) {
    if (approval.operation) return approval.operation.replace(/_/g, " ");
    return "credential access";
  }

  function clearApprovalState() {
    state.approval = EMPTY_APPROVAL();
  }

  async function closeApproval() {
    if (state.approval.open) {
      try { await api("/api/voidware/broker/approval/deny", { method: "POST" }); } catch (_) {}
    }
    clearApprovalState();
    for (const slot of CREDENTIAL_SLOTS) clearSlotFormSecret(slot);
    render();
  }

  async function openApproval(error, after, context) {
    const detail = error && error.payload && error.payload.detail;
    const code = typeof detail === "object" ? detail.code : "";
    if (code !== "approval_pending" && code !== "approval_waiting") return false;
    let meta = {};
    if (detail && typeof detail.approval === "object") meta = detail.approval;
    else {
      try {
        const pending = await api("/api/voidware/broker/approval");
        if (pending.pending && typeof pending.pending === "object") meta = pending.pending;
      } catch (_) {}
    }
    state.approval = {
      open: true,
      password: "",
      secret: "",
      error: "",
      after,
      stagedSecret: (context && context.stagedSecret) || "",
      slot: (context && context.slot) || "",
      ...parseApprovalMeta(meta),
    };
    render();
    return true;
  }

  async function approveVoidware() {
    try {
      const body = { password: state.approval.password };
      if (state.approval.secretRequired && !state.approval.stagedSecret) body.secret = state.approval.secret;
      await api("/api/voidware/broker/approval", { method: "POST", body });
      const after = state.approval.after;
      clearApprovalState();
      render();
      if (typeof after === "function") await after(true);
      for (const slot of CREDENTIAL_SLOTS) clearSlotFormSecret(slot);
      render();
    } catch (error) {
      state.approval.error = message(error);
      render();
    }
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
      h("p", { class: "shortcut-note" }, "Tip: check the Compare box on a row (or double-click a chart point) to stack models, then open the comparison table. Click a provider in the chart legend to filter."),
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
    if (state.approval.open) {
      const approval = state.approval;
      const passwordOnly = approval.passwordRequired && !(approval.secretRequired && !approval.stagedSecret);
      const modalTitle = passwordOnly ? "Enter your Voidware encryption password" : "Voidware approval";
      const slotLabel = approval.slot ? (SLOT_TITLES[approval.slot] || approval.slot) : "this app";
      const operationLabel = approvalOperationLabel(approval);
      const scopeCopy = approval.scopes.length ? approval.scopes.join(", ") : "scoped secret access";
      nodes.push(modal(modalTitle, [
        h("p", { class: "approval-copy" }, (
          "Approve " + operationLabel + " for " + slotLabel
          + (approval.target ? " on " + approval.target : "")
          + ". Durable access TTL: " + (approval.ttl || "120d") + ". Scopes: " + scopeCopy + "."
        )),
        approval.stagedSecret ? h("p", { class: "settings-note" }, "The API key you entered in Settings will be used after approval.") : null,
        approval.error ? h("p", { class: "error-copy" }, approval.error) : null,
        approval.passwordRequired ? h("label", { class: "field" }, [
          h("span", null, "Voidware encryption password"),
          h("input", { type: "password", value: approval.password, autocomplete: "off", oninput: (e) => { approval.password = e.target.value; } }),
        ]) : null,
        approval.secretRequired && !approval.stagedSecret ? h("label", { class: "field" }, [
          h("span", null, "Secret"),
          h("input", { type: "password", value: approval.secret, autocomplete: "off", oninput: (e) => { approval.secret = e.target.value; } }),
        ]) : null,
        h("div", { class: "action-row" }, [
          h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: closeApproval }, "Deny"),
          h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: approveVoidware }, "Approve"),
        ]),
      ], closeApproval));
    }
    if (state.compareOpen) {
      const co = compareOverlay();
      if (co) nodes.push(co);
      else state.compareOpen = false;
    }
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
    if (els.refresh) els.refresh.disabled = Boolean(state.setupMode);
    updateFreshness();
    els.sidebar.classList.toggle("open", state.drawerOpen);
    els.sidebar.dataset.vwOpen = state.drawerOpen ? "true" : "false";
    els.backdrop.classList.toggle("open", state.drawerOpen);
    els.backdrop.dataset.vwOpen = state.drawerOpen ? "true" : "false";
    els.toggle.setAttribute("aria-expanded", String(state.drawerOpen));
    els.content.toggleAttribute("inert", state.drawerOpen);
    // The docked detail rail only exists on the Models area; mirror the content
    // inert state so it can't trap focus behind the mobile nav drawer.
    const railOn = state.area === "models" && !state.setupMode && state.ready;
    els.app.classList.toggle("has-rail", railOn);
    if (els.rail) {
      els.rail.hidden = !railOn;
      els.rail.toggleAttribute("inert", state.drawerOpen);
    }
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
    document.querySelectorAll(".view-btn[data-area]").forEach((btn) => btn.addEventListener("click", () => navigate(btn.dataset.area, btn.dataset.view === "chart" ? "chart" : btn.dataset.area === "models" ? "list" : btn.dataset.area === "settings" ? "provider" : "index")));
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
      if (state.ui.filtersOpen) { closeFilters(); return; }
      if (state.compareOpen) { state.compareOpen = false; render(); return; }
      if (state.helpOpen || state.manualOpen || state.approval.open) {
        if (state.approval.open) { closeApproval(); return; }
        state.helpOpen = false; state.manualOpen = false; render(); return;
      }
      if (state.drawerOpen) { closeDrawer(); return; }
      if (state.run.open && state.run.state !== "running") { state.run.open = false; render(); return; }
    }
    if (state.drawerOpen || state.helpOpen || state.manualOpen || state.approval.open || state.compareOpen) return;
    // Don't fire single-key shortcuts while the user is typing in a field.
    const tag = (event.target && event.target.tagName) || "";
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) || (event.target && event.target.isContentEditable)) return;
    if (event.key === "/" && state.area === "models") {
      event.preventDefault();
      document.getElementById("model-search")?.focus();
    } else if (event.key === "e") exportModels();
    else if (event.key === "r" && !state.setupMode) handleRefresh();
    else if (event.key === "?") { state.helpOpen = true; render(); }
    else if (event.key === "j" || event.key === "k") moveFocus(event.key === "j" ? 1 : -1);
  }

  function closeDrawer() {
    state.drawerOpen = false;
    render();
    els.toggle.focus({ preventScroll: true });
  }

  function navigate(area, subpage) {
    if (state.setupMode && ["models", "changelog", "stats"].includes(area)) {
      area = "settings";
      subpage = state.setupStep || state.subpage.settings;
    }
    state.area = area || "models";
    if (subpage && state.subpage[state.area] !== undefined) state.subpage[state.area] = subpage;
    if (state.setupMode && area === "settings" && subpage) state.setupStep = subpage;
    state.drawerOpen = false;
    history.pushState({}, "", hashFor(state.area, state.subpage[state.area]));
    render();
  }

  function parseHash(hash) {
    const raw = String(hash || "").replace(/^#/, "");
    const legacy = { table: ["models", "table"], chart: ["models", "chart"], data: ["settings", "provider"], settings: ["settings", "provider"], changelog: ["changelog", "index"], stats: ["stats", "index"] };
    if (!raw) return ["models", "list"];
    if (legacy[raw]) return legacy[raw];
    const [area, sub] = raw.split(/[/?]/);
    return [AREA[area] ? area : "models", sub || (area === "settings" ? "provider" : area === "models" ? "list" : "index")];
  }

  function applyRoute(route) {
    state.area = route[0];
    if (state.subpage[state.area] !== undefined) state.subpage[state.area] = route[1];
  }

  function hashFor(area, sub) {
    if (area === "models") return "#models/" + (sub || "list");
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
    document.querySelectorAll("table.models tbody tr, .model-list-row")[idx]?.focus();
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
    const node = h("div", { class: "vw-toast toast", "data-testid": "toast", "data-tone": tone || "info", role: tone === "error" ? "alert" : "status" }, [
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
    return h("span", { class: "vw-status-chip", "data-state": stateName || "unknown" }, label);
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

  function consumeSetupFlag() {
    const params = new URLSearchParams(location.search);
    if (!params.has("setup")) return false;
    state.setupMode = true;
    state.resetMode = true;
    state.setupStep = "provider";
    state.ui = { ...DEFAULT_UI };
    try { localStorage.removeItem(STORE_KEY); } catch (_) {}
    params.delete("setup");
    const query = params.toString();
    history.replaceState({}, "", location.pathname + (query ? "?" + query : "") + "#settings/provider");
    return true;
  }

  function consumeResetFlag() {
    const params = new URLSearchParams(location.search);
    if (!params.has("reset")) return false;
    state.resetMode = true;
    state.setupMode = true;
    state.setupStep = "provider";
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
