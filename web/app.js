// LLM-Dash frontend. Zero-build, package-vendored Voidware, browser SQLite.
import { overall, valueScore, metricValue, tier, compareBy, paretoFrontier } from "./ranking.js";

(function () {
  "use strict";

  const METRIC_KEYS = ["intelligence", "coding", "agents", "speed", "cost"];
  const CHART_METRIC_KEYS = ["cost", "overall", "value", "intelligence", "coding", "agents", "speed"];
  // Cluster radius for scatter hover disambiguation (resolution 11): viewBox
  // units, not screen px — the 720x400 viewBox scales with the container.
  const CHART_CLUSTER_RADIUS = 10;

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
  // Score columns are the only hideable ones (U5a). rank/provider/model/compare
  // are structural and always render.
  const HIDEABLE_COLUMNS = COLUMNS.filter((c) => c.score).map((c) => c.key);
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
    columnsOpen: false,
    visibleColumns: null,
    frontierOnly: false,
    pinCompared: false,
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
    runTick: 0,
    seedTimer: 0,
    seedTick: 0,
    metaTimer: 0,
    chartResize: 0,
    resetMode: false,
    setupMode: false,
    setupStep: "provider",
    setupResearchSource: "exa",
    seedLogExpanded: false,
    runLogExpanded: false,
    focusIndex: 0,
    drawerOpen: false,
    detailDrawerOpen: false,
    helpOpen: false,
    manualOpen: false,
    refreshOptionsOpen: false,
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
    providerModels: { loading: false, loaded: false, list: [], error: "" },
    // Per-control async test/save feedback so surfaces can show inline spinners
    // and pass/fail color instead of relying only on a toast.
    testStatus: {},
    presets: [],
    schedule: {},
    run: { open: false, id: "", state: "idle", started: 0, tail: "", error: "", source: "" },
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

  function showMigrationBanner(errorText) {
    const banner = document.getElementById("migration-banner");
    if (!banner) return;
    const text = String(errorText || "").trim();
    if (text) {
      banner.textContent = text;
      banner.hidden = false;
    } else {
      banner.textContent = "";
      banner.hidden = true;
    }
  }

  async function waitForBootstrap() {
    for (;;) {
      const data = await api("/api/bootstrap-status").catch((error) => ({ state: "error", detail: message(error) }));
      showMigrationBanner(data.migration_error);
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

  // Pulls the provider's /models list so the agent-model fields can be real
  // dropdowns instead of free text. Self-guards: a render-time call is a no-op
  // once a fetch is in flight or has already completed (use force to refetch).
  async function loadProviderModelList(force) {
    const pm = state.providerModels;
    if (pm.loading) return;
    if (pm.loaded && !force) return;
    if (!state.provider.has_provider) { pm.loaded = true; return; }
    pm.loading = true;
    pm.error = "";
    if (force) render();
    try {
      const data = await api("/api/provider/models");
      pm.list = (data.models || []).map((m) => String(m.id || m.name || "")).filter(Boolean);
      pm.error = "";
    } catch (error) {
      pm.list = [];
      pm.error = message(error);
    } finally {
      pm.loading = false;
      pm.loaded = true;
      render();
    }
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
    const modelIds = new Set(state.models.map((m) => m.id));
    // compare = explicit checkbox set (empty by default). inspect = single
    // row/point click; falls back to the top model so the stat panel is never
    // blank, but never auto-joins the compare set.
    // When "Pin compared" is on the selection is scoped to the full catalog so a
    // filtered/off-frontier pick stays pinned (U5c); otherwise it prunes to the
    // visible set as before, so filtering away a compared row unchecks it.
    const compareScope = state.ui.pinCompared ? modelIds : ids;
    state.ui.compare = (state.ui.compare || []).filter((id) => compareScope.has(id)).slice(0, MAX_COMPARE);
    // inspect membership is checked against the full catalog, not the filtered
    // set, so a deep-linked (?m=) model stays inspected even when active filters
    // exclude it. Only reset when the id has no backing model at all.
    if (!modelIds.has(state.ui.inspect)) state.ui.inspect = state.filteredModels[0] ? state.filteredModels[0].id : "";
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

  // Ranking math (overall/valueScore/metricValue/weighted/tier/sortValue/compareBy)
  // lives in ./ranking.js — imported at the top of this module and unit-tested by
  // web/ranking.test.js (T8).

  function modelCapabilities(model) {
    let raw = model.input_capabilities;
    if (typeof raw === "string") { try { raw = JSON.parse(raw); } catch (_) { raw = [raw]; } }
    const items = Array.isArray(raw) ? raw.map((v) => String(v).toLowerCase()) : [];
    const keep = CAPABILITY_ORDER.filter((c) => items.includes(c));
    return keep.length ? keep : ["text"];
  }

  function render() {
    destroyStatsCharts();
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
    if (state.setupMode) {
      // The dedicated wizard takes over the screen from the overlay layer; keep
      // the shell behind it quiet rather than rendering a half-built dashboard.
      mount(h("div", { class: "wizard-underlay", "aria-hidden": "true" }));
      renderDetailRail();
      return;
    }
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
    const frontierCount = paretoFrontier(state.filteredModels, "cost", "overall").length;
    return h("section", { class: "models-toolbar", "aria-label": "Model controls" }, [
      h("div", { class: "toolbar-primary" }, [
        h("label", { class: "search-field" }, [
          h("span", { class: "sr-only" }, "Search models"),
          h("input", {
            id: "model-search",
            type: "search",
            value: state.ui.text,
            placeholder: "Search model or vendor",
            oninput: (e) => { state.ui.text = e.target.value; debounceSearch(); },
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
        // Pareto-frontier toggle (U5b): narrows every models sub-view to the
        // cost/overall non-dominated set. Chip label carries the live count.
        h("button", {
          class: "vw-btn vw-btn-secondary frontier-toggle" + (state.ui.frontierOnly ? " is-active" : ""),
          type: "button",
          "aria-pressed": String(state.ui.frontierOnly),
          title: "Show only cost/overall Pareto-frontier models",
          onclick: () => { state.ui.frontierOnly = !state.ui.frontierOnly; savePrefs(); render(); },
        }, `Frontier · ${frontierCount}`),
        // Column presets (U5a) — table view only; mirrors the Filters popover idiom.
        isTable ? h("div", { class: "filter-anchor columns-anchor" }, [
          h("button", {
            class: "vw-btn vw-btn-secondary toolbar-columns-btn" + (state.ui.columnsOpen ? " is-open" : ""),
            type: "button",
            "aria-expanded": String(state.ui.columnsOpen),
            "aria-haspopup": "dialog",
            onclick: () => { state.ui.columnsOpen = !state.ui.columnsOpen; savePrefs(); render(); },
          }, "Columns"),
          state.ui.columnsOpen ? h("div", { class: "filter-pop-backdrop", "aria-hidden": "true", onclick: closeColumns }) : null,
          state.ui.columnsOpen ? h("div", { class: "filter-pop columns-pop", role: "dialog", "aria-label": "Table columns", "aria-labelledby": "columns-menu-title" }, renderColumnsMenu()) : null,
        ]) : null,
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
            id: "filter-min-overall",
            type: "range", min: "0", max: "10", step: "0.5", value: String(state.ui.minOverall || 0),
            "aria-label": "Minimum overall score",
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

  // The score columns currently marked visible (U5a). null prefs => all visible;
  // an array is intersected with the known hideable keys, preserving COLUMNS order.
  function visibleScoreKeys() {
    const vis = state.ui.visibleColumns;
    return Array.isArray(vis) ? HIDEABLE_COLUMNS.filter((k) => vis.includes(k)) : [...HIDEABLE_COLUMNS];
  }

  // The COLUMNS actually rendered by the table: structural columns always, score
  // columns only when visible. Colgroup, header, and body all key off this so the
  // three stay index-aligned (resize handles depend on that alignment).
  function tableColumns() {
    const shown = new Set(visibleScoreKeys());
    return COLUMNS.filter((c) => !c.score || shown.has(c.key));
  }

  function toggleColumn(key) {
    const shown = new Set(visibleScoreKeys());
    if (shown.has(key)) shown.delete(key); else shown.add(key);
    state.ui.visibleColumns = HIDEABLE_COLUMNS.filter((k) => shown.has(k));
    savePrefs();
    render();
  }

  function closeColumns() {
    if (!state.ui.columnsOpen) return;
    state.ui.columnsOpen = false;
    savePrefs();
    render();
  }

  function renderColumnsMenu() {
    const shown = new Set(visibleScoreKeys());
    return h("div", { class: "columns-menu" }, [
      h("p", { class: "columns-menu-title", id: "columns-menu-title" }, "Show columns"),
      h("div", { class: "columns-menu-list" }, HIDEABLE_COLUMNS.map((key) => {
        const col = COLUMNS.find((c) => c.key === key);
        return h("label", { class: "columns-menu-item" }, [
          h("input", { type: "checkbox", checked: shown.has(key), onchange: () => toggleColumn(key) }),
          h("span", { class: "columns-menu-dot", "aria-hidden": "true", style: { background: metricColor(key) } }),
          h("span", null, col ? col.label : key),
        ]);
      })),
    ]);
  }

  // The ordered model set a view renders. Two view-only transforms sit here (not
  // in refreshModels) so the canonical filteredModels stays intact: the frontier
  // toggle (U5b) narrows to the cost/overall Pareto set, and pinned compare (U5c)
  // hoists compare-selected models to the top even when the frontier/filters would
  // drop them. Returns { pinned, rest } so the render path can draw a divider.
  function displayModels() {
    let base = state.filteredModels;
    if (state.ui.frontierOnly) base = paretoFrontier(base, "cost", "overall");
    if (!state.ui.pinCompared || !state.ui.compare.length) return { pinned: [], rest: base };
    const pinnedIds = new Set(state.ui.compare);
    // Resolve pins from the full catalog, in selection order, so a filtered/
    // off-frontier compare pick still shows at the top.
    const byId = new Map(state.models.map((m) => [m.id, m]));
    const pinned = state.ui.compare.map((id) => byId.get(id)).filter(Boolean);
    const rest = base.filter((m) => !pinnedIds.has(m.id));
    return { pinned, rest };
  }

  // The scatter plot's point set: the frontier toggle narrows it across every
  // sub-view (U5b). Pinning is order-only, meaningless on a scatter, so skip it.
  function chartModels() {
    return state.ui.frontierOnly ? paretoFrontier(state.filteredModels, "cost", "overall") : state.filteredModels;
  }

  function renderTable() {
    if (!state.totalModelCount) return emptyState("No models tracked yet", "Run Refresh to discover and score models.", "Run Refresh", handleRefresh);
    const { pinned, rest } = displayModels();
    if (!pinned.length && !rest.length) return emptyState("No models match this view", "Clear filters or search for another vendor.", "Reset view", resetFilters);
    const zoom = clampZoom(state.ui.tableZoom);
    const graded = zoom < GRADE_ZOOM;
    const widths = state.ui.colWidths || {};
    const cols = tableColumns();
    const ordered = [...pinned, ...rest];
    const pinCount = pinned.length;
    const bodyRow = (model, index) => h("tr", {
      class: rowClasses(model.id) + (index < pinCount ? " is-pinned" : ""),
      tabindex: "0",
      "data-testid": "model-row",
      "data-model": model.name || "",
      onclick: () => setInspect(model.id),
      onkeydown: (e) => rowKey(e, index, model.id),
      style: { "--model-color": safeColor(model.color) },
    }, cols.map((col) => bodyCell(col, model, index)));
    return h("section", {
      class: "model-table-layout" + (graded ? " is-graded" : "") + (pinCount ? " has-pins" : ""),
      style: { "--table-zoom": String(zoom) },
    }, [
      h("div", { class: "table-wrap models-table-wrap vw-scroll-shadow" }, [
        h("table", { class: "models" }, [
          h("colgroup", null, cols.map((col) => {
            const w = Number(widths[col.key]) || col.w;
            return h("col", w ? { style: { width: w + "px" } } : null);
          })),
          h("thead", null, h("tr", null, cols.map(headerCell))),
          h("tbody", null, ordered.map((model, index) => bodyRow(model, index))),
        ]),
      ]),
      h("div", { class: "models-mobile-list" }, ordered.map((model, index) => modelCard(model, index, index < pinCount))),
    ]);
  }

  function renderList() {
    if (!state.totalModelCount) return emptyState("No models tracked yet", "Run Refresh to discover and score models.", "Run Refresh", handleRefresh);
    const { pinned, rest } = displayModels();
    if (!pinned.length && !rest.length) return emptyState("No models match this view", "Clear filters or search for another vendor.", "Reset view", resetFilters);
    const ordered = [...pinned, ...rest];
    const pinCount = pinned.length;
    return h("section", { class: "model-list-layout" + (pinCount ? " has-pins" : "") }, [
      h("div", { class: "list-sort-bar" }, [
        h("label", { class: "field compact list-sort-field" }, [
          h("span", null, "Sort"),
          h("select", { value: state.ui.sortKey, onchange: (e) => setSort(e.target.value) },
            MOBILE_SORTS.map(([key, label]) => h("option", { value: key }, label))),
        ]),
      ]),
      h("div", { class: "model-list vw-scroll-shadow" },
        ordered.map((model, index) => listRow(model, index, index < pinCount))),
    ]);
  }

  const LIST_BAR_METRICS = ["intelligence", "coding", "agents", "speed"];
  // Compact codes for the dense list-row bars; full labels still appear in the
  // table headers and the detail rail. Keeps label+value from colliding in the
  // narrow per-metric cells (~53px when the detail rail is open).
  const LIST_BAR_CODE = { intelligence: "Int", coding: "Cod", agents: "Agt", speed: "Spd" };

  function listRow(model, index, pinned) {
    const color = safeColor(model.color);
    const g = tier(overall(model));
    return h("div", {
      // Focusable container, not role=button: a button must not nest the compare
      // checkbox (axe nested-interactive). Keyboard nav still works via tabindex.
      class: rowClasses(model.id) + " model-list-row" + (pinned ? " is-pinned" : ""),
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
        h("div", { class: "list-bar-k" }, [h("span", null, LIST_BAR_CODE[k] || METRIC_META[k].short), h("b", null, fmtScore(model[k]))]),
        h("div", { class: "list-bar-track" }, h("i", { style: { width: (val * 10) + "%", "--bar-color": metricColor(k) } })),
      ]);
    }));
  }

  function headerCell(col) {
    const active = col.sort && state.ui.sortKey === col.sort;
    const ariaSort = active ? (state.ui.sortDir === "asc" ? "ascending" : "descending") : (col.sort ? "none" : null);
    const cls = (col.key === "rank" ? "rank-col" : col.key === "compare" ? "compare-col" : col.key === "model" ? "model-col" : "") + (col.sort ? " is-sortable" : "");
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
      // Index into the rendered colgroup, which only contains visible columns.
      const idx = tableColumns().findIndex((c) => c.key === col.key);
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
    if (col.key === "model") return h("td", { class: "model-col-cell" }, modelIdentity(model));
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

  function modelCard(model, index, pinned) {
    const inCompare = state.ui.compare.includes(model.id);
    return h("article", {
      class: "mobile-model-card" + (state.ui.inspect === model.id ? " is-inspect" : "") + (inCompare ? " is-compare" : "") + (pinned ? " is-pinned" : ""),
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
    // The frontier toggle can empty the scatter even with filtered models left
    // (all null on the current axes) — same empty state, reset clears the toggle.
    if (state.ui.chartMode === "scatter" && !chartModels().length) return emptyState("Nothing to chart", "Reset filters to bring model points back.", "Reset view", resetFilters);
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

    // Pareto frontier overlay (U3): non-dominated set on the CURRENT axes,
    // computed over the same set the scatter plots (so the frontier-only
    // toggle never draws a line through hidden points), sorted left-to-right.
    // Drawn before the circles below so it paints behind them.
    const frontierPts = paretoFrontier(chartModels(), xKey, yKey)
      .map((model) => ({ model, x: metricValue(model, xKey), y: metricValue(model, yKey) }))
      .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
      .sort((a, b) => a.x - b.x);
    const frontierLine = frontierPts.length > 1
      ? h("path", {
          d: frontierPts.map((p, i) => `${i ? "L" : "M"}${sx(p.x).toFixed(2)},${sy(p.y).toFixed(2)}`).join(" "),
          class: "chart-frontier-line",
          "aria-hidden": "true",
        })
      : null;

    // Cluster overlapping points (resolution 11: ~10 viewBox units, not
    // screen px) so hovering/focusing any one of them shows every model in
    // the cluster, not just the topmost circle.
    const plotted = chartModels().map((model) => ({ model, cx: sx(metricValue(model, xKey)), cy: sy(metricValue(model, yKey)) }));
    const clusters = [];
    plotted.forEach((p) => {
      const cluster = clusters.find((c) => c.some((q) => Math.hypot(q.cx - p.cx, q.cy - p.cy) <= CHART_CLUSTER_RADIUS));
      if (cluster) cluster.push(p);
      else clusters.push([p]);
    });
    const clusterByModel = new Map();
    clusters.forEach((cluster) => cluster.forEach((p) => clusterByModel.set(p.model.id, cluster)));
    const tipLine = (model) => `${model.name} · ${METRIC_META[xKey] ? METRIC_META[xKey].short : labelFor(xKey)} ${fmtScore(metricValue(model, xKey))} · ${METRIC_META[yKey] ? METRIC_META[yKey].short : labelFor(yKey)} ${fmtScore(metricValue(model, yKey))}`;
    const tipFor = (id) => (clusterByModel.get(id) || []).map((p) => tipLine(p.model));
    // Keyboard/SR parity with the stacked hover tooltip: a clustered point's
    // accessible name lists the models sharing its spot.
    const clusterSuffix = (id) => {
      const mates = (clusterByModel.get(id) || []).filter((p) => p.model.id !== id);
      return mates.length ? `. Overlaps ${mates.length === 1 ? "1 other model" : mates.length + " other models"}: ${mates.map((p) => p.model.name).join(", ")}` : "";
    };

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
      frontierLine,
      ...plotted.map(({ model, cx, cy }) => {
        const inCompare = state.ui.compare.includes(model.id);
        const inspect = state.ui.inspect === model.id;
        return h("circle", {
          cx, cy,
          r: inCompare || inspect ? "9" : "7",
          class: "model-point" + (inspect ? " is-inspect" : "") + (inCompare ? " is-compare" : ""),
          tabindex: "0",
          style: { "--model-color": safeColor(model.color) },
          "aria-label": `${model.name}: ${labelFor(xKey)} ${fmtScore(metricValue(model, xKey))}, ${labelFor(yKey)} ${fmtScore(metricValue(model, yKey))}${clusterSuffix(model.id)}`,
          onclick: () => setInspect(model.id),
          ondblclick: () => toggleCompare(model.id),
          onmouseenter: (e) => showChartTip(e, tipFor(model.id)),
          onmousemove: moveChartTip,
          onmouseleave: hideChartTip,
          onfocus: (e) => showChartTip(e, tipFor(model.id)),
          onblur: hideChartTip,
          onkeydown: (e) => pointKey(e, model.id),
        });
      }),
    ]);
    return h("div", { class: "svg-shell" }, [svg, h("div", { class: "chart-tip", id: "chart-tip", hidden: true }), renderLegend(chartModels(), { frontier: frontierPts.length > 1 })]);
  }

  // Direct-DOM tooltip so hovering/focusing a point doesn't trigger a full
  // re-render. `lines` is one string per clustered model (single-item array
  // for an isolated point). Positioned via vendored Floating UI (D2):
  // flip+shift against a virtual element at the cursor (mouse) or the
  // point's own rect (keyboard focus) so it never clips the shell/viewport.
  function showChartTip(e, lines) {
    const tip = document.getElementById("chart-tip");
    if (!tip) return;
    tip.replaceChildren(...(Array.isArray(lines) ? lines : [lines]).map((line) => h("div", { class: "chart-tip-line" }, line)));
    tip.hidden = false;
    positionChartTip(e);
  }
  function moveChartTip(e) {
    const tip = document.getElementById("chart-tip");
    if (!tip || tip.hidden) return;
    positionChartTip(e);
  }
  function hideChartTip() {
    const tip = document.getElementById("chart-tip");
    if (tip) tip.hidden = true;
  }
  function positionChartTip(e) {
    const tip = document.getElementById("chart-tip");
    if (!tip) return;
    // Mouse events carry a real point; focus events (keyboard) don't, so
    // anchor to the focused circle's own rect instead.
    const hasCursor = typeof e.clientX === "number";
    const rect = hasCursor
      ? { x: e.clientX, y: e.clientY, width: 0, height: 0 }
      : e.target.getBoundingClientRect();
    const virtualEl = {
      getBoundingClientRect: () => ({
        x: rect.x, y: rect.y, top: rect.y, left: rect.x,
        width: rect.width || 0, height: rect.height || 0,
        right: rect.x + (rect.width || 0), bottom: rect.y + (rect.height || 0),
      }),
    };
    if (typeof FloatingUIDOM === "undefined") {
      // Fallback if the vendor script failed to load: previous shell-relative math.
      const shell = tip.parentElement.getBoundingClientRect();
      tip.style.position = "absolute";
      tip.style.left = (rect.x - shell.left) + "px";
      tip.style.top = (rect.y - shell.top) + "px";
      return;
    }
    FloatingUIDOM.computePosition(virtualEl, tip, {
      placement: "top",
      strategy: "fixed",
      middleware: [FloatingUIDOM.offset(10), FloatingUIDOM.flip(), FloatingUIDOM.shift({ padding: 8 })],
    }).then(({ x, y }) => {
      if (tip.hidden) return;
      tip.style.position = "fixed";
      tip.style.left = x + "px";
      tip.style.top = y + "px";
    });
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
    els.rail.replaceChildren(h("div", { class: "detail-rail-inner vw-scroll-shadow" }, railContent(model)));
  }

  // Shared builder for the model scorecard, used by both the docked/in-flow
  // detail rail and the deep-link drawer (modal on narrow viewports) so the two
  // never drift.
  function railContent(model) {
    const card = modelCardUrl(model);
    const t = tier(overall(model));
    const permalink = () => location.origin + location.pathname + hashFor("models", state.subpage.models, model.id);
    const head = h("header", { class: "detail-rail-head", style: { "--model-color": safeColor(model.color) } }, [
      h("div", { class: "detail-rail-id" }, [
        providerLogo(model, 42),
        h("div", { class: "detail-rail-titles" }, [
          h("strong", { class: "detail-rail-name" }, model.name || "Unknown model"),
          h("span", { class: "detail-rail-vendor" }, model.vendor || "Unknown vendor"),
        ]),
        h("span", { class: "detail-rail-grade " + t.cls, title: "Overall " + fmtScore(overall(model)) }, t.label),
      ]),
      h("button", {
        class: "detail-rail-copy", type: "button",
        title: "Copy a link that opens this model",
        onclick: () => copyText(permalink()).then((ok) => toast(ok ? "Permalink copied" : "Copy failed", ok ? "success" : "error")),
      }, "Copy link"),
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
    return [
      head,
      h("div", { class: "detail-rail-body" }, [
        meta,
        note,
        link,
        h("div", { class: "detail-rail-bars" }, statBars(model)),
        railFooter(model),
      ]),
    ];
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
      // Pin compared (U5c): keep the selection hoisted to the top of the table
      // and list even when the frontier toggle or filters would exclude them.
      h("label", { class: "compare-tray-pin", title: "Keep these models at the top of the table and list" }, [
        h("input", { type: "checkbox", checked: Boolean(state.ui.pinCompared), onchange: (e) => { state.ui.pinCompared = e.target.checked; refreshModels(); render(); } }),
        h("span", null, "Pin compared"),
      ]),
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
        metricTrend(model, key, label),
      ]);
    }));
  }

  // Per-metric history extracted from state.scoreHistory (Map<model_id, rows>),
  // rows already ascending by as_of. Only the five directly-recorded score
  // columns have history; overall/value are derived, so they return [] and
  // silently render no sparkline.
  function metricSeries(model, key) {
    const hist = state.scoreHistory.get(model.id) || [];
    return hist.map((r) => Number(r[key])).filter(Number.isFinite);
  }

  // Sparkline (SVG polyline, scatter idiom — not the CSS bar track) + a delta
  // chip (latest vs previous). Renders only with >=2 history points; otherwise
  // returns null and the row degrades to the bar alone.
  function metricTrend(model, key, label) {
    const series = metricSeries(model, key);
    if (series.length < 2) return null;
    const last = series[series.length - 1];
    const prev = series[series.length - 2];
    const delta = last - prev;
    const dir = delta > 0.001 ? "up" : delta < -0.001 ? "down" : "flat";
    const glyph = dir === "up" ? "▲" : dir === "down" ? "▼" : "·";
    const word = dir === "up" ? "up" : dir === "down" ? "down" : "unchanged";
    return h("div", { class: "stat-bar-trend" }, [
      sparkline(series, metricColor(key)),
      h("span", {
        class: "stat-bar-delta is-" + dir,
        "aria-label": label + " " + word + (dir === "flat" ? "" : " " + fmtScore(Math.abs(delta))) + " since previous update",
      }, [
        h("em", { "aria-hidden": "true" }, glyph),
        dir === "flat" ? "0.0" : fmtScore(Math.abs(delta)),
      ]),
    ]);
  }

  function sparkline(series, colorVar) {
    const w = 96, hh = 22, pad = 3;
    const min = Math.min(...series), max = Math.max(...series);
    const span = max - min || 1;
    const n = series.length;
    const pts = series.map((val, i) => {
      const x = n === 1 ? w / 2 : pad + (i / (n - 1)) * (w - pad * 2);
      const y = hh - pad - ((val - min) / span) * (hh - pad * 2);
      return [x, y];
    });
    const tip = pts[pts.length - 1];
    return h("svg", { class: "stat-spark", viewBox: "0 0 " + w + " " + hh, preserveAspectRatio: "none", "aria-hidden": "true" }, [
      h("polyline", { points: pts.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" "), fill: "none", stroke: colorVar, "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round" }),
      h("circle", { cx: tip[0].toFixed(1), cy: tip[1].toFixed(1), r: "2", fill: colorVar }),
    ]);
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

  function renderLegend(list, opts) {
    const source = list && list.length ? list : state.filteredModels;
    const vendors = new Map();
    source.forEach((m) => { if (!vendors.has(m.vendor || "Other")) vendors.set(m.vendor || "Other", safeColor(m.color)); });
    const chips = [...vendors.entries()].map(([name, color]) => {
      const active = state.ui.vendors.includes(name);
      return h("button", {
        type: "button",
        class: "legend-chip" + (active ? " is-active" : ""),
        style: { "--model-color": color },
        "aria-pressed": String(active),
        title: active ? "Showing only " + name + " — click to clear" : "Filter to " + name,
        onclick: () => toggleVendor(name),
      }, name);
    });
    // Non-interactive frontier key (U3): only the scatter view passes this —
    // it isn't a vendor filter, so it renders as a span, not a button.
    if (opts && opts.frontier) {
      chips.push(h("span", { class: "legend-chip legend-frontier" }, [
        h("span", { class: "legend-frontier-swatch", "aria-hidden": "true" }),
        "Pareto frontier",
      ]));
    }
    return h("div", { class: "chart-legend", role: "group", "aria-label": "Filter by provider" }, chips);
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
        changelogCountRow(item),
      ]))),
      h("article", { class: "changelog-panel" }, [
        h("header", { class: "changelog-panel-head" }, [
          h("p", { class: "changelog-panel-date" }, fmtDate(active.date)),
          h("h2", null, active.title || "Daily update"),
          active.summary ? h("p", { class: "changelog-panel-summary" }, active.summary) : null,
          changelogChips(active),
        ]),
        changelogRunDetails(active.date),
        h("div", { class: "changelog-body vw-scroll-shadow" }, renderMarkdown(state.changelogBodies[active.date], active.title, active.summary)),
      ]),
    ]);
  }

  function safeJsonArray(value) {
    if (Array.isArray(value)) return value;
    if (typeof value !== "string" || !value.trim()) return [];
    try { const v = JSON.parse(value); return Array.isArray(v) ? v : []; } catch (_) { return []; }
  }

  function changelogEntryName(entry) {
    if (typeof entry === "string") return entry;
    if (entry && typeof entry === "object") return String(entry.name || entry.model || entry.id || entry.title || "").trim();
    return "";
  }

  // Small "N new · N updated" line under each list item.
  function changelogCountRow(item) {
    const added = safeJsonArray(item.new_models_json).length;
    const changed = safeJsonArray(item.changed_json).length;
    if (!added && !changed) return null;
    const chips = [];
    if (added) chips.push(h("span", { class: "changelog-count is-added" }, `${added} new`));
    if (changed) chips.push(h("span", { class: "changelog-count is-changed" }, `${changed} updated`));
    return h("span", { class: "changelog-count-row" }, chips);
  }

  // Named chips for new/updated models in the detail header.
  function changelogChips(item) {
    const added = safeJsonArray(item.new_models_json).map(changelogEntryName).filter(Boolean);
    const changed = safeJsonArray(item.changed_json).map(changelogEntryName).filter(Boolean);
    if (!added.length && !changed.length) return null;
    const groups = [];
    if (added.length) groups.push(h("div", { class: "changelog-chip-group" }, [
      h("span", { class: "changelog-chip-label is-added" }, "New"),
      ...added.slice(0, 12).map((n) => h("span", { class: "changelog-chip" }, n)),
      added.length > 12 ? h("span", { class: "changelog-chip is-more" }, `+${added.length - 12} more`) : null,
    ]));
    if (changed.length) groups.push(h("div", { class: "changelog-chip-group" }, [
      h("span", { class: "changelog-chip-label is-changed" }, "Updated"),
      ...changed.slice(0, 12).map((n) => h("span", { class: "changelog-chip" }, n)),
      changed.length > 12 ? h("span", { class: "changelog-chip is-more" }, `+${changed.length - 12} more`) : null,
    ]));
    return h("div", { class: "changelog-chips" }, groups);
  }

  // Humanized "Run details" pulled from the structured run_metrics row so the
  // panel doesn't fall back to a raw metric/value dump.
  function changelogRunDetails(date) {
    const m = state.metrics.find((x) => x.changelog_date === date);
    if (!m) return null;
    const items = [];
    if (m.agent_name) items.push(["Agent", m.agent_name]);
    if (m.agent_runtime) items.push(["Runtime", m.agent_runtime]);
    if (Number(m.duration_sec) > 0) items.push(["Duration", fmtElapsed(Number(m.duration_sec))]);
    const tin = Number(m.tokens_input) || 0;
    const tout = Number(m.tokens_output) || 0;
    const tc = Number(m.tokens_cached) || 0;
    if (tin || tout || tc) items.push(["Tokens", `${compact.format(tin)} in · ${compact.format(tout)} out${tc ? ` · ${compact.format(tc)} cached` : ""}`]);
    if (m.cost_usd !== null && m.cost_usd !== undefined && m.cost_usd !== "") items.push(["Cost", money.format(Number(m.cost_usd) || 0)]);
    if (Number(m.word_count) > 0) items.push(["Words", int.format(Number(m.word_count))]);
    if (!items.length) return null;
    return h("div", { class: "changelog-meta" }, [
      h("h3", { class: "changelog-meta-title" }, "Run details"),
      h("dl", { class: "changelog-meta-grid" }, items.map(([k, v]) => h("div", { class: "changelog-meta-item" }, [
        h("dt", null, k),
        h("dd", null, v),
      ]))),
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
      statsAnalytics(filtered, single),
    ]);
  }

  // Per-panel spec for the Stats trend charts. Colors reuse METRIC_META hues so a
  // metric reads the same everywhere; cost=cost, duration=speed, tokens=overall.
  const STATS_TRENDS = [
    { title: "Run duration", color: metricColor("speed"), val: (r) => Number(r.duration_sec) || 0, fmt: (v) => fmtElapsed(v) },
    { title: "Cost per run", color: metricColor("cost"), val: (r) => Number(r.cost_usd) || 0, fmt: (v) => money.format(v) },
    { title: "Total tokens", color: metricColor("overall"), val: (r) => (Number(r.tokens_input) || 0) + (Number(r.tokens_output) || 0) + (Number(r.tokens_cached) || 0), fmt: (v) => compact.format(v) },
  ];

  function statsPanel(title, body) {
    return h("section", { class: "panel-card" }, [h("h3", null, title), body]);
  }

  // Builds the 3 trend panels + leaderboard. Below 2 runs the charts can't show a
  // trend, so the panels degrade to the standard chart-empty-note (U7) while the
  // leaderboard still renders its honest 1-row board.
  function statsAnalytics(rows, single) {
    const specs = [];
    const chron = rows.slice().reverse(); // state.metrics is newest-first; charts read oldest→newest
    const panels = STATS_TRENDS.map((t) => {
      if (single) {
        return statsPanel(t.title, h("div", { class: "chart-empty-note" }, [
          h("strong", null, "Trends unlock at 2+ runs"),
          h("p", null, "Run Refresh again to chart this over time."),
        ]));
      }
      const ys = chron.map(t.val);
      const peak = ys.reduce((a, b) => Math.max(a, b), 0);
      const latest = ys.length ? ys[ys.length - 1] : 0;
      const el = h("div", {
        class: "trend-chart",
        role: "img",
        "aria-label": `${t.title} trend across ${ys.length} runs — latest ${t.fmt(latest)}, peak ${t.fmt(peak)}.`,
      });
      specs.push({ el, chron, trend: t, ys });
      return statsPanel(t.title, el);
    });
    panels.push(statsPanel("Agent leaderboard", leaderboard(rows)));
    if (specs.length) scheduleStatsCharts(specs);
    return h("div", { class: "analytics-grid" }, panels);
  }

  // uPlot lifecycle. Instances live outside the render tree (canvas is stateful),
  // so they are tracked in a module registry, destroyed before every re-render
  // (render() -> destroyStatsCharts), and re-created post-mount via rAF. The
  // generation guard drops stale rAFs when filters fire renders back-to-back so
  // toggling the Agent/Range filters N times leaks no canvases or observers.
  let statsGen = 0;
  const statsCharts = [];

  function destroyStatsCharts() {
    while (statsCharts.length) {
      const c = statsCharts.pop();
      if (c.ro) { try { c.ro.disconnect(); } catch (_) {} }
      if (c.u) { try { c.u.destroy(); } catch (_) {} }
    }
  }

  function scheduleStatsCharts(specs) {
    const gen = ++statsGen;
    requestAnimationFrame(() => {
      if (gen !== statsGen || typeof uPlot === "undefined") return;
      specs.forEach((spec) => {
        if (!spec.el.isConnected) return;
        const built = buildTrendChart(spec);
        if (built) statsCharts.push(built);
      });
    });
  }

  function buildTrendChart(spec) {
    const el = spec.el;
    const root = getComputedStyle(document.documentElement);
    const cvar = (ref) => {
      const m = /var\((--[^)]+)\)/.exec(ref);
      return root.getPropertyValue(m ? m[1] : ref).trim();
    };
    const border = cvar("--vw-border") || "rgba(255,255,255,0.08)";
    const faint = cvar("--vw-text-faint") || "#72726b";
    const stroke = cvar(spec.trend.color) || "#f1d47b";
    const font = "11px " + (cvar("--vw-font-mono") || "ui-monospace, monospace");
    // x = run date (changelog_date). If any date fails to parse, fall back to a
    // plain run-index axis so the chart still draws rather than blowing up.
    const ts = spec.chron.map((r) => Date.parse(r.changelog_date) / 1000);
    const useTime = ts.every((n) => Number.isFinite(n));
    const xs = useTime ? ts : spec.chron.map((_, i) => i + 1);
    const dfmt = (u, splits) => splits.map((s) => {
      const d = new Date(s * 1000);
      return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
    });
    const width = Math.max(el.clientWidth || 320, 160);
    const opts = {
      width, height: 156,
      padding: [10, 8, 0, 4],
      cursor: { show: true, points: { size: 6 } },
      legend: { show: false },
      scales: { x: { time: useTime } },
      axes: [
        { stroke: faint, font, size: 30, grid: { show: false }, ticks: { stroke: border, size: 4 }, values: useTime ? dfmt : null },
        { stroke: faint, font, size: 46, grid: { stroke: border, width: 1 }, ticks: { show: false }, values: (u, vals) => vals.map(spec.trend.fmt) },
      ],
      series: [
        { value: useTime ? "{M}/{D}" : (u, v) => (v == null ? "" : `run ${v}`) },
        { label: spec.trend.title, stroke, width: 2, points: { show: true, size: 5, stroke, fill: stroke } },
      ],
    };
    let u;
    try { u = new uPlot(opts, [xs, spec.ys], el); } catch (_) { return null; }
    const ro = new ResizeObserver(() => {
      u.setSize({ width: Math.max(el.clientWidth || width, 160), height: 156 });
    });
    ro.observe(el);
    return { u, ro };
  }

  // The Settings tab is always a plain tabbed page now — every sub-page is
  // freely reachable. First-run onboarding lives in the dedicated wizard
  // (renderWizard), not in this surface.
  function renderSettings() {
    return h("section", { class: "settings-workbench" }, [
      h("div", { class: "settings-detail" }, renderSettingsSubpage()),
    ]);
  }

  // Wizard steps. The first three reuse Settings field groups; the last three
  // are onboarding-only (seed the catalog, then finish).
  const SETUP_STEPS = [
    ["provider", "Connection"],
    ["models", "Model"],
    ["research", "Research"],
    ["catalog", "Catalog"],
    ["seed", "Seed"],
    ["finish", "Done"],
  ];

  function wizardStepIndex(step) {
    const i = SETUP_STEPS.findIndex(([key]) => key === step);
    return i < 0 ? 0 : i;
  }

  function wizardStep() {
    const step = state.subpage.settings;
    return SETUP_STEPS.some(([key]) => key === step) ? step : "provider";
  }

  // Full-screen first-launch wizard. Rendered into the overlay layer so it
  // takes over the whole shell instead of masquerading as the Settings tab.
  function renderWizard() {
    const step = wizardStep();
    return h("div", { class: "wizard-shell", role: "dialog", "aria-modal": "true", "aria-label": "Set up LLM-Dash" }, [
      h("div", { class: "wizard-card" }, [
        h("button", { class: "wizard-cancel", type: "button", onclick: cancelSetup }, "Cancel"),
        h("header", { class: "wizard-head" }, [
          h("p", { class: "wizard-brand" }, [
            h("span", { class: "brand-banner" }, [
              h("img", { src: "/assets/brand/app-banner.png", alt: "LLM-Dash", decoding: "async" }),
            ]),
          ]),
          renderWizardProgress(step),
        ]),
        h("div", { class: "wizard-body" }, wizardStepBody(step)),
      ]),
    ]);
  }

  function renderWizardProgress(step) {
    const activeIndex = wizardStepIndex(step);
    const nodes = [];
    SETUP_STEPS.forEach(([key, label], index) => {
      const stateClass = index === activeIndex ? " active" : index < activeIndex ? " completed" : "";
      // Earlier steps stay clickable so the user can jump back to fix something.
      const reachable = index < activeIndex;
      nodes.push(h("div", { class: "vw-wizard-step" + stateClass }, [
        h(reachable ? "button" : "span", {
          class: "vw-wizard-dot",
          type: reachable ? "button" : undefined,
          "aria-current": index === activeIndex ? "step" : undefined,
          onclick: reachable ? () => navigate("settings", key) : undefined,
        }, index < activeIndex ? "✓" : String(index + 1)),
        h("span", { class: "vw-wizard-label" }, label),
      ]));
      if (index < SETUP_STEPS.length - 1) {
        nodes.push(h("span", { class: "vw-wizard-line" + (index < activeIndex ? " completed" : "") }));
      }
    });
    return h("div", { class: "vw-wizard-progress", "aria-label": "Setup progress" }, nodes);
  }

  function wizardHeading(title, copy) {
    return h("div", { class: "wizard-step-head" }, [
      h("div", { class: "wizard-title-row" }, [
        h("h1", { class: "wizard-step-title" }, title),
        copy ? infoTip(copy, title + " details") : null,
      ]),
    ]);
  }

  function infoTip(copy, label) {
    return h("span", {
      class: "info-tip",
      tabindex: "0",
      role: "img",
      "aria-label": label || copy,
      title: copy,
    }, "i");
  }

  function wizardFoot(children) {
    return h("div", { class: "wizard-foot" }, children.filter(Boolean));
  }

  function wizardStepBody(step) {
    if (step === "models") return wizardModelsStep();
    if (step === "research") return wizardResearchStep();
    if (step === "catalog") return wizardCatalogStep();
    if (step === "seed") return wizardSeedStep();
    if (step === "finish") return wizardFinishStep();
    return wizardProviderStep();
  }

  function wizardProviderStep() {
    const canContinue = Boolean(state.provider.has_provider) && Boolean(state.forms.provider.base_url.trim());
    return [
      wizardHeading("Connect a provider", "Point LLM-Dash at any OpenAI-compatible provider and add an API key. Everything is stored securely on this machine."),
      h("div", { class: "wizard-fields" }, [...providerConnectionFields(), testResultNote("provider")]),
      wizardFoot([
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: openManualPrompt }, "Manual prompt"),
        h("span", { class: "wizard-foot-spacer" }),
        busyButton({ key: "provider", label: "Test connection", busyLabel: "Testing…", variant: "vw-btn-secondary", onclick: () => testConnection() }),
        h("button", {
          class: "vw-btn vw-btn-primary",
          type: "button",
          disabled: !canContinue,
          title: canContinue ? "" : "Add an API key and base URL to continue",
          onclick: wizardSaveProviderAndNext,
        }, "Save & continue"),
      ]),
    ];
  }

  async function wizardSaveProviderAndNext() {
    if (!String(state.forms.provider.base_url || "").trim()) {
      toast("Add a base URL first.", "warning");
      return;
    }
    await saveProviderSettings();
    if (!state.provider.has_provider) {
      toast("Add an API key for this provider to continue.", "warning");
      return;
    }
    navigate("settings", "models");
  }

  function wizardModelsStep() {
    return [
      wizardHeading("Choose the agent model", "This is the model the research agent uses to seed your catalog and write update changelogs."),
      h("div", { class: "wizard-fields" }, settingsModelFields()),
      wizardFoot([
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => navigate("settings", "provider") }, "Back"),
        h("span", { class: "wizard-foot-spacer" }),
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: wizardSaveModelsAndNext }, "Save & continue"),
      ]),
    ];
  }

  async function wizardSaveModelsAndNext() {
    if (!String(state.forms.models.default_model || "").trim()) {
      toast("Pick a default model first.", "warning");
      return;
    }
    await saveProviderSettings();
    navigate("settings", "research");
  }

  function wizardResearchStep() {
    return [
      wizardHeading("Add research sources", "Optional. These keys let the agent discover and score models automatically. You can skip and add them later in Settings."),
      h("div", { class: "wizard-fields research-fields" }, [wizardResearchSources()]),
      wizardFoot([
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => navigate("settings", "models") }, "Back"),
        h("span", { class: "wizard-foot-spacer" }),
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => navigate("settings", "catalog") }, "Continue"),
      ]),
    ];
  }

  function wizardCatalogStep() {
    return [
      wizardHeading("Seed your catalog", "Pick a source and seed your first set of models. The research agent fetches and scores them."),
      h("div", { class: "wizard-fields" }, [wizardCatalogSources()]),
      wizardFoot([
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => navigate("settings", "research") }, "Back"),
      ]),
    ];
  }

  function wizardSeedStep() {
    if (!state.seed.id) {
      return [
        wizardHeading("Ready to seed", "Choose a catalog source first, then LLM-Dash will track the seed run here."),
        wizardFoot([
          h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => navigate("settings", "catalog") }, "Back to Catalog"),
        ]),
      ];
    }
    // settingsSeed already renders complete/failed/running states with their
    // own actions (including "Let's start" → finishSetup).
    return [settingsSeed()];
  }

  function wizardFinishStep() {
    const seeded = catalogReady();
    return [
      wizardHeading(seeded ? "You're all set" : "Almost there", seeded
        ? "Your connection, agent model, and catalog are saved. Open the dashboard whenever you're ready."
        : "Your catalog is still empty. Seed it before opening the dashboard."),
      wizardFoot([
        seeded ? null : h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => navigate("settings", "catalog") }, "Back to Catalog"),
        h("span", { class: "wizard-foot-spacer" }),
        h("button", { class: "vw-btn vw-btn-primary", type: "button", disabled: !seeded, onclick: finishSetup }, "Open dashboard"),
      ]),
    ];
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

  function cancelSetup() {
    state.setupMode = false;
    state.setupStep = "provider";
    navigate("models", "list");
  }

  function renderSettingsSubpage() {
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

  function catalogSources(c, mode) {
    const isRefresh = mode === "refresh";
    const runAction = (payload) => isRefresh ? startRefreshRun(payload) : startSeed(payload);
    return [
      {
        id: "aa",
        title: "Artificial Analysis",
        sub: "AA Data API",
        description: "Top models from the AA Data API, ranked by your chosen index.",
        enabled: Boolean(state.provider.aa_configured),
        gateHint: "Add an Artificial Analysis key in the Research step to enable.",
        inputs: [catalogCountSelect(c, "aaCount", [10, 50, 100]), catalogIndexRadios(c)],
        onAction: () => runAction({ preset: "aa", count: c.aaCount, index: c.aaIndex }),
      },
      {
        id: "llmstats",
        title: "LLM Stats",
        sub: "LLM Stats API",
        description: "Top models from the LLM Stats catalog API.",
        enabled: Boolean(state.provider.llmstats_configured),
        gateHint: "Add an LLM Stats key in the Research step to enable.",
        inputs: [catalogCountSelect(c, "llmstatsCount", [10, 25, 50])],
        onAction: () => runAction({ preset: "llmstats", count: c.llmstatsCount }),
      },
      {
        id: "exa",
        title: "Exa search",
        sub: "Web research",
        description: "Discover models via Exa MCP web research (free tier works).",
        enabled: true,
        inputs: [catalogCountSelect(c, "exaCount", [10, 25, 50])],
        onAction: () => runAction({ preset: "exa", count: c.exaCount }),
      },
      {
        id: "openrouter",
        title: "OpenRouter",
        sub: "Public catalog",
        description: "Models from the public OpenRouter catalog (largest-context first).",
        enabled: true,
        inputs: [catalogCountSelect(c, "openrouterCount", [10, 25, 50])],
        onAction: () => runAction({ preset: "openrouter", count: c.openrouterCount }),
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
        onAction: () => runAction({ preset: "custom-prompt", count: c.customCount, prompt: c.customPrompt.trim() }),
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
        onAction: () => {
          const payload = { preset: "custom-endpoint", count: c.customCount, endpoint: c.customEndpoint.trim() };
          if (c.customCredential.trim()) payload.credential = c.customCredential.trim();
          runAction(payload);
        },
      },
    ];
  }

  function renderCatalogWorkbench() {
    const c = state.catalog;
    const sources = catalogSources(c, "seed");
    if (!sources.some((s) => s.id === c.selected)) c.selected = sources[0].id;
    const active = sources.find((s) => s.id === c.selected) || sources[0];
    return h("div", { class: "catalog-workbench" }, [
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
            onclick: active.onAction,
          }, "Seed catalog"),
        ]),
      ]),
    ]);
  }

  function wizardCatalogSources() {
    const c = state.catalog;
    const sources = catalogSources(c, "seed");
    if (!sources.some((s) => s.id === c.selected)) c.selected = sources[0].id;
    const active = sources.find((s) => s.id === c.selected) || sources[0];
    return h("section", { class: "wizard-catalog-panel", "aria-label": "Catalog source setup" }, [
      h("div", { class: "wizard-catalog-tabs", role: "tablist", "aria-label": "Catalog sources" }, sources.map((source) => {
        const selected = source.id === active.id;
        const tabId = "wizard-catalog-tab-" + source.id;
        const panelId = "wizard-catalog-panel-" + source.id;
        return h("button", {
          class: "wizard-catalog-tab" + (selected ? " is-active" : "") + (source.enabled ? "" : " is-locked"),
          type: "button",
          role: "tab",
          id: tabId,
          title: (source.enabled ? source.sub : "Locked") + ". " + (source.enabled ? source.description : source.gateHint || source.description),
          "aria-controls": panelId,
          "aria-selected": selected ? "true" : "false",
          onclick: () => { c.selected = source.id; render(); },
        }, [
          h("span", { class: "wizard-catalog-tab-name" }, source.title),
        ]);
      })),
      h("div", {
        class: "wizard-catalog-detail",
        role: "tabpanel",
        id: "wizard-catalog-panel-" + active.id,
        "aria-labelledby": "wizard-catalog-tab-" + active.id,
      }, [
        h("div", { class: "catalog-detail-head" }, [
          h("h3", { class: "catalog-detail-title" }, active.title),
          infoTip(active.description, active.title + " details"),
        ]),
        h("div", { class: "catalog-detail-fields" }, active.inputs),
        !active.enabled && active.gateHint ? h("p", { class: "catalog-card-hint" }, active.gateHint) : null,
        h("div", { class: "catalog-detail-cta" }, [
          h("button", {
            class: "vw-btn vw-btn-primary",
            type: "button",
            disabled: !active.enabled,
            onclick: active.onAction,
          }, "Seed catalog"),
        ]),
      ]),
    ]);
  }

  function settingsCatalog() {
    return h("section", { class: "settings-panel panel-card catalog-panel", "aria-label": "Catalog" }, [
      h("h2", { class: "settings-panel-title" }, "Catalog"),
      h("p", { class: "settings-summary" }, "Pick a source, tune its options, then seed. Each source runs the research agent against a different place."),
      renderCatalogWorkbench(),
    ]);
  }

  function renderRefreshOptions() {
    const c = state.catalog;
    const sources = catalogSources(c, "refresh");
    if (!sources.some((s) => s.id === c.selected)) c.selected = sources[0].id;
    const active = sources.find((s) => s.id === c.selected) || sources[0];
    return h("div", { class: "refresh-options" }, [
      h("p", { class: "settings-summary" }, "Choose the discovery source for this refresh. The agent keeps existing history append-only and uses the source as fresh context for new models, score changes, and status updates."),
      h("div", { class: "catalog-workbench refresh-workbench" }, [
        h("div", { class: "catalog-sources", role: "tablist", "aria-label": "Refresh sources" }, sources.map((s) => h("button", {
          class: "catalog-source" + (s.id === active.id ? " is-active" : "") + (s.enabled ? "" : " is-locked"),
          type: "button",
          role: "tab",
          "aria-selected": s.id === active.id ? "true" : "false",
          disabled: !s.enabled,
          title: s.enabled ? s.description : s.gateHint,
          onclick: () => { c.selected = s.id; render(); },
        }, [
          h("strong", null, s.title),
          h("span", null, s.sub),
        ]))),
        h("section", { class: "catalog-detail", "aria-label": active.title }, [
          h("div", { class: "catalog-detail-head" }, [
            h("h3", { class: "catalog-detail-title" }, active.title),
            infoTip(active.description, active.title + " details"),
          ]),
          h("p", { class: "catalog-card-description" }, active.description),
          h("div", { class: "catalog-detail-fields" }, active.inputs),
          !active.enabled && active.gateHint ? h("p", { class: "catalog-card-hint" }, active.gateHint) : null,
        ]),
      ]),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => { state.refreshOptionsOpen = false; render(); } }, "Cancel"),
        h("button", {
          class: "vw-btn vw-btn-primary",
          type: "button",
          disabled: !active.enabled,
          onclick: active.onAction,
        }, "Start refresh"),
      ]),
    ]);
  }

  function clipText(value, max) {
    const text = String(value || "");
    return text.length > max ? text.slice(0, max - 1) + "…" : text;
  }

  function parseJsonTail(text) {
    try { return JSON.parse(text); } catch (_error) { return null; }
  }

  // Friendly phase label for the in-progress job console, shared by seed (batch
  // math) and refresh (phase + live tool activity from the streamed agent).
  function jobPhaseLabel(tail, kind) {
    const text = String(tail || "");
    if (kind === "refresh") {
      if (/\brun_complete\b/.test(text)) return "Update complete";
      if (text.includes("refresh_apply")) return "Writing updates to the catalog…";
      if (text.includes("refresh_diff")) return "Reviewing the diff…";
      const toolMatches = [...text.matchAll(/agent_tool_call\s+(\{.*\})/g)];
      if (toolMatches.length) {
        const last = parseJsonTail(toolMatches[toolMatches.length - 1][1]) || {};
        const arg = last.arg ? ` ${clipText(last.arg, 48)}` : "";
        if (last.kind === "search") return `Searching the web…${arg}`;
        if (last.kind === "fetch") return `Reading sources…${arg}`;
        return "Researching models…";
      }
      if (text.includes("agent_start") || text.includes("agent_run")) return "Research agent is working…";
      if (text.includes("refresh_source_candidates")) return "Reviewing candidate models…";
      if (text.includes("refresh_source")) return "Gathering the refresh source…";
      return "Starting the refresh run…";
    }
    const candidateMatches = [...text.matchAll(/seed_scoring_candidate\s+(\d+)\/(\d+)/g)];
    if (candidateMatches.length) {
      const last = candidateMatches[candidateMatches.length - 1];
      return `Scoring candidates (${last[1]} of ${last[2]} submitted)…`;
    }
    const batchMatch = text.match(/seed_batch\s+(\d+)\/(\d+)/);
    if (batchMatch) return `Scoring models (batch ${batchMatch[1]} of ${batchMatch[2]})…`;
    if (text.includes("seed_complete")) return "Finishing up…";
    return "Preparing the seed run…";
  }

  // Turns the raw seed log tail into a progress bar value. Indeterminate until
  // the first batch line lands so the bar still animates during warm-up.
  function jobProgress(tail, kind) {
    const text = String(tail || "");
    if (kind === "refresh") {
      const label = jobPhaseLabel(text, kind);
      // The final write stages are discrete and quick, so show a determinate
      // fill there. Everything before is a single open-ended research turn with
      // no measurable progress — loop the bar instead of faking a percentage off
      // the tool-call count (which only ever looked proportional by accident).
      if (/\brun_complete\b/.test(text)) return { pct: 100, indeterminate: false, label };
      if (text.includes("refresh_apply")) return { pct: 96, indeterminate: false, label };
      if (text.includes("refresh_diff")) return { pct: 88, indeterminate: false, label };
      return { pct: 0, indeterminate: true, label };
    }
    if (text.includes("seed_complete")) return { pct: 100, indeterminate: false, label: "Finishing up…" };
    const batchMatch = text.match(/seed_batch\s+(\d+)\/(\d+)/);
    if (batchMatch) {
      const done = Number(batchMatch[1]);
      const total = Math.max(1, Number(batchMatch[2]));
      // Cap at 92% mid-run so the bar never reads "done" before completion.
      const pct = Math.min(92, Math.round((done / total) * 92));
      return { pct, indeterminate: false, label: jobPhaseLabel(tail, kind) };
    }
    return { pct: 0, indeterminate: true, label: jobPhaseLabel(tail, kind) };
  }

  // Human label for a refresh/seed source key (the run pill showed the raw
  // preset id like "aa", which reads as a cryptic chip).
  const SOURCE_LABELS = {
    aa: "Artificial Analysis",
    llmstats: "LLM Stats",
    exa: "Exa search",
    openrouter: "OpenRouter",
    "custom-prompt": "Custom prompt",
    "custom-endpoint": "Custom endpoint",
  };
  function sourceLabel(source) {
    return SOURCE_LABELS[source] || source;
  }

  function fmtElapsed(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const m = Math.floor(s / 60);
    return m > 0 ? `${m}m ${String(s % 60).padStart(2, "0")}s` : `${s}s`;
  }

  function jobTailPreview(tail, maxLines) {
    const lines = String(tail || "").trim().split("\n").filter(Boolean);
    return lines.slice(-(maxLines || 8)).join("\n");
  }

  function parseJobLogLine(raw) {
    const line = String(raw || "").trim();
    const match = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)\s+(.+)$/);
    return {
      time: match ? match[1].slice(11, 19) : "",
      body: match ? match[2] : line,
      raw: line,
    };
  }

  function jobLogValue(value) {
    const text = String(value || "").trim();
    if (!text) return "";
    try {
      const parsed = JSON.parse(text);
      return typeof parsed === "string" ? parsed : text;
    } catch (_error) {
      return text.replace(/^"|"$/g, "");
    }
  }

  // Shared parser: turns the raw job log tail (seed OR refresh) into friendly
  // timeline rows. Seed and refresh logs never share a file, so one parser that
  // covers both marker families is safe.
  function jobLogSummaryRows(tail, maxRows) {
    const rows = [];
    String(tail || "").split("\n").forEach((rawLine) => {
      const parsed = parseJobLogLine(rawLine);
      const body = parsed.body;
      if (!body) return;
      let text = "";
      let tone = "";
      let detail = "";
      let match = null;

      if (body === "seed_start") {
        text = "Seed run started";
      } else if (body === "run_start") {
        text = "Refresh run started";
      } else if (/_migration_applied$/.test(body)) {
        text = "Applied a schema migration";
      } else if ((match = body.match(/^refresh_state_loaded\s+models=(\d+)/))) {
        text = "Loaded current catalog";
        detail = `${match[1]} model${match[1] === "1" ? "" : "s"}`;
      } else if ((match = body.match(/^refresh_source\s+preset=([^\s]+)\s+count=(\d+)/))) {
        text = `Refresh source: ${match[1]}`;
        detail = `up to ${match[2]} models`;
      } else if ((match = body.match(/^refresh_source_candidates\s+resolved=(\d+)/))) {
        text = `Resolved ${match[1]} candidate model${match[1] === "1" ? "" : "s"}`;
      } else if ((match = body.match(/^refresh_source_error\s+preset=([^\s]+)/))) {
        text = `Source ${match[1]} unavailable`;
        detail = "continuing with web research";
        tone = "warn";
      } else if (body.startsWith("agent_start")) {
        // agent_run is the shared machine marker logged right after agent_start;
        // surface only one "started" row (seed shows its batch row instead).
        const payload = parseJsonTail(body.replace(/^agent_start\s*/, "")) || {};
        text = "Research agent started";
        if (payload.model) detail = String(payload.model);
      } else if (body.startsWith("agent_tool_call ")) {
        const payload = parseJsonTail(body.slice("agent_tool_call ".length)) || {};
        if (payload.kind === "search") text = "Searching the web";
        else if (payload.kind === "fetch") text = "Reading a source";
        else text = `Calling ${payload.name || "a tool"}`;
        detail = payload.arg ? clipText(payload.arg, 60) : (payload.name || "");
      } else if (body.startsWith("agent_tool_summary ")) {
        const payload = parseJsonTail(body.slice("agent_tool_summary ".length)) || {};
        const calls = Number(payload.calls || 0);
        if (calls) {
          text = `Researched ${calls} source${calls === 1 ? "" : "s"}`;
          detail = `${payload.searches || 0} searches, ${payload.fetches || 0} fetches`;
          tone = "ok";
        }
      } else if ((match = body.match(/^agent_error\s+model=([^\s]+)/))) {
        text = `Agent attempt failed on ${match[1]}`;
        detail = "trying fallback";
        tone = "warn";
      } else if (body.startsWith("exa_mcp_")) {
        text = "Web research hit a limit";
        detail = "retrying";
        tone = "warn";
      } else if (body.startsWith("llmstats_enrichment_ok")) {
        text = "Loaded LLM Stats context";
        tone = "ok";
      } else if ((match = body.match(/^refresh_diff\s+(\{.*\})/))) {
        const payload = parseJsonTail(match[1]) || {};
        text = "Diff ready";
        detail = `${payload.new_models || 0} new, ${payload.score_updates || 0} score, ${payload.status_changes || 0} status`;
      } else if ((match = body.match(/^refresh_apply\s+(\{.*\})/))) {
        const payload = parseJsonTail(match[1]) || {};
        text = "Writing updates to the catalog";
        detail = `${payload.new_models || 0} new, ${payload.score_updates || 0} score, ${payload.status_changes || 0} status`;
      } else if (body.startsWith("run_complete")) {
        text = body.includes("dry_run=true") ? "Dry run complete" : "Update complete";
        tone = "ok";
      } else if (body.startsWith("run_error")) {
        text = "Update error";
        detail = body.replace(/^run_error\s*/, "");
        tone = "fail";
      } else if ((match = body.match(/^seed_prepare\s+.*preset=([^\s]+).*count=(\d+)/))) {
        text = `Preparing ${match[1]} seed`;
        detail = `${match[2]} target models`;
      } else if ((match = body.match(/^seed_candidates\s+resolved=(\d+)/))) {
        text = `Resolved ${match[1]} candidate model${match[1] === "1" ? "" : "s"}`;
      } else if ((match = body.match(/^seed_plan\s+batches=(\d+)/))) {
        text = `Planned ${match[1]} scoring batch${match[1] === "1" ? "" : "es"}`;
      } else if ((match = body.match(/^seed_batch\s+(\d+)\/(\d+)\s+scoring\s+(\d+)\s+models/))) {
        text = `Scoring ${match[3]} models`;
        detail = `batch ${match[1]} of ${match[2]}`;
      } else if ((match = body.match(/^seed_scoring_candidate\s+(\d+)\/(\d+)\s+name=(.+)$/))) {
        text = `Scoring candidate ${match[1]} of ${match[2]}`;
        detail = jobLogValue(match[3]);
      } else if ((match = body.match(/^seed_batch_complete\s+(\d+)\/(\d+)\s+models=(\d+)\s+total_models=(\d+)/))) {
        text = `Batch ${match[1]} complete`;
        detail = `${match[3]} scored, ${match[4]} total`;
        tone = "ok";
      } else if ((match = body.match(/^seed_agent_error\s+model=([^\s]+)/))) {
        text = `Agent attempt failed on ${match[1]}`;
        detail = "trying fallback";
        tone = "warn";
      } else if ((match = body.match(/^seed_apply\s+models=(\d+)/))) {
        text = `Writing ${match[1]} models to the catalog`;
      } else if (body.startsWith("seed_complete")) {
        text = body.includes("dry_run=true") ? "Dry run complete" : "Catalog seed complete";
        tone = "ok";
      } else if (body.startsWith("seed_error") || body.startsWith("error:")) {
        text = "Seed error";
        detail = body.replace(/^seed_error\s*/, "").replace(/^error:\s*/, "");
        tone = "fail";
      } else if ((match = body.match(/^MCP tool ([^\s]+).*returned an error:\s*(.+)$/))) {
        text = `${match[1]} returned an error`;
        detail = match[2];
        tone = "warn";
      } else if ((match = body.match(/^Resolved candidate count:\s*(\d+)/))) {
        text = `Resolved ${match[1]} candidate model${match[1] === "1" ? "" : "s"}`;
      } else if ((match = body.match(/^Batch plan:\s*(.+)$/))) {
        text = "Batch plan ready";
        detail = match[1];
      }

      if (text) rows.push({ ...parsed, text, detail, tone });
    });
    return rows.slice(-(maxRows || 6));
  }

  // The 3 most recent parsed timeline rows (or a placeholder while warming up).
  // Split out so the live tickers can swap just these in place — see
  // patchJobWindow — instead of tearing down the whole console each second.
  function jobConsoleRowNodes(tail) {
    const visibleRows = jobLogSummaryRows(tail, 7).slice(-3);
    if (!visibleRows.length) {
      return [
        h("div", { class: "seed-console-row" }, [
          h("span", { class: "seed-console-dot", "aria-hidden": "true" }),
          h("span", { class: "seed-console-text" }, "Waiting for terminal output"),
          h("span", { class: "seed-console-time" }, "--:--:--"),
        ]),
      ];
    }
    return visibleRows.map((row) => (
      h("div", { class: "seed-console-row" + (row.tone ? " is-" + row.tone : ""), title: row.raw }, [
        h("span", { class: "seed-console-dot", "aria-hidden": "true" }),
        h("span", { class: "seed-console-text" }, row.text),
        row.detail ? h("span", { class: "seed-console-detail" }, row.detail) : null,
        h("span", { class: "seed-console-time" }, row.time || "--:--:--"),
      ])
    ));
  }

  function jobConsoleChildren(tail, key) {
    const raw = jobTailPreview(tail, 120);
    return [
      h("div", { class: "seed-console-rows", role: "log", "aria-live": "polite" }, jobConsoleRowNodes(tail)),
      raw ? h("details", {
        class: "seed-console-details",
        open: state[key] ? true : undefined,
        ontoggle: (event) => { state[key] = Boolean(event.currentTarget.open); },
      }, [
        h("summary", null, "Terminal output"),
        h("pre", { class: "seed-log" }, raw),
      ]) : null,
    ];
  }

  // Shared parsed-timeline console for seed and refresh jobs. `expandedKey` is the
  // state field that tracks whether the raw terminal output is expanded.
  function renderJobConsole(tail, expandedKey) {
    return h("div", { class: "seed-console" }, jobConsoleChildren(tail, expandedKey || "seedLogExpanded"));
  }

  function selectionInside(root) {
    const sel = window.getSelection && window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
    const node = sel.anchorNode;
    return Boolean(node && root && root.contains(node));
  }

  // Live heartbeat for an already-mounted job window (run or seed). The overlay is
  // otherwise rebuilt from scratch each second, which reset the terminal's scroll
  // ("jumps"), wiped any text selection ("snapping"), and restarted the looping
  // progress animation. Patching the few dynamic nodes in place keeps the <pre>,
  // its scroll position, the user's selection, and the animation intact.
  // Returns false when the window isn't mounted so callers can fall back to render().
  function patchJobWindow(root, tail, prog, elapsed, key) {
    if (!root) return false;
    const label = root.querySelector(".seed-phase-label");
    if (label && label.textContent !== prog.label) label.textContent = prog.label;
    const elapsedEl = root.querySelector(".seed-elapsed");
    if (elapsedEl && elapsedEl.textContent !== elapsed) elapsedEl.textContent = elapsed;

    const bar = root.querySelector(".seed-progress");
    if (bar) {
      bar.classList.toggle("is-indeterminate", Boolean(prog.indeterminate));
      const fill = bar.querySelector(".seed-progress-fill");
      if (prog.indeterminate) {
        bar.removeAttribute("aria-valuenow");
        if (fill) fill.style.width = "";
      } else {
        bar.setAttribute("aria-valuenow", String(prog.pct));
        if (fill) fill.style.width = prog.pct + "%";
      }
    }

    // Leave the console alone while the user is selecting log text — the swaps
    // below would clobber the selection. It catches up on the next idle tick.
    if (selectionInside(root)) return true;

    const consoleEl = root.querySelector(".seed-console");
    if (consoleEl && !consoleEl.querySelector(".seed-console-details") && jobTailPreview(tail, 120)) {
      // Window opened with an empty tail, so the terminal block was never built;
      // build it once now that output exists. Subsequent ticks patch it in place.
      consoleEl.replaceChildren(...jobConsoleChildren(tail, key));
      return true;
    }

    const rowsHost = root.querySelector(".seed-console-rows");
    if (rowsHost) rowsHost.replaceChildren(...jobConsoleRowNodes(tail));

    const pre = root.querySelector(".seed-log");
    if (pre) {
      const next = jobTailPreview(tail, 120);
      if (pre.textContent !== next) {
        // Keep following new output only if already pinned to the bottom; if the
        // user scrolled up to read, leave their position untouched.
        const pinned = pre.scrollHeight - pre.scrollTop - pre.clientHeight <= 4;
        pre.textContent = next;
        if (pinned) pre.scrollTop = pre.scrollHeight;
      }
    }
    return true;
  }

  // Shared progress bar for seed + refresh job panels.
  function renderJobProgressBar(prog) {
    return h("div", {
      class: "seed-progress" + (prog.indeterminate ? " is-indeterminate" : ""),
      role: "progressbar",
      "aria-valuemin": "0",
      "aria-valuemax": "100",
      "aria-valuenow": prog.indeterminate ? undefined : String(prog.pct),
    }, [
      h("span", { class: "seed-progress-fill", style: prog.indeterminate ? {} : { width: prog.pct + "%" } }),
    ]);
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
      const failTail = seed.tail || seed.error || "Seed failed.";
      return h("section", { class: "settings-panel panel-card seed-error-panel", "aria-label": "Seed failed" }, [
        h("h2", { class: "settings-panel-title" }, "Seed failed"),
        h("p", { class: "settings-summary" }, "The seed run didn't finish. Check the steps below, then try again."),
        renderJobConsole(failTail, "seedLogExpanded"),
        h("div", { class: "action-row" }, [
          h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => { state.seed = { id: "", state: "", tail: "", error: "", preset: "", started: 0 }; navigate("settings", "catalog"); } }, "Try again"),
        ]),
        h("p", { class: "settings-note seed-cli-hint" }, [
          "Or seed from the terminal: ",
          h("code", null, "python scripts/seed_catalog.py --preset exa --count 10"),
        ]),
      ]);
    }
    const prog = jobProgress(seed.tail, "seed");
    const elapsed = fmtElapsed((Date.now() - (seed.started || Date.now())) / 1000);
    return h("section", { class: "settings-panel panel-card seed-running-panel", "aria-label": "Seed in progress" }, [
      h("h2", { class: "settings-panel-title" }, "Seeding catalog"),
      h("div", { class: "seed-status run-status" }, [
        h("span", { class: "vw-spinner", "aria-hidden": "true" }),
        h("p", { class: "seed-phase-label" }, prog.label),
        h("span", { class: "seed-elapsed", title: "Elapsed time" }, elapsed),
      ]),
      renderJobProgressBar(prog),
      h("p", { class: "seed-running-hint" }, "This runs in the background — it's safe to wait here. Larger catalogs can take a few minutes."),
      renderJobConsole(seed.tail, "seedLogExpanded"),
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
      state.seedLogExpanded = false;
      navigate("settings", "seed");
      startSeedTicker();
      render();
      pollSeed();
    } catch (error) {
      toast(message(error), "error");
    }
  }

  // A light 1s heartbeat that re-renders the seed panel so the elapsed counter
  // ticks and the progress bar keeps moving between the slower status polls —
  // this is what kills the "frozen" feel during a seed.
  function startSeedTicker() {
    stopSeedTicker();
    state.seedTick = window.setInterval(() => {
      if (state.setupMode || state.subpage.settings === "seed") patchSeedWindow();
      else stopSeedTicker();
    }, 1000);
  }

  function stopSeedTicker() {
    if (state.seedTick) { window.clearInterval(state.seedTick); state.seedTick = 0; }
  }

  // In-place heartbeat for the seed panel (settings page or setup wizard).
  function patchSeedWindow() {
    if (state.seed.state && state.seed.state !== "running") { render(); return; }
    const root = document.querySelector(".seed-running-panel");
    if (!root) { render(); return; }
    const prog = jobProgress(state.seed.tail, "seed");
    const elapsed = fmtElapsed((Date.now() - (state.seed.started || Date.now())) / 1000);
    if (!patchJobWindow(root, state.seed.tail, prog, elapsed, "seedLogExpanded")) render();
  }

  async function pollSeed() {
    if (!state.seed.id) return;
    window.clearTimeout(state.seedTimer);
    try {
      const data = await api("/api/run-update/" + encodeURIComponent(state.seed.id));
      state.seed.state = data.state || "running";
      state.seed.tail = data.tail || "";
      if (state.seed.state === "succeeded") {
        stopSeedTicker();
        await loadDatabase();
        refreshModels();
        state.seed.state = "succeeded";
        render();
      } else if (state.seed.state === "failed") {
        stopSeedTicker();
        state.seed.error = data.tail || "Seed failed.";
        render();
      } else {
        patchSeedWindow();
        state.seedTimer = window.setTimeout(pollSeed, RUN_POLL_MS);
      }
    } catch (error) {
      stopSeedTicker();
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
    if (status.status === "renewal_needed") return "Access renewal recommended";
    if (status.status === "expired") return "Access expired — re-select or save again";
    if (status.expires_at) return "Access until " + fmtDate(status.expires_at, true);
    return "Access active";
  }

  function selectedStatusCopy(slot, selected, envOverride) {
    if (envOverride && envOverride.configured) {
      return "Set from your environment (read-only)";
    }
    if (!selected || !selected.name) return "No key added yet";
    const source = selected.source_label && selected.source_label !== "none" ? selected.source_label : "this app";
    const managed = selected.managed_by_llmdash ? " · saved here" : " · saved in Voidware";
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
    const detected = Boolean(envOverride.configured);
    const slotSet = detected || hasSelection;
    const nodes = [
      h("div", { class: "credential-slot-head" }, [
        h("div", { class: "credential-slot-heading" }, [
          h("strong", { class: "credential-slot-title" }, (options && options.title) || "Credential"),
          slotSet ? h("span", { class: "credential-slot-badge" }, [h("span", { class: "credential-slot-check" }, "✓"), detected ? "Detected" : "Saved"]) : null,
        ]),
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
            clearTestState(slot);
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
          h("option", { value: "" }, candidates.length ? "Choose a saved key…" : "No saved keys yet"),
          ...candidates.map((item) => h("option", { value: candidateKey(item) }, candidateOptionLabel(item, candidates))),
          h("option", { value: "__new__" }, "Add a new key…"),
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
          oninput: (e) => { form.apiKey = e.target.value; clearTestState(slot, true); },
        }),
      ]));
    }
    if (!managed && hasSelection && !envOverride.configured) {
      nodes.push(h("p", { class: "credential-slot-external-note" }, "This key was saved in Voidware. Changing or removing it will ask for your Voidware password."));
    }
    nodes.push(h("div", { class: "credential-slot-actions action-row" }, [
      canUseSelected ? h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => slotSelect(slot) }, "Use selected") : null,
      showNewKey ? h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => slotSaveNew(slot) }, "Save new key") : null,
      showUpdate && managed ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => slotUpdate(slot, false) }, "Update selected key") : null,
      showUpdate && !managed ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => slotUpdate(slot, true) }, "Update Voidware key") : null,
      hasSelection && !envOverride.configured ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => slotClearSelection(slot) }, "Remove selection") : null,
      hasSelection && managed && !envOverride.configured ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => slotDeleteCredential(slot, false) }, "Delete credential") : null,
      hasSelection && !managed && !envOverride.configured ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => slotDeleteCredential(slot, true) }, "Delete Voidware key") : null,
      hasSelection && managed && !showUpdate && !envOverride.configured ? h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: () => { form.mode = "update"; render(); } }, "Update selected key") : null,
    ].filter(Boolean)));
    return h("section", { class: "credential-slot" + (detected ? " is-detected" : slotSet ? " is-set" : ""), "aria-label": (SLOT_TITLES[slot] || slot) + " credential" }, nodes);
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
      clearTestState(slot);
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
      clearTestState(slot);
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
      clearTestState(slot);
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
      clearTestState(slot);
      state.credentialSlotForms[slot].mode = "select";
      clearSlotFormSecret(slot);
      toast("Selection removed", "success");
      render();
    } catch (error) { toast(message(error), "error"); }
  }

  async function slotDeleteCredential(slot, external, isRetry) {
    const label = external ? "Delete this key from Voidware?" : "Delete this saved key?";
    if (!confirm(label)) return;
    const query = external ? "?external_mutation=true&require_fresh_grant=true" : "";
    try {
      await api("/api/credentials/slots/" + encodeURIComponent(slot) + "/credential" + query, { method: "DELETE" });
      await refreshCredentialState();
      clearTestState(slot);
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

  function providerConnectionFields() {
    const f = state.forms.provider;
    return [
      renderCredentialSlot("provider", { title: "API key" }),
      h("label", { class: "field" }, [h("span", null, "Base URL"), input(f, "base_url", "https://api.openai.com")]),
      h("label", { class: "field" }, [h("span", null, "Models URL override"), input(f, "models_override_url", "Optional")]),
      h("label", { class: "field" }, [h("span", null, "Endpoint mode"), h("select", { value: f.endpoint_mode, onchange: (e) => { f.endpoint_mode = e.target.value; } }, [
        h("option", { value: "append_v1" }, "Append /v1"),
        h("option", { value: "root" }, "Use URL as root"),
      ])]),
    ];
  }

  function settingsProvider() {
    return panel("Connection", providerStatusCopy(), [
      ...providerConnectionFields(),
      h("div", { class: "action-row" }, [
        busyButton({ key: "provider", label: "Test connection", busyLabel: "Testing…", variant: "vw-btn-secondary", onclick: () => testConnection() }),
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: saveProviderSettings }, "Save connection"),
        h("button", { class: "vw-btn vw-btn-ghost", type: "button", onclick: openManualPrompt }, "Manual prompt"),
      ]),
      testResultNote("provider"),
    ]);
  }

  function settingsModelFields() {
    // Lazily pull the live model catalog the first time this surface renders.
    loadProviderModelList();
    return [
      modelPickerField("default_model", "Default model", "default", "e.g. gpt-4.1"),
      modelPickerField("backup_model", "Backup model", "backup", "Optional fallback"),
      modelListStatus(),
    ];
  }

  function settingsModels() {
    return panel("Agent model", "Choose the default model and an optional backup the research agent uses for seeding and update runs.", [
      ...settingsModelFields(),
      h("div", { class: "action-row" }, [
        h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: saveProviderSettings }, "Save models"),
      ]),
    ]);
  }

  function modelListStatus() {
    const pm = state.providerModels;
    if (!state.provider.has_provider) {
      return h("p", { class: "settings-note model-list-note" }, "Connect a provider to load its model list. You can still type a model name above.");
    }
    if (pm.loading) return h("p", { class: "settings-note model-list-note" }, "Loading available models…");
    if (pm.error) {
      return h("p", { class: "settings-note model-list-note is-warning" }, [
        "Couldn't load the model list — type a name above instead. ",
        h("button", { class: "link-btn", type: "button", onclick: () => loadProviderModelList(true) }, "Retry"),
      ]);
    }
    if (pm.loaded && pm.list.length) {
      return h("p", { class: "settings-note model-list-note" }, [
        `${pm.list.length} model${pm.list.length === 1 ? "" : "s"} available from your provider. `,
        h("button", { class: "link-btn", type: "button", onclick: () => loadProviderModelList(true) }, "Refresh list"),
      ]);
    }
    return null;
  }

  // Renders one agent-model field: a dropdown of the provider's models with an
  // inline Test button, falling back to a text input when the list is empty or
  // the user opts into a custom name (gateways often expose slash-style ids the
  // /models endpoint doesn't return).
  function modelPickerField(key, label, testTarget, placeholder) {
    const f = state.forms.models;
    const pm = state.providerModels;
    const current = f[key] || "";
    const customKey = key + "_custom";
    const hasList = pm.list.length > 0;
    const valueInList = current && pm.list.includes(current);
    const custom = Boolean(f[customKey]) || (hasList && current && !valueInList);
    const result = testState(testTarget);
    // Changing the selection invalidates any previous test result.
    const onPick = () => { if (result.ok !== null || result.busy) state.testStatus[testTarget] = { busy: false, ok: null, msg: "" }; };
    let control;
    if (!hasList || custom) {
      control = h("input", {
        type: "text",
        class: "model-picker-input" + testFieldClass(testTarget),
        value: current,
        placeholder,
        list: hasList ? "model-suggestions-" + key : undefined,
        oninput: (e) => { onPick(); f[key] = e.target.value; },
      });
    } else {
      const options = [h("option", { value: "" }, "Choose a model…")];
      for (const id of pm.list) options.push(h("option", { value: id }, id));
      options.push(h("option", { value: "__custom__" }, "Custom name…"));
      control = h("select", {
        class: "model-picker-select" + testFieldClass(testTarget),
        value: current || "",
        onchange: (e) => {
          onPick();
          if (e.target.value === "__custom__") { f[customKey] = true; f[key] = ""; }
          else { f[key] = e.target.value; }
          render();
        },
      }, options);
    }
    return h("div", { class: "field model-field" }, [
      h("span", { class: "model-field-label" }, label),
      h("div", { class: "model-field-control" }, [
        control,
        busyButton({
          key: testTarget,
          label: "Test",
          variant: "vw-btn-secondary",
          extraClass: "model-test-btn",
          disabled: !current,
          title: current ? "Send a one-line probe to " + current : "Pick a model first",
          onclick: () => testModel(testTarget),
        }),
        hasList && custom ? h("datalist", { id: "model-suggestions-" + key }, pm.list.map((id) => h("option", { value: id }))) : null,
      ]),
      testResultNote(testTarget),
      hasList && custom ? h("button", {
        class: "link-btn model-field-toggle",
        type: "button",
        onclick: () => { f[customKey] = false; if (!pm.list.includes(f[key])) f[key] = ""; render(); },
      }, "Choose from list instead") : null,
    ]);
  }

  // Adds a green/red border class to a tested input/select.
  function testFieldClass(key) {
    const s = testState(key);
    if (s.ok === true) return " is-ok";
    if (s.ok === false) return " is-fail";
    return "";
  }

  // A button that keeps its normal footprint and shows a centered spinner while
  // its keyed action is running.
  function busyButton(opts) {
    const busy = opts.key ? testBusy(opts.key) : false;
    const stateClass = opts.key ? testButtonClass(opts.key) : "";
    return h("button", {
      class: "vw-btn " + (opts.variant || "vw-btn-secondary") + (opts.extraClass ? " " + opts.extraClass : "") + (busy ? " is-busy" : "") + stateClass,
      type: "button",
      disabled: busy || Boolean(opts.disabled),
      title: opts.title,
      "aria-label": busy ? (opts.busyLabel || opts.label) : undefined,
      "aria-busy": busy ? "true" : undefined,
      onclick: opts.onclick,
    }, busy
      ? [
        h("span", { class: "btn-busy-measure", "aria-hidden": "true" }, opts.label),
        h("span", { class: "btn-spinner", "aria-hidden": "true" }),
      ]
      : opts.label);
  }

  function testButtonClass(key) {
    const s = testState(key);
    if (s.busy) return "";
    if (s.ok === true) return " is-test-ok";
    if (s.ok === false) return " is-test-fail";
    return "";
  }

  const RESEARCH_SOURCES = [
    {
      slot: "exa",
      name: "Exa search",
      configuredKey: "exa_configured",
      blurb: "Web research the agent uses to discover newly released models. The free tier works.",
      test: null,
    },
    {
      slot: "llmstats",
      name: "LLM Stats",
      configuredKey: "llmstats_configured",
      blurb: "Benchmark catalog the agent can seed and score models from.",
      test: () => testLLMStats(),
    },
    {
      slot: "aa",
      name: "Artificial Analysis",
      configuredKey: "aa_configured",
      blurb: "Intelligence, coding, and agentic index used to rank and seed top models.",
      test: () => testAA(),
    },
  ];

  function researchSourceCard(source, opts) {
    const compact = opts && opts.compact;
    const configured = Boolean(state.provider[source.configuredKey]);
    const result = testState(source.slot);
    const failed = result.ok === false;
    const passed = result.ok === true;
    const busy = result.busy;
    const cardClass = "research-card"
      + (compact ? " is-compact" : "")
      + (configured ? " is-connected" : "")
      + (passed ? " is-test-ok" : "")
      + (failed ? " is-fail" : "")
      + (busy ? " is-testing" : "");
    return h("section", { class: cardClass, "aria-label": source.name }, [
      h("div", { class: "research-card-head" }, [
        h("div", { class: "research-card-heading" }, [
          h("h3", { class: "research-card-title" }, source.name),
          compact ? infoTip(source.blurb, source.name + " details") : null,
          compact ? null : statusPill(configured ? "Connected" : "Not configured", configured ? "fresh" : "unknown"),
        ]),
        source.test ? busyButton({
          key: source.slot,
          label: compact ? "Test source" : "Test",
          variant: "vw-btn-secondary",
          extraClass: "research-test-btn",
          disabled: !configured,
          title: configured ? "Check that " + source.name + " is reachable" : "Add a key to test",
          onclick: source.test,
        }) : null,
      ]),
      compact ? null : h("p", { class: "research-card-blurb" }, source.blurb),
      renderCredentialSlot(source.slot, { title: source.name + " API key" }),
      testResultNote(source.slot),
    ]);
  }

  function settingsResearchFields() {
    return RESEARCH_SOURCES.map(researchSourceCard);
  }

  function wizardResearchSources() {
    const active = RESEARCH_SOURCES.find((source) => source.slot === state.setupResearchSource) || RESEARCH_SOURCES[0];
    return h("section", { class: "wizard-research-panel", "aria-label": "Research source setup" }, [
      h("div", { class: "wizard-research-tabs", role: "tablist", "aria-label": "Research sources" }, RESEARCH_SOURCES.map((source) => {
        const configured = Boolean(state.provider[source.configuredKey]);
        const result = testState(source.slot);
        const selected = source.slot === active.slot;
        const stateText = result.busy ? "Testing" : result.ok === false ? "Failed" : configured ? "Connected" : "Optional";
        const stateName = result.busy ? "running" : result.ok === false ? "failed" : configured ? "fresh" : "unknown";
        const tabId = "wizard-research-tab-" + source.slot;
        const panelId = "wizard-research-panel-" + source.slot;
        return h("button", {
          class: "wizard-research-tab" + (selected ? " is-active" : "") + (configured ? " is-connected" : "") + (result.busy ? " is-testing" : "") + (result.ok === false ? " is-fail" : ""),
          type: "button",
          role: "tab",
          id: tabId,
          "aria-controls": panelId,
          "aria-selected": selected ? "true" : "false",
          onclick: () => { state.setupResearchSource = source.slot; render(); },
        }, [
          h("span", { class: "wizard-research-tab-copy" }, [
            h("span", { class: "wizard-research-tab-name" }, source.name),
          ]),
          statusPill(stateText, stateName),
        ]);
      })),
      h("div", {
        class: "wizard-research-detail",
        role: "tabpanel",
        id: "wizard-research-panel-" + active.slot,
        "aria-labelledby": "wizard-research-tab-" + active.slot,
      }, [
        active ? researchSourceCard(active, { compact: true }) : null,
      ]),
    ]);
  }

  function settingsResearch() {
    return panel(
      "Research",
      "Connect the data sources the research agent uses to discover and score models. Keys are stored securely on this machine.",
      settingsResearchFields(),
    );
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
      // A new base URL/key means a different model catalog; force a refetch.
      state.providerModels = { loading: false, loaded: false, list: [], error: "" };
      toast("Connection saved", "success");
      render();
    } catch (error) {
      toast(message(error), "error");
    }
  }

  // ── Inline test/save status ──────────────────────────────────────
  function testState(key) {
    return state.testStatus[key] || { busy: false, ok: null, msg: "" };
  }

  function setTestState(key, patch) {
    state.testStatus[key] = { ...testState(key), ...patch };
    render();
  }

  function clearTestState(key, rerender) {
    if (!state.testStatus[key]) return false;
    state.testStatus[key] = { busy: false, ok: null, msg: "" };
    if (rerender) render();
    return true;
  }

  function testBusy(key) {
    return Boolean(testState(key).busy);
  }

  // Small inline result chip rendered next to a control after a test runs.
  function testResultNote(key) {
    const s = testState(key);
    if (s.busy) {
      return h("span", { class: "test-note is-busy" }, [
        h("span", { class: "vw-spinner test-note-spinner", "aria-hidden": "true" }),
        h("span", null, s.msg || "Testing…"),
      ]);
    }
    if (s.ok === true) return h("span", { class: "test-note is-ok" }, [h("span", { class: "test-note-glyph" }, "✓"), h("span", null, s.msg || "Working")]);
    if (s.ok === false) return h("span", { class: "test-note is-fail" }, [h("span", { class: "test-note-glyph" }, "✕"), h("span", null, s.msg || "Failed")]);
    return null;
  }

  async function testConnection(isRetry) {
    setTestState("provider", { busy: true, msg: "Checking connection…" });
    try {
      const data = await api("/api/provider/test-connection", { method: "POST", body: { ...state.forms.provider, ...state.forms.models } });
      const ok = Boolean(data.ok);
      const msg = ok ? `${data.models_count || 0} models visible` : `Provider returned HTTP ${data.status_code}`;
      setTestState("provider", { busy: false, ok, msg });
      toast(msg, ok ? "success" : "warning");
    } catch (error) {
      if (!isRetry && await openApproval(error, () => testConnection(true), { slot: "provider" })) return;
      setTestState("provider", { busy: false, ok: false, msg: "Failed" });
      toast(message(error), "error");
    }
  }

  async function testModel(target) {
    const f = state.forms.models;
    const model = String((target === "backup" ? f.backup_model : f.default_model) || "").trim();
    if (!model) { toast("Pick a model to test first.", "warning"); return; }
    setTestState(target, { busy: true, msg: "Testing…" });
    try {
      const data = await api("/api/provider/test-model", { method: "POST", body: { target, model } });
      const ok = Boolean(data.ok);
      setTestState(target, { busy: false, ok, msg: ok ? "Replied" : `Failed (HTTP ${data.status_code || "?"})` });
      toast(ok ? `${model} replied` : `${model} failed (HTTP ${data.status_code || "?"})`, ok ? "success" : "warning");
    } catch (error) {
      setTestState(target, { busy: false, ok: false, msg: "Failed" });
      toast(message(error), "error");
    }
  }

  async function testLLMStats(isRetry) {
    setTestState("llmstats", { busy: true, msg: "Checking…" });
    try {
      const data = await api("/api/llmstats/test-connection");
      const ok = Boolean(data.ok);
      setTestState("llmstats", { busy: false, ok, msg: ok ? "Reachable" : "Unreachable" });
      toast(ok ? "LLM Stats is reachable" : "LLM Stats test failed", ok ? "success" : "warning");
    } catch (error) {
      if (!isRetry && await openApproval(error, () => testLLMStats(true), { slot: "llmstats" })) return;
      setTestState("llmstats", { busy: false, ok: false, msg: "Failed" });
      toast(message(error), "error");
    }
  }

  async function testAA(isRetry) {
    setTestState("aa", { busy: true, msg: "Checking…" });
    try {
      const data = await api("/api/aa/test-connection");
      const ok = Boolean(data.ok);
      setTestState("aa", { busy: false, ok, msg: ok ? "Reachable" : "Unreachable" });
      toast(ok ? "Artificial Analysis is reachable" : "Artificial Analysis test failed", ok ? "success" : "warning");
    } catch (error) {
      if (!isRetry && await openApproval(error, () => testAA(true), { slot: "aa" })) return;
      setTestState("aa", { busy: false, ok: false, msg: "Failed" });
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
    state.refreshOptionsOpen = true;
    render();
  }

  async function startRefreshRun(payload) {
    try {
      const data = await api("/api/run-update", { method: "POST", body: payload || { preset: "exa", count: 25 } });
      state.refreshOptionsOpen = false;
      state.runLogExpanded = false;
      state.run = {
        open: true,
        id: data.id,
        state: data.state || "running",
        started: Date.now(),
        tail: "",
        error: "",
        source: (payload && payload.preset) || "exa",
      };
      startRunTicker();
      render();
      pollRun();
    } catch (error) { toast(message(error), "error"); }
  }

  // 1s heartbeat so elapsed + the looping bar keep moving between the slower 3s
  // status polls (mirrors the seed ticker). Patches in place rather than
  // re-rendering so the terminal's scroll, selection, and animation survive.
  function startRunTicker() {
    stopRunTicker();
    state.runTick = window.setInterval(() => {
      if (state.run.open && state.run.state === "running") patchRunWindow();
      else stopRunTicker();
    }, 1000);
  }

  function stopRunTicker() {
    if (state.runTick) { window.clearInterval(state.runTick); state.runTick = 0; }
  }

  function patchRunWindow() {
    if (!(state.run.open && state.run.state === "running")) { render(); return; }
    const root = els.overlay && els.overlay.querySelector(".run-window");
    if (!root) { render(); return; }
    const prog = jobProgress(state.run.tail, "refresh");
    const elapsed = state.run.started ? fmtElapsed((Date.now() - state.run.started) / 1000) : "";
    if (!patchJobWindow(root, state.run.tail, prog, elapsed, "runLogExpanded")) render();
  }

  async function cancelRun() {
    if (!state.run.id || state.run.state !== "running") {
      state.run.open = false;
      stopRunTicker();
      render();
      return;
    }
    try {
      const data = await api("/api/run-update/" + encodeURIComponent(state.run.id) + "/cancel", { method: "POST" });
      state.run.state = data.state || "canceled";
      state.run.tail = data.tail || state.run.tail;
      state.run.error = data.tail || state.run.error;
      window.clearTimeout(state.runTimer);
      stopRunTicker();
      toast("Refresh canceled", "warning");
      render();
    } catch (error) {
      toast(message(error), "error");
    }
  }

  async function pollRun() {
    if (!state.run.id) return;
    window.clearTimeout(state.runTimer);
    try {
      const data = await api("/api/run-update/" + encodeURIComponent(state.run.id));
      state.run.state = data.state || "running";
      state.run.tail = data.tail || "";
      if (state.run.state === "succeeded") {
        stopRunTicker();
        toast("Dashboard update finished", "success");
        await loadDatabase();
        refreshModels();
        render();
      } else if (state.run.state === "failed") {
        stopRunTicker();
        state.run.error = data.tail || "Update failed.";
        render();
      } else if (state.run.state === "canceled") {
        stopRunTicker();
        render();
      } else {
        patchRunWindow();
        state.runTimer = window.setTimeout(pollRun, RUN_POLL_MS);
      }
    } catch (error) {
      stopRunTicker();
      state.run.error = message(error);
      state.run.state = "failed";
      render();
    }
  }

  function runStateTone(run) {
    if (run.state === "failed") return "expired";
    if (run.state === "succeeded") return "fresh";
    if (run.state === "canceled") return "canceled";
    return "running";
  }

  // Pull the applied/diff counts out of the log so success/failure can summarize
  // what the run actually changed.
  function runDiffCounts(tail) {
    const text = String(tail || "");
    const matches = [...text.matchAll(/(?:run_complete|refresh_apply|refresh_diff)\s+(\{[^\n]*\})/g)];
    for (let i = matches.length - 1; i >= 0; i -= 1) {
      const payload = parseJsonTail(matches[i][1]);
      if (payload) return payload;
    }
    return null;
  }

  function runCountsSummary(tail) {
    const counts = runDiffCounts(tail);
    if (!counts) return "";
    const parts = [];
    const add = (n, one, many) => { const v = Number(n || 0); if (v) parts.push(`${v} ${v === 1 ? one : many}`); };
    add(counts.new_models, "new model", "new models");
    add(counts.score_updates, "score update", "score updates");
    add(counts.status_changes, "status change", "status changes");
    return parts.join(" · ");
  }

  function closeRunWindow() {
    state.run.open = false;
    stopRunTicker();
    render();
  }

  function renderRunWindow() {
    const run = state.run;
    const running = run.state === "running";
    const elapsed = run.started ? fmtElapsed((Date.now() - run.started) / 1000) : "";
    const rawTail = run.tail || run.error || "";

    let body;
    if (run.state === "succeeded") {
      const summary = runCountsSummary(run.tail);
      body = [
        h("div", { class: "run-result-head" }, [
          statusPill("Update complete", "fresh"),
          run.source ? h("span", { class: "run-source" }, sourceLabel(run.source)) : null,
          elapsed ? h("span", { class: "run-elapsed" }, elapsed) : null,
        ]),
        h("p", { class: "settings-summary" }, summary ? `Applied ${summary}.` : "The dashboard is up to date."),
        renderJobConsole(run.tail, "runLogExpanded"),
      ];
    } else if (run.state === "failed") {
      body = [
        h("div", { class: "run-result-head" }, [
          statusPill("Refresh failed", "expired"),
          run.source ? h("span", { class: "run-source" }, sourceLabel(run.source)) : null,
        ]),
        h("p", { class: "settings-summary" }, "The refresh didn't finish. Review the steps below, then try again."),
        renderJobConsole(rawTail, "runLogExpanded"),
        h("p", { class: "settings-note seed-cli-hint" }, [
          "Or refresh from the terminal: ",
          h("code", null, "python scripts/run_update.py"),
        ]),
      ];
    } else if (run.state === "canceled") {
      body = [
        h("div", { class: "run-result-head" }, [
          statusPill("Canceled", "canceled"),
          run.source ? h("span", { class: "run-source" }, sourceLabel(run.source)) : null,
        ]),
        h("p", { class: "settings-summary" }, "This refresh was canceled before it finished."),
        renderJobConsole(rawTail, "runLogExpanded"),
      ];
    } else {
      const prog = jobProgress(run.tail, "refresh");
      body = [
        h("div", { class: "seed-status run-status" }, [
          h("span", { class: "vw-spinner", "aria-hidden": "true" }),
          h("p", { class: "seed-phase-label" }, prog.label),
          h("div", { class: "run-status-meta" }, [
            run.source ? h("span", { class: "run-source" }, sourceLabel(run.source)) : null,
            h("span", { class: "seed-elapsed", title: "Elapsed time" }, elapsed),
          ]),
        ]),
        renderJobProgressBar(prog),
        h("p", { class: "seed-running-hint" }, "This runs in the background — it's safe to wait here. Researching and scoring can take a few minutes."),
        renderJobConsole(run.tail, "runLogExpanded"),
      ];
    }

    return modal("Refresh run", [
      h("div", { class: "run-window" + (running ? " is-running" : "") }, [
        ...body,
        h("div", { class: "action-row run-actions" }, [
          rawTail ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => copyText(rawTail).then(() => toast("Run log copied", "success")) }, "Copy log") : null,
          running ? h("button", { class: "vw-btn vw-btn-danger", type: "button", onclick: cancelRun }, "Cancel run") : null,
          !running ? h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: closeRunWindow }, "Close") : null,
        ]),
      ]),
    ], running ? null : closeRunWindow);
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
    // First-launch onboarding owns the screen. The manual-prompt and approval
    // modals (used while saving keys) still layer above it; dashboard-only
    // overlays (help, run, compare) stay suppressed during setup.
    if (state.setupMode && state.ready) nodes.push(renderWizard());
    if (state.helpOpen && !state.setupMode) nodes.push(modal("Keyboard shortcuts", [
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
    if (state.refreshOptionsOpen) nodes.push(modal("Refresh options", [renderRefreshOptions()], () => { state.refreshOptionsOpen = false; render(); }));
    if (state.run.open) nodes.push(renderRunWindow());
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
    // Deep-link drawer: same scorecard content as the docked rail, surfaced as a
    // modal when a ?m= link lands on a narrow viewport where the rail is offscreen.
    if (state.detailDrawerOpen && state.area === "models" && !state.setupMode && state.ready) {
      const dm = inspectModel();
      if (dm) nodes.push(modal("Model details", [h("div", { class: "detail-rail-inner detail-drawer-inner" }, railContent(dm))], closeDetailDrawer));
      else state.detailDrawerOpen = false;
    }
    els.overlay.replaceChildren(...nodes);
    document.body.classList.toggle("has-overlay", nodes.length > 0 || state.drawerOpen);
    manageOverlayFocus(nodes.length > 0);
  }

  // H3: focus management for every overlay in the overlay layer (help, manual,
  // refresh options, run window, approval, compare, wizard). `inert` on the
  // background regions both removes them from the tab order (a real focus trap,
  // since Tab can't reach inert content) and blocks pointer/AT interaction.
  const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let overlayWasOpen = false;
  let overlayRestoreFocus = null;

  function focusFirstIn(container) {
    if (!container) return;
    const first = container.querySelector(FOCUSABLE_SELECTOR);
    if (first) { first.focus({ preventScroll: true }); return; }
    const card = container.querySelector(".modal-card") || container.firstElementChild;
    if (card) { card.setAttribute("tabindex", "-1"); card.focus({ preventScroll: true }); }
  }

  function manageOverlayFocus(open) {
    // The nav drawer manages its own inert/focus (syncShell + closeDrawer); only
    // mark the sidebar inert for a modal when the drawer itself isn't the overlay.
    if (els.header) els.header.toggleAttribute("inert", open);
    if (els.subnav) els.subnav.toggleAttribute("inert", open);
    // The mobile shell header (hamburger) lives outside #content, so inert it too
    // or Tab can escape an open overlay to it on narrow viewports.
    const mobileHeader = document.getElementById("mobile-header");
    if (mobileHeader) mobileHeader.toggleAttribute("inert", open);
    if (els.sidebar) els.sidebar.toggleAttribute("inert", open && !state.drawerOpen);
    if (els.content) els.content.toggleAttribute("inert", open || state.drawerOpen);
    if (els.rail) els.rail.toggleAttribute("inert", open || state.drawerOpen);
    if (open && !overlayWasOpen) {
      overlayRestoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      focusFirstIn(els.overlay);
    } else if (!open && overlayWasOpen) {
      const target = overlayRestoreFocus;
      overlayRestoreFocus = null;
      if (target && document.contains(target) && typeof target.focus === "function") {
        target.focus({ preventScroll: true });
      }
    }
    overlayWasOpen = open;
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
      if (state.ui.columnsOpen) { closeColumns(); return; }
      if (state.ui.filtersOpen) { closeFilters(); return; }
      if (state.compareOpen) { state.compareOpen = false; render(); return; }
      if (state.helpOpen || state.manualOpen || state.approval.open) {
        if (state.approval.open) { closeApproval(); return; }
        state.helpOpen = false; state.manualOpen = false; render(); return;
      }
      if (state.detailDrawerOpen) { closeDetailDrawer(); return; }
      if (state.drawerOpen) { closeDrawer(); return; }
      if (state.refreshOptionsOpen) { state.refreshOptionsOpen = false; render(); return; }
      if (state.run.open && state.run.state !== "running") { closeRunWindow(); return; }
    }
    if (state.drawerOpen || state.helpOpen || state.manualOpen || state.approval.open || state.compareOpen || state.detailDrawerOpen) return;
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
    state.detailDrawerOpen = false;
    // Copy-only permalinks: navigate() keeps emitting param-free hashes so the
    // live URL never carries ?m= (no history spam). The ?m= param is authored
    // solely by the Copy link button.
    history.pushState({}, "", hashFor(state.area, state.subpage[state.area]));
    render();
  }

  function parseHash(hash) {
    const raw = String(hash || "").replace(/^#/, "");
    const legacy = { table: ["models", "table"], chart: ["models", "chart"], data: ["settings", "provider"], settings: ["settings", "provider"], changelog: ["changelog", "index"], stats: ["stats", "index"] };
    const qIdx = raw.indexOf("?");
    const path = qIdx >= 0 ? raw.slice(0, qIdx) : raw;
    const model = qIdx >= 0 ? (new URLSearchParams(raw.slice(qIdx + 1)).get("m") || "") : "";
    if (!path) return ["models", "list", model];
    if (legacy[path]) return [...legacy[path], model];
    const [area, sub] = path.split("/");
    return [AREA[area] ? area : "models", sub || (area === "settings" ? "provider" : area === "models" ? "list" : "index"), model];
  }

  function applyRoute(route) {
    state.area = route[0];
    if (state.subpage[state.area] !== undefined) state.subpage[state.area] = route[1];
    applyPermalinkModel(route[2]);
  }

  // A ?m= deep link wins over the persisted inspect id (applied on boot after
  // loadPrefs, before the first refreshModels, and re-applied on hashchange).
  // On narrow viewports the docked rail is out of sight, so surface the same
  // scorecard as a modal drawer. An empty id (every param-free navigate) is a
  // no-op so ordinary navigation never clobbers the current selection.
  function applyPermalinkModel(id) {
    if (!id) return;
    state.ui.inspect = id;
    if (window.innerWidth <= 900) state.detailDrawerOpen = true;
  }

  function closeDetailDrawer() {
    state.detailDrawerOpen = false;
    render();
  }

  function hashFor(area, sub, model) {
    let base;
    if (area === "models") base = "#models/" + (sub || "list");
    else if (area === "settings") base = "#settings/" + (sub || "provider");
    else base = "#" + area;
    if (model && area === "models") base += "?m=" + encodeURIComponent(model);
    return base;
  }

  function compareModels() {
    // With pinning on, resolve from the full catalog so a filtered/off-frontier
    // pick still appears in the tray, overlay, and chart focus (U5c); otherwise
    // the tray tracks the visible set.
    const scope = state.ui.pinCompared ? state.models : state.filteredModels;
    const byId = new Map(scope.map((m) => [m.id, m]));
    return state.ui.compare.map((id) => byId.get(id)).filter(Boolean);
  }

  function inspectModel() {
    const byId = new Map(state.filteredModels.map((m) => [m.id, m]));
    // Resolve out-of-filter deep links from the full catalog before falling back
    // to the top visible row, so the rail/drawer show the model the URL asked for.
    return byId.get(state.ui.inspect)
      || state.models.find((m) => m.id === state.ui.inspect)
      || state.filteredModels[0] || null;
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
    if (state.area !== "models") return;
    // Clamp against the rows actually rendered: pinning and the frontier toggle
    // make the visible order longer/shorter than state.filteredModels.
    const rows = document.querySelectorAll("table.models tbody tr, .model-list-row");
    if (!rows.length) return;
    const idx = clamp(Number.isFinite(from) ? from + delta : state.focusIndex + delta, 0, rows.length - 1);
    state.focusIndex = idx;
    rows[idx].focus();
  }

  function setSort(key) {
    if (state.ui.sortKey === key) state.ui.sortDir = state.ui.sortDir === "desc" ? "asc" : "desc";
    else { state.ui.sortKey = key; state.ui.sortDir = "desc"; }
    refreshModels();
    render();
  }

  // H4: commit the search text synchronously so state is never stale (Enter, a
  // filter change, or export mid-type all see the current query); debounce only
  // the expensive refresh+render. Focus/caret survive the render via mount().
  function debounceSearch() {
    window.clearTimeout(state.searchDebounce);
    state.searchDebounce = window.setTimeout(() => { refreshModels(); render(); }, 180);
  }

  function resetFilters() {
    Object.assign(state.ui, {
      text: "", vendors: [], tier: "", status: "", minOverall: 0, hasPricing: false, releasedAfter: "",
      inputCapabilities: [], hideDeprecated: false, frontierOnly: false,
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
      if (!data.last_updated) return;
      state.lastUpdated = data.last_updated;
      if (state.metaSeen && data.last_updated !== state.metaSeen) {
        const node = toast("New dashboard data is ready", "success", "Reload", async () => {
          // H7: match pollSeed/performReset — surface a load failure instead of
          // leaving an unhandled rejection and a stale dashboard.
          try {
            await loadDatabase();
            refreshModels();
            render();
          } catch (error) {
            toast(message(error) || "Could not load the new data.", "error");
          }
        });
        // H6: only mark this update seen once the notice actually surfaced; if a
        // modal suppressed the toast, keep re-offering it on the next poll.
        if (node) state.metaSeen = data.last_updated;
      } else {
        state.metaSeen = data.last_updated;
      }
      updateFreshness();
    } catch (_) {}
  }

  const TOAST_GLYPH = { success: "✓", error: "✕", warning: "!", info: "i" };

  function toast(text, tone, actionLabel, action) {
    const modalOpen = state.helpOpen || state.manualOpen || state.refreshOptionsOpen || state.approval.open || state.run.open;
    if (modalOpen && tone !== "error") return;
    const id = ++state.toastId;
    const t = tone || "info";
    const icon = t === "loading"
      ? h("span", { class: "vw-spinner toast-spinner", "aria-hidden": "true" })
      : h("span", { class: "toast-icon", "aria-hidden": "true" }, TOAST_GLYPH[t] || "i");
    const node = h("div", { class: "vw-toast toast", "data-testid": "toast", "data-tone": t, role: t === "error" ? "alert" : "status" }, [
      icon,
      h("span", { class: "toast-text" }, text),
      actionLabel ? h("button", { class: "toast-action", type: "button", onclick: action }, actionLabel) : null,
      h("button", { class: "toast-dismiss", type: "button", "aria-label": "Dismiss", onclick: () => node.remove() }, "×"),
    ]);
    els.toast.appendChild(node);
    while (els.toast.children.length > 3) els.toast.firstChild.remove();
    // Loading toasts persist until the caller replaces them; error toasts persist
    // until dismissed (role="alert" + the × button) so a failure notice is never
    // missed (H10). Everything else auto-dismisses. Return the node so a caller
    // can swap it out.
    if (t !== "loading" && t !== "error") {
      window.setTimeout(() => { if (node.isConnected && id <= state.toastId) node.remove(); }, 4500);
    }
    return node;
  }

  function h(tag, attrs, children) {
    const svgTags = new Set(["svg", "rect", "line", "text", "circle", "polygon", "polyline", "g", "path"]);
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
    // H4: preserve keyboard focus (and the text caret) across a full re-render so
    // the search box and the filter sliders don't drop focus mid-interaction — a
    // keyboard user's next keystroke would otherwise land on nothing.
    const active = document.activeElement;
    const focusId = active && els.body.contains(active) && active.id ? active.id : "";
    let caret = null;
    if (focusId && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) {
      try { caret = { start: active.selectionStart, end: active.selectionEnd }; } catch (_) { caret = null; }
    }
    els.body.replaceChildren(node);
    if (!focusId) return;
    const next = els.body.querySelector("#" + (window.CSS && CSS.escape ? CSS.escape(focusId) : focusId));
    if (!next) return;
    next.focus({ preventScroll: true });
    if (caret && typeof next.setSelectionRange === "function") {
      try { next.setSelectionRange(caret.start, caret.end); } catch (_) {}
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function modelIdentity(model) {
    const deprecated = model.status === "deprecated";
    return h("div", { class: "model-cell", style: { "--model-color": safeColor(model.color) } }, [
      h("div", { class: "model-cell-text" }, [
        h("div", { class: "model-cell-name-row" }, [
          h("strong", { class: "name", title: model.name || "Unknown model" }, highlight(model.name || "Unknown model")),
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

  function leaderboard(data) {
    if (data.length < 1) {
      return h("div", { class: "chart-empty-note" }, [
        h("strong", null, "Runtime leaderboard needs a run"),
        h("p", null, "Run Refresh to record an agent's first timed run."),
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
    // The run metadata is rendered as a clean panel above the body, so drop the
    // raw "## Run Metadata" table dump from the markdown.
    text = text.replace(/\r?\n#{1,3}\s+Run Metadata[\s\S]*$/i, "\n");
    text = text.replace(/^#\s+.+(?:\r?\n|$)/, "");
    if (title) text = text.replace(new RegExp("^#\\s+" + escapeRegExp(title) + "\\s*", "i"), "");
    if (summary) {
      const normalizedSummary = String(summary).trim().replace(/\s+/g, " ");
      const lines = text.split(/\r?\n/);
      while (lines.length && !lines[0].trim()) lines.shift();
      if (lines[0] && lines[0].trim().replace(/\s+/g, " ") === normalizedSummary) lines.shift();
      text = lines.join("\n").replace(/^\s+/, "");
    }
    if (window.marked) {
      const rawHtml = window.marked.parse(text);
      // Changelog markdown is machine-generated but still passes through marked's
      // raw-HTML mode; sanitize before insertion so no <script>/onerror/js: URL
      // can execute in the dashboard origin (C5). DOMPurify is vendored (D1); if
      // it is somehow missing, fail closed to text rather than raw HTML.
      box.innerHTML = window.DOMPurify ? window.DOMPurify.sanitize(rawHtml) : "";
      if (!window.DOMPurify) box.textContent = text;
    } else {
      box.innerHTML = "<pre></pre>";
      box.firstChild.textContent = text;
    }
    return box;
  }

  function input(obj, key, placeholder, type) {
    return h("input", { type: type || "text", value: obj[key] || "", placeholder, oninput: (e) => { obj[key] = e.target.value; } });
  }

  const STATUS_PILL_CLASS = {
    fresh: "vw-status-success",
    succeeded: "vw-status-success",
    stale: "vw-status-warning",
    running: "vw-status-generating",
    canceled: "vw-status-warning",
    expired: "vw-status-error",
    failed: "vw-status-error",
  };

  function statusPill(label, stateName) {
    const extra = STATUS_PILL_CLASS[stateName] || "";
    return h("span", { class: "vw-status-chip" + (extra ? " " + extra : ""), "data-state": stateName || "unknown" }, label);
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
    // visibleColumns: null (or anything non-array) means "all visible"; an array
    // is filtered to the known hideable keys so stale/renamed columns can't stick.
    ui.visibleColumns = Array.isArray(ui.visibleColumns)
      ? HIDEABLE_COLUMNS.filter((k) => ui.visibleColumns.includes(k)) : null;
    ui.frontierOnly = Boolean(ui.frontierOnly);
    ui.pinCompared = Boolean(ui.pinCompared);
    ui.columnsOpen = Boolean(ui.columnsOpen);
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

  const ACCESS_TOKEN_KEY = "llmDashAccessToken";

  function accessToken() {
    // A loopback install needs no token; on a LAN install the operator arrives via
    // .../?token=<t>, which we capture once, persist, and strip from the URL so it
    // is not left in history or shared links.
    try {
      const params = new URLSearchParams(location.search);
      const fromUrl = (params.get("token") || "").trim();
      if (fromUrl) {
        localStorage.setItem(ACCESS_TOKEN_KEY, fromUrl);
        params.delete("token");
        const rest = params.toString();
        history.replaceState(null, "", location.pathname + (rest ? "?" + rest : "") + location.hash);
      }
      return localStorage.getItem(ACCESS_TOKEN_KEY) || "";
    } catch (_) {
      return "";
    }
  }

  async function api(url, opts) {
    const options = opts || {};
    const headers = {};
    if (options.body) headers["Content-Type"] = "application/json";
    const token = accessToken();
    if (token) headers["Authorization"] = "Bearer " + token;
    const res = await fetch(url, {
      method: options.method || "GET",
      cache: "no-store",
      headers: Object.keys(headers).length ? headers : undefined,
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
    let s = String(value ?? "");
    // H9: neutralize CSV formula injection — a cell beginning with = + - @ (or a
    // leading control char a parser may strip to reach one) is executed as a
    // formula by Excel/Sheets. Prefix with an apostrophe so it's read as text.
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return `"${s.replace(/"/g, '""')}"`;
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
