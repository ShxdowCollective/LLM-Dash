// LLM-Dash frontend.
// Serve from the repo root (for example `python -m http.server` in this repo).

(function () {
  "use strict";

  const METRIC_KEYS = ["intelligence", "coding", "agents", "speed", "cost"];
  const METRIC_LABELS = {
    intelligence: "Intelligence",
    coding: "Coding",
    agents: "Agent Tasks",
    speed: "Speed",
    cost: "Cost Score",
  };
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
    { key: "intelligence", label: "Intelligence", raw: "var(--vw-iridescent-6)" },
    { key: "coding", label: "Coding", raw: "var(--vw-iridescent-5)" },
    { key: "agents", label: "Agents", raw: "var(--vw-iridescent-4)" },
    { key: "speed", label: "Speed", raw: "var(--vw-iridescent-3)" },
  ];
  const TIER_COLOR_MAP = {
    S: "var(--vw-iridescent-6)",
    A: "var(--vw-iridescent-5)",
    B: "var(--vw-iridescent-4)",
    C: "var(--vw-iridescent-3)",
    D: "var(--vw-iridescent-2)",
    F: "var(--vw-iridescent-1)",
    "N/A": "var(--vw-surface-3)",
  };
  const TIER_FILTERS = [
    { key: null, label: "All tiers" },
    { key: "S", label: "S" },
    { key: "A", label: "A" },
    { key: "B", label: "B" },
    { key: "C", label: "C" },
    { key: "D", label: "D" },
    { key: "F", label: "F" },
  ];
  const MODEL_VIEWS = new Set(["table", "chart"]);
  const VIEW_ROUTES = {
    table: { area: "models", subview: "table" },
    chart: { area: "models", subview: "chart" },
    changelog: { area: "changelog", subview: "index" },
    stats: { area: "stats", subview: "index" },
    data: { area: "settings", subview: "provider" },
  };
  const AREA_CONFIG = {
    models: {
      label: "Models",
      deck: "Explore benchmark standings, compare model strengths, and export the current leaderboard.",
      subpages: [
        { key: "table", label: "Table", view: "table" },
        { key: "chart", label: "Chart", view: "chart" },
      ],
    },
    changelog: {
      label: "Changelog",
      deck: "Read the daily update notes behind each benchmark change.",
      subpages: [],
    },
    stats: {
      label: "Stats",
      deck: "Inspect update-run duration, token, cost, and agent-runtime trends.",
      subpages: [],
    },
    settings: {
      label: "Settings",
      deck: "Configure providers, model choices, research keys, scheduling, and manual update paths.",
      subpages: [
        { key: "provider", label: "Provider", view: "data" },
        { key: "models", label: "Models", view: "data" },
        { key: "research", label: "Research", view: "data" },
        { key: "schedule", label: "Schedule", view: "data" },
      ],
    },
  };
  const COMPACT_NUMBER = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const FULL_NUMBER = new Intl.NumberFormat("en-US");
  const MONEY = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
  const BOOTSTRAP_POLL_MS = 1000;
  const RUN_UPDATE_POLL_MS = 3000;
  const WIZARD_STEPS = ["Provider", "Models", "Test", "Exa", "LLM Stats", "Schedule", "Summary"];
  const WIZARD_SUBTITLES = [
    "Connect to your LLM provider",
    "Choose default and backup models",
    "Verify your models work",
    "Enable web research with Exa",
    "Enrich updates with LLM Stats data",
    "Set automatic update frequency",
    "Review and finish setup",
  ];
  const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const PASTE_HINT = [
    'macOS: claude "$(pbpaste)"  |  codex "$(pbpaste)"  |  gemini "$(pbpaste)"',
    'Linux: claude "$(xclip -selection clipboard -o)"  or  claude "$(wl-paste)"',
    "Windows PowerShell: claude (Get-Clipboard)  |  codex (Get-Clipboard)",
  ].join("\n");
  const UI_STATE_KEY = "llm-dash-ui-state-v1";

  const state = {
    db: null,
    SQL: null,
    ready: false,
    error: null,
    view: "table",
    area: "models",
    subview: {
      models: "table",
      changelog: "index",
      stats: "index",
      settings: "provider",
    },
    sortBy: "overall",
    ui: {
      sidebarOpen: false,
      modelFiltersCollapsed: false,
      statsFiltersCollapsed: false,
      modelInfoCollapsed: {},
      settingsCollapsed: {
        provider: false,
        models: false,
        exa: false,
        llmstats: true,
        schedule: false,
        manual: true,
      },
      statsLeaderboardSort: { sortBy: "costPerWord", direction: "asc" },
    },
    selectedModelIds: [],
    models: [],
    totalModelCount: 0,
    vendorOptions: [],
    changelogs: [],
    changelogBodies: {},
    activeChangelogDate: null,
    metrics: [],
    lastUpdated: null,
    statsSort: { key: "changelog_date", dir: "desc" },
    chartFrame: 0,
    uplots: {},
    detailUplots: {},
    detailChartFrames: {},
    scoreHistory: new Map(),
    activeChangelogTab: "read",
    changelogCompare: { from: null, to: null, active: false },
    focusedRowIndex: -1,
    helpModal: { open: false, returnFocus: null },
    uiToastShownFor: null,
    uiToastDismissed: null,
    uiToastHandle: null,
    metaPollFrame: 0,
    filter: {
      vendors: new Set(),
      text: "",
      tier: null,
      intelligenceRange: [0, 10],
      codingRange: [0, 10],
      agentsRange: [0, 10],
      speedRange: [0, 10],
      costRange: [0, 10],
    },
    statsFilter: {
      from: "",
      to: "",
      agent: "",
    },
    bootstrap: {
      supported: true,
      state: "idle",
      message: "",
      detail: "",
    },
    provider: {
      loaded: false,
      has_provider: false,
      base_url: "",
      models_override_url: "",
      chat_endpoint: "",
      models_endpoint: "",
      default_model: "",
      backup_model: "",
      endpoint_mode: "append_v1",
      exa_configured: false,
      llmstats_configured: false,
      _fetching: false,
    },
    providerPresets: {
      loaded: false,
      loading: false,
      providers: [],
      endpoint_modes: {},
    },
    schedule: {
      loaded: false,
      loading: false,
      enabled: false,
      cadence: "off",
      time_local: "09:00",
      day_of_week: 1,
      day_of_month: 1,
      utc_echo: "17:00 UTC",
      platform: "",
      manager: "",
      job_id: "",
      log_path: "",
      error: "",
    },
    wizard: {
      open: false,
      step: 0,
      mode: "setup",
      presetId: "",
      preset: null,
      baseUrl: "",
      apiKey: "",
      modelsOverrideUrl: "",
      endpointMode: "append_v1",
      requestHeaders: [],
      advancedOpen: false,
      connectionTestState: "idle",
      connectionTestError: "",
      connectionTestStatus: "",
      connectionTestSkipped: false,
      availableModels: [],
      modelsLoading: false,
      modelsError: "",
      defaultModel: "",
      backupModel: "",
      customDefaultConfirmed: false,
      customBackupConfirmed: false,
      modelTestState: "idle",
      modelTestResults: { default: null, backup: null },
      exaKey: "",
      exaSkipped: false,
      exaAlreadyConfigured: false,
      llmstatsKey: "",
      llmstatsSkipped: false,
      llmstatsAlreadyConfigured: false,
      stepSaving: false,
      scheduleCadence: "off",
      scheduleDayOfWeek: 1,
      scheduleDayOfMonth: 1,
      scheduleTimeLocal: "09:00",
      scheduleState: "idle",
      scheduleError: "",
      loading: false,
      saving: false,
      saveError: "",
      openRequestId: 0,
    },
    runUpdate: {
      active: false,
      jobId: null,
      state: "idle",
      startedAt: null,
      completedAt: null,
      tail: "",
      error: "",
      _starting: false,
      _pollInterval: null,
      _timerInterval: null,
      _raf: 0,
    },
    dataPrompt: "",
    dataPromptLoaded: false,
    dataPromptLoading: false,
    dataCopyState: "idle",
    dataCopyMessage: "",
    dataTerminalState: "idle",
    dataTerminalMessage: "",
    settings: {
      draftBaseUrl: null,
      draftEndpointMode: null,
      draftApiKey: "",
      draftDefaultModel: null,
      draftBackupModel: null,
      providerSaving: false,
      providerStatus: "",
      providerStatusTone: "idle",
      testingConnection: false,
      connectionResult: null,
      modelsLoading: false,
      modelsList: [],
      modelsError: "",
      testingDefault: false,
      testingBackup: false,
      defaultTestResult: null,
      backupTestResult: null,
      exaSaving: false,
      exaRemoving: false,
      exaConfirmRemove: false,
      draftExaKey: "",
      exaStatus: "",
      exaStatusTone: "idle",
      providerKeyRemoving: false,
      providerKeyConfirmRemove: false,
      scheduleSaving: false,
      scheduleRemoving: false,
      scheduleStatus: "",
      scheduleStatusTone: "idle",
      scheduleCadence: "off",
      scheduleTimeLocal: "09:00",
      scheduleDayOfWeek: 1,
      scheduleDayOfMonth: 1,
      showApiKey: false,
      showExaKey: false,
      llmstatsSaving: false,
      llmstatsRemoving: false,
      llmstatsConfirmRemove: false,
      draftLLMStatsKey: "",
      llmstatsStatus: "",
      llmstatsStatusTone: "idle",
      showLLMStatsKey: false,
      llmstatsTesting: false,
      llmstatsTestResult: null,
    },
    manualRefreshModal: {
      open: false,
      loading: false,
      prompt: "",
      error: "",
      copyState: "idle",
      copyMessage: "",
      terminalState: "idle",
      terminalMessage: "",
      selectPrompt: false,
    },
  };

  function avg(values) {
    const valid = values.filter((value) => value !== null && value !== undefined && value !== "");
    if (!valid.length) return null;
    const total = valid.reduce((sum, value) => sum + Number(value), 0);
    return +(total / valid.length).toFixed(1);
  }

  function getOverall(model) {
    return avg([model.intelligence, model.coding, model.agents, model.speed]);
  }

  function getValue(model) {
    const overall = getOverall(model);
    return overall !== null ? avg([overall, model.cost]) : model.cost;
  }

  function avgOverallRow(row) {
    return avg([row.intelligence, row.coding, row.agents, row.speed]);
  }

  function modelHistory(modelId) {
    return state.scoreHistory.get(modelId) || null;
  }

  function modelOverallSeries(history) {
    if (!history || !history.length) return [];
    const points = [];
    for (const row of history) {
      const value = avgOverallRow(row);
      if (value !== null && Number.isFinite(value)) points.push(value);
    }
    return points;
  }

  function sparkDelta(modelId) {
    const points = modelOverallSeries(modelHistory(modelId));
    if (points.length < 2) return null;
    return points[points.length - 1] - points[points.length - 2];
  }

  function tier(score) {
    if (score === null || score === undefined || Number.isNaN(score)) {
      return { label: "N/A", cls: "tier-N" };
    }
    if (score >= 9.0) return { label: "S", cls: "tier-S" };
    if (score >= 8.0) return { label: "A", cls: "tier-A" };
    if (score >= 7.0) return { label: "B", cls: "tier-B" };
    if (score >= 6.0) return { label: "C", cls: "tier-C" };
    if (score >= 5.0) return { label: "D", cls: "tier-D" };
    return { label: "F", cls: "tier-F" };
  }

  function barColor(score) {
    const t = tier(score);
    return TIER_COLOR_MAP[t.label] || TIER_COLOR_MAP["N/A"];
  }

  const _cssVarCache = Object.create(null);
  function resolveCSSVar(varStr) {
    if (_cssVarCache[varStr]) return _cssVarCache[varStr];
    if (!varStr || !varStr.startsWith("var(")) {
      _cssVarCache[varStr] = varStr;
      return varStr;
    }
    const prop = varStr.replace(/^var\(/, "").replace(/\)$/, "");
    const val = getComputedStyle(document.documentElement)
      .getPropertyValue(prop).trim() || varStr;
    _cssVarCache[varStr] = val;
    return val;
  }

  function colorWithAlpha(color, alpha) {
    if (typeof color !== "string") return color;
    const value = color.trim();
    const clampedAlpha = clamp(Number(alpha), 0, 1);
    const hex = value.replace(/^#/, "");
    if (/^[0-9a-f]{3}$/i.test(hex)) {
      const [r, g, b] = hex.split("").map((part) => parseInt(part + part, 16));
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }
    if (/^[0-9a-f]{6}$/i.test(hex) || /^[0-9a-f]{8}$/i.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${clampedAlpha})`;
    }
    const rgb = value.match(/^rgba?\(([^)]+)\)$/i);
    if (rgb) {
      const parts = rgb[1].split(",").map((part) => part.trim()).slice(0, 3);
      if (parts.length === 3) return `rgba(${parts.join(", ")}, ${clampedAlpha})`;
    }
    return value;
  }

  function clamp(value, lo, hi) {
    return value < lo ? lo : value > hi ? hi : value;
  }

  function sortKey(model, key) {
    if (key === "overall") return getOverall(model) ?? 0;
    if (key === "value") return getValue(model) ?? 0;
    if (key === "trend") {
      const delta = sparkDelta(model.id);
      return delta !== null ? delta : -Infinity;
    }
    return model[key] ?? 0;
  }

  function sortedModels(rows) {
    return [...rows].sort((a, b) => {
      const delta = sortKey(b, state.sortBy) - sortKey(a, state.sortBy);
      return delta || String(a.name).localeCompare(String(b.name));
    });
  }

  function routeForView(view) {
    const key = VIEW_ROUTES[view] ? view : "table";
    return { view: key, ...VIEW_ROUTES[key] };
  }

  function viewForRoute(area, subview) {
    const config = AREA_CONFIG[area] || AREA_CONFIG.models;
    if (!config.subpages.length) {
      if (area === "changelog") return "changelog";
      if (area === "stats") return "stats";
      return "table";
    }
    const match = config.subpages.find((item) => item.key === subview) || config.subpages[0];
    return match.view;
  }

  function syncRouteFromView() {
    const route = routeForView(state.view);
    state.area = route.area;
    const current = state.subview[route.area];
    if (!current || viewForRoute(route.area, current) !== state.view) {
      state.subview[route.area] = route.subview;
    }
  }

  function parseHashRoute(rawHash) {
    const raw = String(rawHash || "").replace(/^#/, "").trim();
    if (!raw) return { view: "table", area: "models", subview: "table", params: {} };
    const [pathPart, queryPart] = raw.split("?");
    const params = {};
    if (queryPart) {
      for (const segment of queryPart.split("&")) {
        if (!segment) continue;
        const [k, v] = segment.split("=");
        if (k) params[decodeURIComponent(k)] = v === undefined ? "" : decodeURIComponent(v);
      }
    }
    const legacy = {
      table: { view: "table", area: "models", subview: "table" },
      chart: { view: "chart", area: "models", subview: "chart" },
      changelog: { view: "changelog", area: "changelog", subview: "index" },
      stats: { view: "stats", area: "stats", subview: "index" },
      data: { view: "data", area: "settings", subview: "provider" },
      settings: { view: "data", area: "settings", subview: "provider" },
    };
    if (legacy[pathPart]) return { ...legacy[pathPart], params };
    const [area, subview] = pathPart.split("/");
    if (!AREA_CONFIG[area]) return { ...legacy.table, params };
    const normalizedSubview = subview || (AREA_CONFIG[area].subpages[0] && AREA_CONFIG[area].subpages[0].key) || "index";
    return { view: viewForRoute(area, normalizedSubview), area, subview: normalizedSubview, params };
  }

  function hashForRoute(area, subview, params) {
    let base;
    if (area === "models") base = "#models/" + (subview === "chart" ? "chart" : "table");
    else if (area === "settings") base = "#settings/" + (subview || "provider");
    else base = "#" + area;
    if (params && typeof params === "object") {
      const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "");
      if (entries.length) {
        return base + "?" + entries.map(([k, v]) => encodeURIComponent(k) + "=" + encodeURIComponent(v)).join("&");
      }
    }
    return base;
  }

  function currentRouteParams() {
    if (state.area === "changelog" && state.activeChangelogTab === "compare") {
      const params = { tab: "compare" };
      if (state.changelogCompare.from) params.from = state.changelogCompare.from;
      if (state.changelogCompare.to) params.to = state.changelogCompare.to;
      return params;
    }
    return null;
  }

  function applyRoute(route, options) {
    const next = route || parseHashRoute(location.hash);
    state.view = next.view;
    state.area = next.area;
    state.subview[next.area] = next.subview;
    if (next.area === "changelog" && next.params) {
      const tab = next.params.tab === "compare" ? "compare" : "read";
      state.activeChangelogTab = tab;
      if (tab === "compare") {
        state.changelogCompare.active = true;
        state.changelogCompare.from = next.params.from || state.changelogCompare.from || null;
        state.changelogCompare.to = next.params.to || state.changelogCompare.to || null;
      }
    } else if (next.area === "changelog") {
      state.activeChangelogTab = "read";
    }
    if (options && options.updateHash) {
      const hash = hashForRoute(state.area, state.subview[state.area], currentRouteParams());
      if (location.hash !== hash) {
        const url = location.pathname + location.search + hash;
        if (options.replace) history.replaceState({}, "", url);
        else history.pushState({}, "", url);
      }
    }
  }

  function pushChangelogRouteHash(replace) {
    const hash = hashForRoute(state.area, state.subview[state.area], currentRouteParams());
    if (location.hash === hash) return;
    const url = location.pathname + location.search + hash;
    if (replace) history.replaceState({}, "", url);
    else history.pushState({}, "", url);
  }

  const HEX_COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

  function safeHex(color, fallback) {
    return typeof color === "string" && HEX_COLOR_RE.test(color.trim()) ? color.trim() : fallback;
  }

  function h(tag, attrs, children) {
    const el = document.createElement(tag);
    if (attrs) {
      for (const key in attrs) {
        const value = attrs[key];
        if (value === null || value === undefined || value === false) continue;
        if (key === "class") el.className = value;
        else if (key === "style") {
          if (value && typeof value === "object") Object.assign(el.style, value);
        } else if (key === "dataset") {
          if (value && typeof value === "object") Object.assign(el.dataset, value);
        } else if (key === "value") {
          el.value = value;
        } else if (key === "checked") {
          el.checked = Boolean(value);
        } else if (key === "disabled") {
          el.disabled = Boolean(value);
        } else if (key === "selected") {
          el.selected = Boolean(value);
        } else if (key.startsWith("on") && typeof value === "function") {
          el.addEventListener(key.slice(2), value);
        } else {
          el.setAttribute(key, value);
        }
      }
    }
    if (children !== undefined && children !== null) {
      const list = Array.isArray(children) ? children : [children];
      for (const child of list) {
        if (child === null || child === undefined || child === false) continue;
        el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
      }
    }
    return el;
  }

  const ICONS = {
    "chevron-down": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>',
    "refresh-cw": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>',
    "filter-x": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z"/><line x1="18" y1="8" x2="22" y2="12"/><line x1="22" y1="8" x2="18" y2="12"/></svg>',
    "x": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    "settings": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>',
    "eye": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
    "eye-off": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>',
    "trash": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>',
    "plus": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>',
  };

  function icon(name) {
    const span = document.createElement("span");
    span.className = "icon";
    span.innerHTML = ICONS[name] || "";
    span.setAttribute("aria-hidden", "true");
    return span;
  }

  function captureFocus() {
    const active = document.activeElement;
    if (!active || !active.id) return null;
    const snapshot = { id: active.id };
    if ("selectionStart" in active) {
      snapshot.start = active.selectionStart;
      snapshot.end = active.selectionEnd;
    }
    return snapshot;
  }

  function restoreFocus(snapshot) {
    if (!snapshot) return;
    const el = document.getElementById(snapshot.id);
    if (!el) return;
    el.focus({ preventScroll: true });
    if ("selectionStart" in el && snapshot.start !== undefined && snapshot.end !== undefined) {
      try {
        el.setSelectionRange(snapshot.start, snapshot.end);
      } catch (_) {
        // noop
      }
    }
  }

  function getStoredUIState() {
    try {
      const raw = window.localStorage.getItem(UI_STATE_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch (error) {
      return {};
    }
  }

  function applyStoredUIState() {
    const stored = getStoredUIState();
    if (typeof stored.modelFiltersCollapsed === "boolean") {
      state.ui.modelFiltersCollapsed = stored.modelFiltersCollapsed;
    }
    if (typeof stored.statsFiltersCollapsed === "boolean") {
      state.ui.statsFiltersCollapsed = stored.statsFiltersCollapsed;
    }
    if (stored.modelInfoCollapsed && typeof stored.modelInfoCollapsed === "object" && !Array.isArray(stored.modelInfoCollapsed)) {
      state.ui.modelInfoCollapsed = Object.fromEntries(
        Object.entries(stored.modelInfoCollapsed).filter(([key, value]) => /^\d+$/.test(key) && typeof value === "boolean")
      );
    }
    if (stored.settingsCollapsed && typeof stored.settingsCollapsed === "object") {
      Object.assign(state.ui.settingsCollapsed, stored.settingsCollapsed);
    }
    if (stored.statsLeaderboardSort && typeof stored.statsLeaderboardSort === "object") {
      const allowedKeys = new Set(["runs", "totalCost", "costPerWord", "wordsPerDollar", "minDuration"]);
      const allowedDir = new Set(["asc", "desc"]);
      const next = { ...state.ui.statsLeaderboardSort };
      if (allowedKeys.has(stored.statsLeaderboardSort.sortBy)) next.sortBy = stored.statsLeaderboardSort.sortBy;
      if (allowedDir.has(stored.statsLeaderboardSort.direction)) next.direction = stored.statsLeaderboardSort.direction;
      state.ui.statsLeaderboardSort = next;
    }
  }

  function consumeResetLaunchFlag() {
    const url = new URL(window.location.href);
    const shouldReset = url.searchParams.get("reset") === "1";
    if (!shouldReset) return false;
    try {
      window.localStorage.removeItem(UI_STATE_KEY);
    } catch (error) {
      // localStorage is best-effort here; no action needed if unavailable.
    }
    url.searchParams.delete("reset");
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    return true;
  }

  function persistUIState() {
    try {
      window.localStorage.setItem(UI_STATE_KEY, JSON.stringify(state.ui));
    } catch (error) {
      // localStorage is best-effort here; no action needed if unavailable.
    }
  }

  function toggleModelFiltersCollapsed() {
    state.ui.modelFiltersCollapsed = !state.ui.modelFiltersCollapsed;
    persistUIState();
    render();
  }

  function toggleStatsFiltersCollapsed() {
    state.ui.statsFiltersCollapsed = !state.ui.statsFiltersCollapsed;
    persistUIState();
    render();
  }

  const MAX_COMPARISON_MODELS = 5;

  function toggleModelSelection(modelId) {
    const idx = state.selectedModelIds.indexOf(modelId);
    if (idx !== -1) {
      state.selectedModelIds.splice(idx, 1);
      delete state.ui.modelInfoCollapsed[String(modelId)];
      destroyDetailUplot("detail-chart-" + modelId);
      persistUIState();
    } else if (state.selectedModelIds.length < MAX_COMPARISON_MODELS) {
      state.selectedModelIds.push(modelId);
    } else {
      const evicted = state.selectedModelIds.shift();
      delete state.ui.modelInfoCollapsed[String(evicted)];
      destroyDetailUplot("detail-chart-" + evicted);
      state.selectedModelIds.push(modelId);
      persistUIState();
    }
    render();
  }

  function toggleSingleModelCollapse(modelId) {
    const key = String(modelId);
    state.ui.modelInfoCollapsed[key] = !state.ui.modelInfoCollapsed[key];
    persistUIState();
    render();
  }

  function handleModelSelectionKey(event, modelId) {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    toggleModelSelection(modelId);
  }

  function renderCollapsiblePanel({
    id,
    title,
    summary,
    actions,
    collapsed,
    onToggle,
    children,
  }) {
    const chevron = icon("chevron-down");
    chevron.classList.add("panel-chevron");
    if (collapsed) chevron.classList.add("is-collapsed");
    const hitarea = h("button", {
      class: "panel-toggle-hitarea",
      type: "button",
      "aria-expanded": String(!collapsed),
      "aria-controls": id + "-body",
      "aria-label": collapsed ? `Expand ${title}` : `Collapse ${title}`,
      onclick: onToggle,
    }, [
      h("span", { class: "panel-title" }, title),
      summary ? h("span", { class: "panel-summary" }, summary) : null,
      chevron,
    ]);
    const nodes = [
      h("div", { class: "panel-head" }, [
        hitarea,
        (actions && actions.length) ? h("div", { class: "panel-head-right" }, actions) : null,
      ]),
      h("div", {
        class: "panel-body" + (collapsed ? " is-hidden" : ""),
        id: id + "-body",
        hidden: collapsed,
      }, children),
    ];
    return h("section", { class: "panel-shell", id: id }, nodes);
  }

  function humanAge(ms) {
    if (ms < 0) ms = 0;
    const seconds = Math.floor(ms / 1000);
    if (seconds < 60) return seconds + "s ago";
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return minutes + "m ago";
    const hours = Math.floor(minutes / 60);
    if (hours < 48) return hours + "h ago";
    return Math.floor(hours / 24) + "d ago";
  }

  function formatDate(dateLike) {
    if (!dateLike) return "Unknown";
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateLike) ? dateLike + "T00:00:00Z" : dateLike;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(dateLike);
    return date.toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      timeZone: "UTC",
    });
  }

  function formatShortDate(dateLike) {
    if (!dateLike) return "Unknown";
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(dateLike) ? dateLike + "T00:00:00Z" : dateLike;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return String(dateLike);
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function formatTimestamp(value) {
    if (!value) return "—";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  }

  function formatNumber(value, digits) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return number.toLocaleString("en-US", {
      minimumFractionDigits: digits || 0,
      maximumFractionDigits: digits || 0,
    });
  }

  function formatCompactNumber(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return COMPACT_NUMBER.format(number);
  }

  function formatScore(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    return Number.isFinite(number) ? number.toFixed(1) : "—";
  }

  function formatCurrency(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number)) return "—";
    return MONEY.format(number);
  }

  function formatMicroCost(value) {
    if (value === null || value === undefined || value === "") return "—";
    const number = Number(value);
    if (!Number.isFinite(number) || number === 0) return "—";
    if (number >= 0.01) return MONEY.format(number);
    return "$" + number.toPrecision(4);
  }

  function formatDuration(value) {
    if (value === null || value === undefined || value === "") return "—";
    const seconds = Number(value);
    if (!Number.isFinite(seconds)) return "—";
    if (seconds < 60) return seconds.toFixed(seconds >= 10 ? 0 : 1) + "s";
    const minutes = Math.floor(seconds / 60);
    const remainder = Math.round(seconds % 60);
    return minutes + "m " + remainder + "s";
  }

  function formatAgentKey(row) {
    return (row.agent_name || "") + "|" + (row.agent_runtime || "");
  }

  const SPARK_WIDTH = 80;
  const SPARK_HEIGHT = 24;
  const SPARK_MIN = 0;
  const SPARK_MAX = 10;

  function renderSparkline(modelId) {
    const points = modelOverallSeries(modelHistory(modelId));
    const wrap = document.createElement("span");
    if (points.length < 2) {
      wrap.className = "spark spark-empty";
      wrap.setAttribute("aria-label", "no trend yet");
      wrap.textContent = "—";
      return wrap;
    }
    const stepX = SPARK_WIDTH / (points.length - 1);
    let pathD = "";
    for (let i = 0; i < points.length; i++) {
      const x = (i * stepX).toFixed(2);
      const yNorm = (points[i] - SPARK_MIN) / (SPARK_MAX - SPARK_MIN);
      const y = (SPARK_HEIGHT - yNorm * SPARK_HEIGHT).toFixed(2);
      pathD += (i === 0 ? "M" : "L") + x + "," + y + " ";
    }
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const delta = last - prev;
    const colorVar =
      delta > 0.05 ? "--vw-iridescent-3" :
      delta < -0.05 ? "--vw-iridescent-7" :
      "--vw-iridescent-5";
    const lastX = ((points.length - 1) * stepX).toFixed(2);
    const lastY = (SPARK_HEIGHT - ((last - SPARK_MIN) / (SPARK_MAX - SPARK_MIN)) * SPARK_HEIGHT).toFixed(2);
    wrap.className = "spark";
    wrap.setAttribute("role", "img");
    wrap.setAttribute("aria-label", points.length + "-point overall trend, latest " + last.toFixed(1));
    wrap.innerHTML =
      '<svg width="' + SPARK_WIDTH + '" height="' + SPARK_HEIGHT + '" viewBox="0 0 ' + SPARK_WIDTH + ' ' + SPARK_HEIGHT + '">' +
        '<path d="' + pathD.trim() + '" fill="none" stroke="var(' + colorVar + ')" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
        '<circle cx="' + lastX + '" cy="' + lastY + '" r="1.8" fill="var(' + colorVar + ')"/>' +
      '</svg>';
    return wrap;
  }

  function formatAgentLabel(row) {
    const agent = row.agent_name || "unknown";
    const provider = row.agent_runtime || "unknown";
    return agent + " · " + provider;
  }

  function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes ? minutes + "m " + seconds + "s" : seconds + "s";
  }

  function normalizeAssetPath(path) {
    if (!path) return "";
    if (/^(?:https?:)?\/\//.test(path)) return path;
    return path.startsWith("/") ? path : "/" + path.replace(/^\.?\//, "");
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, Object.assign({ cache: "no-store" }, options));
    let data = null;
    const text = await response.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch (_) {
        data = null;
      }
    }
    if (!response.ok) {
      const error = new Error(
        (data && (data.detail || data.error || data.message)) || ("HTTP " + response.status)
      );
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data || {};
  }

  function selectText(el) {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.select();
    if (typeof el.setSelectionRange === "function") {
      el.setSelectionRange(0, el.value.length);
    }
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.inset = "0";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    selectText(textarea);
    let ok = false;
    try {
      ok = typeof document.execCommand === "function" && document.execCommand("copy");
    } catch (_) {
      ok = false;
    }
    textarea.remove();
    return ok;
  }

  async function copyText(text) {
    if (!text) {
      return { ok: false, tone: "warning", message: "No prompt to copy yet." };
    }
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      try {
        await navigator.clipboard.writeText(text);
        return { ok: true, tone: "success", message: "Prompt copied to clipboard." };
      } catch (_) {
        // Fall through to the legacy path below.
      }
    }
    if (fallbackCopyText(text)) {
      return { ok: true, tone: "success", message: "Prompt copied with the fallback path." };
    }
    return {
      ok: false,
      tone: "warning",
      message: "Clipboard API is blocked here. Copy the selected prompt manually.",
    };
  }

  function stripFrontmatter(markdown) {
    return markdown.replace(/^---\s*\r?\n[\s\S]*?\r?\n---\s*\r?\n?/, "");
  }

  async function loadDB() {
    if (typeof WebAssembly === "undefined") {
      throw new Error("WebAssembly unavailable in this browser.");
    }
    if (typeof window.initSqlJs !== "function") {
      throw new Error("sql.js loader missing — vendor/sql-wasm.js failed to load.");
    }
    const SQL = await window.initSqlJs({
      locateFile: (filename) => "vendor/" + filename,
    });
    state.SQL = SQL;
    const response = await fetch("/data/dash.sqlite", { cache: "no-store" });
    if (!response.ok) {
      const error = new Error("DB fetch failed: HTTP " + response.status);
      error.code = "db-missing";
      throw error;
    }
    const buffer = new Uint8Array(await response.arrayBuffer());
    return new SQL.Database(buffer);
  }

  function syncBootstrapStatus(payload) {
    state.bootstrap.supported = true;
    state.bootstrap.state = payload.state || "unknown";
    state.bootstrap.message = payload.message || "";
    state.bootstrap.detail = payload.detail || "";
  }

  async function fetchBootstrapStatus() {
    try {
      const payload = await fetchJson("/api/bootstrap-status");
      syncBootstrapStatus(payload);
      return payload;
    } catch (error) {
      if (error.status === 404) {
        state.bootstrap.supported = false;
        state.bootstrap.state = "unsupported";
        state.bootstrap.message = "";
        state.bootstrap.detail = "";
        return null;
      }
      throw error;
    }
  }

  async function fetchProvider() {
    try {
      const payload = await fetchJson("/api/provider");
      Object.assign(state.provider, payload, { loaded: true });
    } catch (_) {
      state.provider.loaded = true;
    }
  }

  async function fetchProviderPresets() {
    if (state.providerPresets.loaded || state.providerPresets.loading) return;
    state.providerPresets.loading = true;
    try {
      const payload = await fetchJson("/api/provider-presets");
      state.providerPresets.providers = Array.isArray(payload.providers) ? payload.providers : [];
      state.providerPresets.endpoint_modes = payload.endpoint_modes || {};
      state.providerPresets.loaded = true;
    } catch (_) {
      state.providerPresets.loaded = true;
    } finally {
      state.providerPresets.loading = false;
    }
  }

  async function fetchSchedule() {
    if (state.schedule.loading) return;
    state.schedule.loading = true;
    try {
      const payload = await fetchJson("/api/schedule");
      Object.assign(state.schedule, payload, { loaded: true, loading: false, error: "" });
    } catch (error) {
      state.schedule.loaded = true;
      state.schedule.loading = false;
      state.schedule.error = String((error && error.message) || error);
    }
  }

  function providerById(id) {
    return state.providerPresets.providers.find((preset) => preset.id === id) || null;
  }

  function stripTrailingSlash(value) {
    return String(value || "").trim().replace(/\/+$/, "");
  }

  function isModelsEndpointUrl(value) {
    try {
      const url = new URL(String(value || "").trim());
      return url.pathname.replace(/\/+$/, "").endsWith("/models");
    } catch (_) {
      return false;
    }
  }

  function endpointPreview(baseUrl, endpointMode, modelsOverrideUrl) {
    const base = stripTrailingSlash(baseUrl);
    const modelsOverride = stripTrailingSlash(modelsOverrideUrl);
    if (!base) return { chat: "—", models: "—" };
    const root = endpointMode === "root" ? base : base + "/v1";
    return {
      chat: root + "/chat/completions",
      models: modelsOverride
        ? isModelsEndpointUrl(modelsOverride)
          ? modelsOverride
          : (endpointMode === "root" ? modelsOverride : modelsOverride + "/v1") + "/models"
        : root + "/models",
    };
  }

  function wizardScheduleUtcEcho() {
    const parts = String(state.wizard.scheduleTimeLocal || "09:00").split(":");
    const date = new Date();
    date.setHours(Number(parts[0] || 9), Number(parts[1] || 0), 0, 0);
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "UTC",
      timeZoneName: "short",
    });
  }

  function redactSecret(value) {
    const text = String(value || "");
    if (!text) return "not shown";
    return text.length > 4 ? "***" + text.slice(-4) : "***";
  }

  function wizardPayload(includeModels) {
    const headers = {};
    for (const row of state.wizard.requestHeaders) {
      const name = String(row.name || "").trim();
      const value = String(row.value || "").trim();
      if (name && value) headers[name] = value;
    }
    return {
      base_url: state.wizard.baseUrl.trim(),
      api_key: state.wizard.apiKey.trim() || null,
      models_override_url: state.wizard.modelsOverrideUrl.trim(),
      endpoint_mode: state.wizard.endpointMode || "append_v1",
      request_headers: headers,
      default_model: includeModels || state.provider.has_provider ? state.wizard.defaultModel.trim() : "",
      backup_model: includeModels || state.provider.has_provider ? state.wizard.backupModel.trim() : "",
    };
  }

  function modelExamples() {
    const preset = state.wizard.preset;
    if (!preset) return [];
    if (Array.isArray(preset.model_examples) && preset.model_examples.length) return preset.model_examples;
    const examples = Array.isArray(preset.examples) ? preset.examples.flatMap((item) => item.model_examples || []) : [];
    return [...new Set(examples)];
  }

  function modelExists(modelId) {
    if (!modelId) return true;
    return state.wizard.availableModels.some((model) => model.id === modelId);
  }

  function resetWizardFromCurrent(startStep, options) {
    const scheduleCadence = state.schedule.enabled ? (state.schedule.cadence || "off") : "off";
    const requestId = options && Number.isFinite(options.requestId)
      ? options.requestId
      : state.wizard.openRequestId;
    Object.assign(state.wizard, {
      open: true,
      openRequestId: requestId,
      step: startStep || 0,
      mode: state.provider.has_provider ? "reconfigure" : "setup",
      presetId: "",
      preset: null,
      baseUrl: state.provider.base_url || "",
      apiKey: "",
      modelsOverrideUrl: state.provider.models_override_url || "",
      endpointMode: state.provider.endpoint_mode || "append_v1",
      requestHeaders: [],
      advancedOpen: false,
      connectionTestState: "idle",
      connectionTestError: "",
      connectionTestStatus: "",
      connectionTestSkipped: false,
      availableModels: [],
      modelsLoading: false,
      modelsError: "",
      defaultModel: state.provider.default_model || "",
      backupModel: state.provider.backup_model || "",
      customDefaultConfirmed: false,
      customBackupConfirmed: false,
      modelTestState: "idle",
      modelTestResults: { default: null, backup: null },
      exaKey: "",
      exaSkipped: false,
      exaAlreadyConfigured: Boolean(state.provider.exa_configured),
      llmstatsKey: "",
      llmstatsSkipped: false,
      llmstatsAlreadyConfigured: Boolean(state.provider.llmstats_configured),
      stepSaving: false,
      scheduleCadence,
      scheduleDayOfWeek: Number(state.schedule.day_of_week || 1),
      scheduleDayOfMonth: Number(state.schedule.day_of_month || 1),
      scheduleTimeLocal: state.schedule.time_local || "09:00",
      scheduleState: "idle",
      scheduleError: "",
      loading: Boolean(options && options.loading),
      saving: false,
      saveError: "",
    });
  }

  async function openWizard(startStep) {
    const requestId = state.wizard.openRequestId + 1;
    resetWizardFromCurrent(startStep || 0, { loading: true, requestId });
    render();
    await Promise.all([fetchProviderPresets(), fetchSchedule()]);
    if (!state.wizard.open || state.wizard.openRequestId !== requestId) return;
    resetWizardFromCurrent(startStep || 0, { loading: false, requestId });
    if (!state.wizard.baseUrl && state.providerPresets.providers.length) {
      applyWizardPreset(state.providerPresets.providers[0].id, false);
    }
    render();
    if (state.wizard.step === 1) ensureWizardModelsLoaded();
  }

  function closeWizard(shouldRender) {
    state.wizard.open = false;
    state.wizard.openRequestId += 1;
    state.wizard.loading = false;
    state.wizard.saving = false;
    state.wizard.saveError = "";
    if (shouldRender !== false) render();
  }

  function applyWizardPreset(presetId, shouldRender) {
    const preset = providerById(presetId);
    state.wizard.presetId = presetId;
    state.wizard.preset = preset;
    if (preset) {
      state.wizard.baseUrl = preset.default_base_url || "";
      state.wizard.modelsOverrideUrl = preset.models_override_url || "";
      state.wizard.endpointMode = preset.endpoint_mode || "append_v1";
      state.wizard.connectionTestState = "idle";
      state.wizard.connectionTestError = "";
      state.wizard.connectionTestSkipped = false;
      state.wizard.availableModels = [];
      state.wizard.modelsError = "";
      const examples = modelExamples();
      if (!state.wizard.defaultModel && examples[0]) state.wizard.defaultModel = examples[0];
      if (!state.wizard.backupModel && examples[1]) state.wizard.backupModel = examples[1];
    }
    if (shouldRender !== false) render();
  }

  async function testWizardConnection() {
    state.wizard.connectionTestState = "testing";
    state.wizard.connectionTestError = "";
    state.wizard.connectionTestStatus = "";
    render();
    try {
      const payload = await fetchJson("/api/provider/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wizardPayload(false)),
      });
      state.wizard.connectionTestState = payload.ok ? "success" : "failed";
      state.wizard.connectionTestStatus = payload.models_count !== undefined
        ? payload.models_count + " models visible"
        : "Connection returned HTTP " + payload.status_code;
      if (!payload.ok) state.wizard.connectionTestError = "Models endpoint returned HTTP " + payload.status_code + ".";
    } catch (error) {
      state.wizard.connectionTestState = "failed";
      state.wizard.connectionTestError = String((error && error.message) || error);
    }
    render();
  }

  async function saveProviderFromWizard(includeModels) {
    const payload = wizardPayload(includeModels);
    if (!payload.base_url) throw new Error("BASE_URL is required.");
    if (!state.provider.has_provider && !payload.api_key) throw new Error("API_KEY is required.");
    if (includeModels && !payload.default_model) throw new Error("Default model is required.");
    const saved = await fetchJson("/api/provider", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    Object.assign(state.provider, saved, { loaded: true });
  }

  async function ensureWizardModelsLoaded() {
    if (state.wizard.modelsLoading || state.wizard.availableModels.length) return;
    state.wizard.modelsLoading = true;
    state.wizard.modelsError = "";
    render();
    try {
      const payload = await fetchJson("/api/provider/models");
      state.wizard.availableModels = Array.isArray(payload.models) ? payload.models : [];
    } catch (error) {
      state.wizard.modelsError = String((error && error.message) || error);
      state.wizard.availableModels = modelExamples().map((id) => ({ id, name: id }));
    } finally {
      state.wizard.modelsLoading = false;
      render();
    }
  }

  async function runWizardModelTests() {
    state.wizard.modelTestState = "testing";
    state.wizard.modelTestResults = {
      default: { state: "testing", message: "Testing " + state.wizard.defaultModel },
      backup: state.wizard.backupModel ? { state: "pending", message: "Queued" } : { state: "success", message: "No backup model set." },
    };
    render();
    for (const target of ["default", "backup"]) {
      if (target === "backup" && !state.wizard.backupModel) continue;
      state.wizard.modelTestResults[target] = { state: "testing", message: "Testing " + (target === "default" ? state.wizard.defaultModel : state.wizard.backupModel) };
      render();
      try {
        const payload = await fetchJson("/api/provider/test-model", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ target }),
        });
        state.wizard.modelTestResults[target] = {
          state: payload.ok ? "success" : "failed",
          message: payload.ok ? "HTTP " + payload.status_code + " · " + (payload.output || "ok") : "HTTP " + payload.status_code,
        };
        if (!payload.ok) throw new Error(target + " model failed.");
      } catch (error) {
        state.wizard.modelTestResults[target] = { state: "failed", message: String((error && error.message) || error) };
        state.wizard.modelTestState = "failed";
        render();
        return;
      }
    }
    state.wizard.modelTestState = "success";
    render();
  }

  async function saveWizardExa() {
    if (!state.wizard.exaKey.trim() || state.wizard.exaAlreadyConfigured || state.wizard.exaSkipped) return;
    const payload = await fetchJson("/api/exa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: state.wizard.exaKey.trim() }),
    });
    state.provider.exa_configured = Boolean(payload.exa_configured);
    state.wizard.exaAlreadyConfigured = state.provider.exa_configured;
  }

  async function saveWizardLLMStats() {
    if (!state.wizard.llmstatsKey.trim() || state.wizard.llmstatsAlreadyConfigured || state.wizard.llmstatsSkipped) return;
    const payload = await fetchJson("/api/llmstats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: state.wizard.llmstatsKey.trim() }),
    });
    state.provider.llmstats_configured = Boolean(payload.llmstats_configured);
    state.wizard.llmstatsAlreadyConfigured = state.provider.llmstats_configured;
  }

  async function saveWizardSchedule() {
    state.wizard.scheduleState = "saving";
    state.wizard.scheduleError = "";
    render();
    try {
      const payload = {
        cadence: state.wizard.scheduleCadence,
        time_local: state.wizard.scheduleTimeLocal,
        day_of_week: Number(state.wizard.scheduleDayOfWeek || 1),
        day_of_month: Number(state.wizard.scheduleDayOfMonth || 1),
      };
      const saved = payload.cadence === "off"
        ? await fetchJson("/api/schedule", { method: "DELETE" })
        : await fetchJson("/api/schedule", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
      Object.assign(state.schedule, saved, { loaded: true, error: "" });
      state.wizard.scheduleState = "success";
    } catch (error) {
      state.wizard.scheduleState = "failed";
      state.wizard.scheduleError = String((error && error.message) || error);
      throw error;
    } finally {
      render();
    }
  }

  async function wizardNext() {
    if (state.wizard.saving || state.wizard.stepSaving) return;
    state.wizard.saveError = "";
    state.wizard.stepSaving = true;
    render();
    try {
      if (state.wizard.step === 0) {
        await saveProviderFromWizard(false);
        state.wizard.step = 1;
        render();
        ensureWizardModelsLoaded();
        return;
      }
      if (state.wizard.step === 1) {
        if (!modelExists(state.wizard.defaultModel) && !state.wizard.customDefaultConfirmed) {
          state.wizard.saveError = "Confirm the custom default model ID.";
          render();
          return;
        }
        if (state.wizard.backupModel && !modelExists(state.wizard.backupModel) && !state.wizard.customBackupConfirmed) {
          state.wizard.saveError = "Confirm the custom backup model ID.";
          render();
          return;
        }
        await saveProviderFromWizard(true);
        state.wizard.step = 2;
        render();
        runWizardModelTests();
        return;
      }
      if (state.wizard.step === 2) {
        if (state.wizard.modelTestState !== "success") return;
        var nextAfterTest = 3;
        if (state.wizard.exaAlreadyConfigured) nextAfterTest = state.wizard.llmstatsAlreadyConfigured ? 5 : 4;
        state.wizard.step = nextAfterTest;
        render();
        return;
      }
      if (state.wizard.step === 3) {
        await saveWizardExa();
        state.wizard.step = state.wizard.llmstatsAlreadyConfigured ? 5 : 4;
        render();
        return;
      }
      if (state.wizard.step === 4) {
        if (!state.wizard.llmstatsAlreadyConfigured && !state.wizard.llmstatsKey.trim()) {
          state.wizard.llmstatsSkipped = true;
        }
        await saveWizardLLMStats();
        state.wizard.step = 5;
        render();
        return;
      }
      if (state.wizard.step === 5) {
        await saveWizardSchedule();
        state.wizard.step = 6;
        render();
        return;
      }
      if (state.wizard.step === 6) {
        state.wizard.saving = true;
        state.wizard.stepSaving = false;
        render();
        await fetchProvider();
        await fetchSchedule();
        closeWizard(false);
        startRunUpdate();
      }
    } catch (error) {
      state.wizard.saving = false;
      state.wizard.saveError = String((error && error.message) || error);
      render();
    } finally {
      if (state.wizard.open) {
        state.wizard.stepSaving = false;
        render();
      }
    }
  }

  function wizardBack() {
    if (state.wizard.saving || state.wizard.stepSaving || state.wizard.step === 0) return;
    state.wizard.step -= 1;
    render();
    if (state.wizard.step === 1) ensureWizardModelsLoaded();
  }

  function wizardSkip() {
    if (state.wizard.step === 0 && state.wizard.connectionTestState === "failed") {
      state.wizard.connectionTestSkipped = true;
      wizardNext();
    } else if (state.wizard.step === 3) {
      if (window.confirm("Skip Exa? Updates can still run, but web research may hit provider limits.")) {
        state.wizard.exaSkipped = true;
        state.wizard.step = state.wizard.llmstatsAlreadyConfigured ? 5 : 4;
        render();
      }
    } else if (state.wizard.step === 4) {
      state.wizard.llmstatsSkipped = true;
      state.wizard.step = 5;
      render();
    } else if (state.wizard.step === 5) {
      state.wizard.scheduleCadence = "off";
      wizardNext();
    }
  }

  async function waitForBootstrapReady() {
    const first = await fetchBootstrapStatus();
    if (!first) return;
    const shownAt = state.bootstrap.state === "initializing" ? Date.now() : null;
    if (state.bootstrap.state === "initializing") render();
    while (state.bootstrap.state === "initializing") {
      await sleep(BOOTSTRAP_POLL_MS);
      await fetchBootstrapStatus();
      render();
    }
    if (shownAt) {
      const remaining = 300 - (Date.now() - shownAt);
      if (remaining > 0) await sleep(remaining);
    }
    if (state.bootstrap.state === "error") {
      const error = new Error(state.bootstrap.detail || state.bootstrap.message || "dashboard bootstrap failed");
      error.code = "bootstrap-failed";
      throw error;
    }
  }

  function applyCopyResult(result) {
    state.manualRefreshModal.copyState = result.tone;
    state.manualRefreshModal.copyMessage = result.message;
    state.manualRefreshModal.selectPrompt = !result.ok;
  }

  function closeManualRefreshModal() {
    state.manualRefreshModal.open = false;
    state.manualRefreshModal.loading = false;
    state.manualRefreshModal.error = "";
    state.manualRefreshModal.terminalState = "idle";
    state.manualRefreshModal.terminalMessage = "";
    state.manualRefreshModal.selectPrompt = false;
    render();
  }

  async function copyManualPromptAgain() {
    if (!state.manualRefreshModal.prompt) return;
    const result = await copyText(state.manualRefreshModal.prompt);
    applyCopyResult(result);
    render();
  }

  async function openManualRefreshModal() {
    state.runUpdate.error = "";
    state.manualRefreshModal.open = true;
    state.manualRefreshModal.loading = true;
    state.manualRefreshModal.prompt = "";
    state.manualRefreshModal.error = "";
    state.manualRefreshModal.copyState = "idle";
    state.manualRefreshModal.copyMessage = "";
    state.manualRefreshModal.terminalState = "idle";
    state.manualRefreshModal.terminalMessage = "";
    state.manualRefreshModal.selectPrompt = false;
    render();

    try {
      const payload = await fetchJson("/api/prompt");
      state.manualRefreshModal.prompt = payload.prompt || "";
      state.manualRefreshModal.loading = false;
      const result = await copyText(state.manualRefreshModal.prompt);
      applyCopyResult(result);
    } catch (error) {
      state.manualRefreshModal.loading = false;
      state.manualRefreshModal.error = String((error && error.message) || error);
      state.manualRefreshModal.copyState = "error";
      state.manualRefreshModal.copyMessage = "Couldn't fetch the update prompt.";
    }
    render();
  }

  async function openTerminalForManual() {
    state.manualRefreshModal.terminalState = "warning";
    state.manualRefreshModal.terminalMessage = "Opening terminal…";
    render();
    try {
      const payload = await fetchJson("/api/open-terminal", { method: "POST" });
      state.manualRefreshModal.terminalState = "success";
      state.manualRefreshModal.terminalMessage = payload.launcher
        ? "Opened " + payload.launcher + " in the repo."
        : "Opened a terminal in the repo.";
    } catch (error) {
      state.manualRefreshModal.terminalState = "error";
      state.manualRefreshModal.terminalMessage = String((error && error.message) || error);
    }
    render();
  }

  async function openTerminalForData() {
    state.dataTerminalState = "warning";
    state.dataTerminalMessage = "Opening terminal…";
    render();
    try {
      const payload = await fetchJson("/api/open-terminal", { method: "POST" });
      state.dataTerminalState = "success";
      state.dataTerminalMessage = payload.launcher
        ? "Opened " + payload.launcher + " in the repo."
        : "Opened a terminal in the repo.";
    } catch (error) {
      state.dataTerminalState = "error";
      state.dataTerminalMessage = String((error && error.message) || error);
    }
    render();
  }

  function resetRunUpdate(keepError) {
    if (state.runUpdate._pollInterval) window.clearInterval(state.runUpdate._pollInterval);
    if (state.runUpdate._timerInterval) window.clearInterval(state.runUpdate._timerInterval);
    if (state.runUpdate._raf) window.cancelAnimationFrame(state.runUpdate._raf);
    const error = keepError ? state.runUpdate.error : "";
    Object.assign(state.runUpdate, {
      active: false,
      jobId: null,
      state: "idle",
      startedAt: null,
      completedAt: null,
      tail: "",
      error,
      _starting: false,
      _pollInterval: null,
      _timerInterval: null,
      _raf: 0,
    });
  }

  function closeRunUpdateOverlay() {
    if (isRunUpdateBusy()) return;
    resetRunUpdate(false);
    render();
    const refreshButton = document.getElementById("refresh-trigger");
    if (refreshButton) refreshButton.focus({ preventScroll: true });
  }

  function retryRunUpdate() {
    if (isRunUpdateBusy()) return;
    resetRunUpdate(false);
    startRunUpdate();
  }

  function isRunUpdateBusy() {
    return state.runUpdate.state === "starting" || state.runUpdate.state === "running";
  }

  function runUpdateLogText() {
    if (state.runUpdate.tail) return state.runUpdate.tail;
    if (state.runUpdate.state === "starting") return "Starting update job…";
    if (state.runUpdate.state === "running") return "Waiting for log output…";
    return state.runUpdate.error || "No log output.";
  }

  function updateRunUpdateDom() {
    state.runUpdate._raf = 0;
    const elapsed = document.getElementById("ru-elapsed");
    const log = document.getElementById("ru-log");
    const status = document.getElementById("ru-status-text");
    if (elapsed && state.runUpdate.startedAt) {
      const end = state.runUpdate.completedAt || Date.now();
      elapsed.textContent = formatElapsed(end - state.runUpdate.startedAt);
    }
    if (status) status.textContent = runUpdateStatusText();
    if (log) {
      log.textContent = runUpdateLogText();
      log.scrollTop = log.scrollHeight;
    }
  }

  function queueRunUpdateDomUpdate() {
    if (state.runUpdate._raf) return;
    state.runUpdate._raf = window.requestAnimationFrame(updateRunUpdateDom);
  }

  function startRunUpdateTimer() {
    if (state.runUpdate._timerInterval) window.clearInterval(state.runUpdate._timerInterval);
    state.runUpdate._timerInterval = window.setInterval(queueRunUpdateDomUpdate, 1000);
  }

  async function pollRunUpdateOnce() {
    if (!state.runUpdate.jobId) return;
    try {
      const payload = await fetchJson("/api/run-update/" + encodeURIComponent(state.runUpdate.jobId));
      const prior = state.runUpdate.state;
      state.runUpdate.state = payload.state || "running";
      state.runUpdate.tail = payload.tail || "";
      state.runUpdate.error = state.runUpdate.state === "failed" ? "Update failed." : "";
      if (payload.completed_at && !state.runUpdate.completedAt) state.runUpdate.completedAt = Date.now();
      queueRunUpdateDomUpdate();
      if (state.runUpdate.state !== "running") {
        if (state.runUpdate._pollInterval) window.clearInterval(state.runUpdate._pollInterval);
        if (state.runUpdate._timerInterval) window.clearInterval(state.runUpdate._timerInterval);
        state.runUpdate._pollInterval = null;
        state.runUpdate._timerInterval = null;
        if (prior === "running") render();
      }
    } catch (error) {
      state.runUpdate.state = "failed";
      state.runUpdate.completedAt = Date.now();
      state.runUpdate.error = String((error && error.message) || error);
      if (state.runUpdate._pollInterval) window.clearInterval(state.runUpdate._pollInterval);
      if (state.runUpdate._timerInterval) window.clearInterval(state.runUpdate._timerInterval);
      state.runUpdate._pollInterval = null;
      state.runUpdate._timerInterval = null;
      render();
    }
  }

  function startRunUpdatePolling() {
    if (state.runUpdate._pollInterval) window.clearInterval(state.runUpdate._pollInterval);
    state.runUpdate._pollInterval = window.setInterval(pollRunUpdateOnce, RUN_UPDATE_POLL_MS);
    pollRunUpdateOnce();
  }

  async function startRunUpdate() {
    if (state.runUpdate.active || state.runUpdate._starting) return;
    resetRunUpdate(false);
    Object.assign(state.runUpdate, {
      active: true,
      _starting: true,
      state: "starting",
      startedAt: Date.now(),
      completedAt: null,
      tail: "",
      error: "",
    });
    render();
    try {
      const payload = await fetchJson("/api/run-update", { method: "POST" });
      Object.assign(state.runUpdate, {
        active: true,
        _starting: false,
        jobId: payload.id,
        state: payload.state || "running",
        startedAt: Date.now(),
        completedAt: null,
        tail: "",
        error: "",
      });
      render();
      startRunUpdateTimer();
      startRunUpdatePolling();
    } catch (error) {
      state.runUpdate._starting = false;
      if (error && error.status === 400) {
        resetRunUpdate(false);
        state.provider.has_provider = false;
        await openWizard(0);
        return;
      }
      state.runUpdate.active = true;
      state.runUpdate.state = "failed";
      state.runUpdate.completedAt = Date.now();
      state.runUpdate.error = String((error && error.message) || error);
      render();
    }
  }

  async function handleRefresh() {
    if (state.runUpdate.active || state.runUpdate._starting) return;
    state.runUpdate.error = "";
    if (!state.provider.loaded && !state.provider._fetching) {
      state.provider._fetching = true;
      render();
      await fetchProvider();
      state.provider._fetching = false;
      render();
    }
    if (!state.provider.loaded) return;
    if (state.provider.has_provider) {
      startRunUpdate();
    } else {
      openWizard(0);
    }
  }

  async function reloadDB() {
    const response = await fetch("/data/dash.sqlite?t=" + Date.now(), { cache: "no-store" });
    if (!response.ok) throw new Error("Failed to reload database");
    const buffer = new Uint8Array(await response.arrayBuffer());
    if (state.db) state.db.close();
    if (!state.SQL) throw new Error("sql.js module is not ready");
    state.db = new state.SQL.Database(buffer);
    state.activeChangelogDate = null;
    state.changelogBodies = {};
    state.dataPrompt = "";
    state.dataPromptLoaded = false;
    state.uiToastShownFor = null;
    state.uiToastDismissed = null;
    loadStaticState();
    await fetchProvider();
    resetRunUpdate(false);
  }

  async function reloadDashboardFromRunUpdate() {
    state.runUpdate.error = "";
    try {
      await reloadDB();
    } catch (error) {
      state.runUpdate.active = true;
      state.runUpdate.state = "failed";
      state.runUpdate.error = String((error && error.message) || error);
    }
    render();
  }

  async function fetchDataPrompt() {
    if (state.dataPromptLoaded || state.dataPromptLoading) return;
    state.dataPromptLoading = true;
    try {
      const payload = await fetchJson("/api/prompt");
      state.dataPrompt = payload.prompt || "";
      state.dataPromptLoaded = true;
      state.dataCopyState = "idle";
      state.dataCopyMessage = "";
    } catch (error) {
      state.dataPromptLoaded = true;
      state.dataCopyState = "error";
      state.dataCopyMessage = String((error && error.message) || error);
    } finally {
      state.dataPromptLoading = false;
      render();
    }
  }

  async function copyDataPrompt() {
    const result = await copyText(state.dataPrompt);
    state.dataCopyState = result.tone;
    state.dataCopyMessage = result.message;
    render();
  }

  function queryRows(sql, params) {
    const statement = state.db.prepare(sql);
    const rows = [];
    try {
      statement.bind(params || []);
      while (statement.step()) rows.push(statement.getAsObject());
    } finally {
      statement.free();
    }
    return rows;
  }

  function loadStaticState() {
    state.totalModelCount = queryRows("SELECT COUNT(*) AS count FROM models")[0]?.count || 0;
    state.vendorOptions = queryRows("SELECT DISTINCT vendor FROM models ORDER BY vendor").map((row) => row.vendor);
    state.changelogs = queryRows(
      "SELECT date, title, path, summary, new_models_json, changed_json FROM changelogs ORDER BY date DESC"
    );
    state.metrics = queryRows(
      "SELECT changelog_date, started_at, completed_at, duration_sec, agent_name, agent_runtime, " +
      "tokens_input, tokens_output, tokens_cached, cost_usd, exa_searches, exa_fetches, word_count, notes " +
      "FROM run_metrics ORDER BY changelog_date DESC, completed_at DESC"
    );
    state.lastUpdated = queryRows("SELECT value FROM meta WHERE key = 'last_updated'")[0]?.value || null;
    const historyRows = queryRows(
      "SELECT model_id, as_of, intelligence, coding, agents, speed, cost " +
      "FROM model_scores ORDER BY model_id ASC, as_of ASC"
    );
    const historyMap = new Map();
    for (const row of historyRows) {
      const modelId = row.model_id;
      let bucket = historyMap.get(modelId);
      if (!bucket) {
        bucket = [];
        historyMap.set(modelId, bucket);
      }
      bucket.push(row);
    }
    state.scoreHistory = historyMap;
    if (!state.activeChangelogDate && state.changelogs.length) {
      state.activeChangelogDate = state.changelogs[0].date;
    }
    refreshModels();
  }

  function buildModelQuery(filter) {
    const where = [];
    const params = [];

    if (filter.vendors.size) {
      const vendors = [...filter.vendors].sort();
      where.push("vendor IN (" + vendors.map(() => "?").join(", ") + ")");
      params.push(...vendors);
    }
    if (filter.text.trim()) {
      const text = "%" + filter.text.trim() + "%";
      where.push("(name LIKE ? OR vendor LIKE ? OR COALESCE(notes, '') LIKE ? OR COALESCE(params, '') LIKE ?)");
      params.push(text, text, text, text);
    }
    for (const key of METRIC_KEYS) {
      const range = filter[key + "Range"];
      const lo = Number(range[0]);
      const hi = Number(range[1]);
      if (lo > 0 || hi < 10) {
        where.push(key + " BETWEEN ? AND ?");
        params.push(lo, hi);
      }
    }

    const sql = "SELECT * FROM v_models_latest" + (where.length ? " WHERE " + where.join(" AND ") : "");
    return { sql, params };
  }

  function refreshModels() {
    const query = buildModelQuery(state.filter);
    let rows = queryRows(query.sql, query.params);
    if (state.filter.tier) {
      rows = rows.filter((row) => tier(getOverall(row)).label === state.filter.tier);
    }
    state.models = sortedModels(rows);
    state.focusedRowIndex = -1;
    const visibleIds = new Set(state.models.map((row) => row.id));
    const before = state.selectedModelIds.length;
    state.selectedModelIds = state.selectedModelIds.filter((id) => visibleIds.has(id));
    if (state.selectedModelIds.length !== before) {
      for (const key of Object.keys(state.ui.modelInfoCollapsed)) {
        if (!visibleIds.has(Number(key))) delete state.ui.modelInfoCollapsed[key];
      }
      persistUIState();
    }
  }

  function updateFreshness() {
    const el = document.getElementById("freshness");
    if (!el) return;
    if (!state.lastUpdated) {
      el.textContent = "No updates yet";
      el.dataset.state = "unknown";
      el.title = "Run Refresh to create the first update.";
      return;
    }
    const timestamp = Date.parse(state.lastUpdated);
    if (Number.isNaN(timestamp)) {
      el.textContent = "unknown";
      el.dataset.state = "unknown";
      el.title = state.lastUpdated;
      return;
    }
    const ageMs = Date.now() - timestamp;
    const ageHours = ageMs / 3600000;
    el.textContent = "updated " + humanAge(ageMs);
    el.title = "Last updated: " + state.lastUpdated;
    if (ageHours <= 24) el.dataset.state = "fresh";
    else if (ageHours <= 48) el.dataset.state = "stale";
    else el.dataset.state = "expired";
  }

  function filterCount() {
    let count = state.filter.vendors.size;
    if (state.filter.text.trim()) count += 1;
    if (state.filter.tier) count += 1;
    for (const key of METRIC_KEYS) {
      const range = state.filter[key + "Range"];
      if (range[0] > 0 || range[1] < 10) count += 1;
    }
    return count;
  }

  function resetModelFilters() {
    state.filter.vendors = new Set();
    state.filter.text = "";
    state.filter.tier = null;
    for (const key of METRIC_KEYS) state.filter[key + "Range"] = [0, 10];
    refreshModels();
    render();
  }

  function toggleVendor(vendor) {
    if (state.filter.vendors.has(vendor)) state.filter.vendors.delete(vendor);
    else state.filter.vendors.add(vendor);
    refreshModels();
    render();
  }

  function setTierFilter(value) {
    state.filter.tier = value;
    refreshModels();
    render();
  }

  function setTextFilter(value) {
    state.filter.text = value;
    refreshModels();
    render();
  }

  function setMetricRange(metric, edge, rawValue) {
    const value = clamp(Number(rawValue), 0, 10);
    const key = metric + "Range";
    const next = state.filter[key].slice();
    if (edge === "min") next[0] = Math.min(value, next[1]);
    else next[1] = Math.max(value, next[0]);
    state.filter[key] = next;
    refreshModels();
    render();
  }

  function setStatsFilter(key, value) {
    state.statsFilter[key] = value;
    render();
  }

  function resetStatsFilters() {
    state.statsFilter.from = "";
    state.statsFilter.to = "";
    state.statsFilter.agent = "";
    render();
  }

  function metricsAgentOptions() {
    const seen = new Map();
    for (const row of state.metrics) {
      const key = formatAgentKey(row);
      if (!seen.has(key)) seen.set(key, formatAgentLabel(row));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }

  function getFilteredMetrics() {
    const from = state.statsFilter.from;
    const to = state.statsFilter.to;
    const agent = state.statsFilter.agent;
    return state.metrics.filter((row) => {
      if (from && row.changelog_date < from) return false;
      if (to && row.changelog_date > to) return false;
      if (agent && formatAgentKey(row) !== agent) return false;
      return true;
    });
  }

  function sumField(rows, key) {
    return rows.reduce((sum, row) => {
      const value = row[key];
      return sum + (value === null || value === undefined || value === "" ? 0 : Number(value));
    }, 0);
  }

  function averageField(rows, key) {
    const values = rows
      .map((row) => row[key])
      .filter((value) => value !== null && value !== undefined && value !== "")
      .map(Number)
      .filter(Number.isFinite);
    if (!values.length) return null;
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }

  function ratio(rows, numeratorKey, denominatorKey) {
    let numerator = 0;
    let denominator = 0;
    for (const row of rows) {
      const a = row[numeratorKey];
      const b = row[denominatorKey];
      if (a === null || a === undefined || a === "" || b === null || b === undefined || b === "") continue;
      const aNum = Number(a);
      const bNum = Number(b);
      if (!Number.isFinite(aNum) || !Number.isFinite(bNum) || bNum === 0) continue;
      numerator += aNum;
      denominator += bNum;
    }
    return denominator ? numerator / denominator : null;
  }

  function median(values) {
    if (!values || !values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    if (sorted.length % 2) return sorted[mid];
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  const DURATIONS_PER_GROUP_CAP = 200;

  function groupMetricsByAgent(rows) {
    const groups = new Map();
    for (const row of rows) {
      const key = formatAgentKey(row);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: formatAgentLabel(row),
          agentName: row.agent_name || "",
          agentRuntime: row.agent_runtime || "",
          runs: 0,
          totalCost: 0,
          costCount: 0,
          totalDuration: 0,
          durationCount: 0,
          minDuration: Infinity,
          durations: [],
          totalInput: 0,
          inputCount: 0,
          totalOutput: 0,
          outputCount: 0,
          totalWords: 0,
          wordCountCount: 0,
          totalCostForWordCalc: 0,
          totalWordsForCostCalc: 0,
          pairedRunCount: 0,
        });
      }
      const group = groups.get(key);
      group.runs += 1;
      const costRaw = row.cost_usd;
      const durationRaw = row.duration_sec;
      const wordsRaw = row.word_count;
      const hasCost = costRaw !== null && costRaw !== undefined && costRaw !== "";
      const hasDuration = durationRaw !== null && durationRaw !== undefined && durationRaw !== "";
      const hasWords = wordsRaw !== null && wordsRaw !== undefined && wordsRaw !== "";
      if (hasCost) {
        group.totalCost += Number(costRaw);
        group.costCount += 1;
      }
      if (hasDuration) {
        const d = Number(durationRaw);
        if (Number.isFinite(d) && d > 0) {
          group.totalDuration += d;
          group.durationCount += 1;
          if (d < group.minDuration) group.minDuration = d;
          if (group.durations.length < DURATIONS_PER_GROUP_CAP) group.durations.push(d);
        }
      }
      if (row.tokens_input !== null && row.tokens_input !== undefined && row.tokens_input !== "") {
        group.totalInput += Number(row.tokens_input);
        group.inputCount += 1;
      }
      if (row.tokens_output !== null && row.tokens_output !== undefined && row.tokens_output !== "") {
        group.totalOutput += Number(row.tokens_output);
        group.outputCount += 1;
      }
      if (hasWords) {
        group.totalWords += Number(wordsRaw);
        group.wordCountCount += 1;
      }
      if (hasCost && hasWords) {
        const c = Number(costRaw);
        const w = Number(wordsRaw);
        if (Number.isFinite(c) && Number.isFinite(w) && c > 0 && w > 0) {
          group.totalCostForWordCalc += c;
          group.totalWordsForCostCalc += w;
          group.pairedRunCount += 1;
        }
      }
    }
    for (const group of groups.values()) {
      if (!Number.isFinite(group.minDuration)) group.minDuration = null;
    }
    return [...groups.values()].sort((a, b) => b.runs - a.runs || b.totalCost - a.totalCost || a.label.localeCompare(b.label));
  }

  const FASTEST_RUN_MIN_SAMPLES = 3;

  function deriveLeaderboardMetrics(group) {
    const costPerWord = group.totalCostForWordCalc > 0 && group.totalWordsForCostCalc > 0
      ? group.totalCostForWordCalc / group.totalWordsForCostCalc
      : null;
    const wordsPerDollar = group.totalCostForWordCalc > 0 && group.totalWordsForCostCalc > 0
      ? group.totalWordsForCostCalc / group.totalCostForWordCalc
      : null;
    const fastestEligible = group.durations.length >= FASTEST_RUN_MIN_SAMPLES;
    return {
      costPerWord,
      wordsPerDollar,
      // group.minDuration is uncapped; group.durations is capped at
      // DURATIONS_PER_GROUP_CAP, so the median is approximate but the min is exact.
      minDuration: fastestEligible ? group.minDuration : null,
      medianDuration: fastestEligible ? median(group.durations) : null,
      fastestEligible,
    };
  }

  function toggleStatsSort(key) {
    if (state.statsSort.key === key) {
      state.statsSort.dir = state.statsSort.dir === "asc" ? "desc" : "asc";
    } else {
      state.statsSort.key = key;
      state.statsSort.dir = key === "agent" ? "asc" : "desc";
    }
    render();
  }

  function sortedMetricsRows(rows) {
    const key = state.statsSort.key;
    const dir = state.statsSort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      let left;
      let right;
      if (key === "agent") {
        left = formatAgentLabel(a);
        right = formatAgentLabel(b);
        return left.localeCompare(right) * dir;
      }
      left = a[key];
      right = b[key];
      const leftMissing = left === null || left === undefined || left === "";
      const rightMissing = right === null || right === undefined || right === "";
      if (leftMissing && rightMissing) return 0;
      if (leftMissing) return 1;
      if (rightMissing) return -1;
      if (typeof left === "string" || typeof right === "string") {
        return String(left).localeCompare(String(right)) * dir;
      }
      return (Number(left) - Number(right)) * dir;
    });
  }

  function statsSortMarker(key) {
    if (state.statsSort.key !== key) return "";
    return state.statsSort.dir === "asc" ? " ↑" : " ↓";
  }

  async function ensureChangelogBody(date) {
    if (!date) return;
    const cached = state.changelogBodies[date];
    if (cached && (cached.status === "loading" || cached.status === "ready")) return;
    const entry = state.changelogs.find((row) => row.date === date);
    if (!entry) return;
    state.changelogBodies[date] = { status: "loading" };
    render();
    try {
      const response = await fetch(normalizeAssetPath(entry.path), { cache: "no-store" });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const markdown = stripFrontmatter(await response.text());
      state.changelogBodies[date] = { status: "ready", body: markdown };
    } catch (error) {
      state.changelogBodies[date] = {
        status: "error",
        error: String((error && error.message) || error),
      };
    }
    if (state.activeChangelogDate === date) render();
  }

  function renderScoreCell(score) {
    if (score === null || score === undefined) {
      return h("div", { class: "score-cell" }, h("span", { class: "na" }, "N/A"));
    }
    const t = tier(score);
    const width = clamp(Number(score) * 10, 0, 100);
    const colorVar = barColor(Number(score));
    return h("div", { class: "score-cell" }, [
      h("span", { class: "tier-pill " + t.cls }, t.label),
      h("div", { class: "track" }, h("div", {
        class: "fill",
        style: {
          width: width + "%",
          background: colorVar,
        },
      })),
      h("span", { class: "val" }, Number(score).toFixed(1)),
    ]);
  }

  function statusBadge(status) {
    if (!status || status === "active") return null;
    return h("span", { class: "status-badge", dataset: { status } }, status);
  }

  function renderModelCardBody(model) {
    const overall = getOverall(model);
    const value = getValue(model);
    const history = modelHistory(model.id);
    const hasHistory = history && history.length >= 2;
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
    const metaParts = [
      model.vendor,
      model.released,
      model.params,
      model.pricing ? "Pricing: " + model.pricing + "/M tok" : null,
      model.status && model.status !== "active" ? model.status : null,
    ].filter(Boolean);
    return h("div", { class: "detail-panel" }, [
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
            h("h2", null, model.name),
            statusBadge(model.status),
          ]),
          h("div", { class: "detail-meta" }, metaParts.join(" · ")),
        ]),
        h("div", { class: "detail-scores" }, [
          h("div", { class: "detail-score-card" }, [
            h("div", { class: "label" }, "Overall"),
            h("div", { class: "value " + tier(overall).cls }, overall !== null ? overall.toFixed(1) : "N/A"),
          ]),
          h("div", { class: "detail-score-card" }, [
            h("div", { class: "label" }, "Value"),
            h("div", { class: "value " + tier(value).cls }, value !== null ? value.toFixed(1) : "N/A"),
          ]),
        ]),
      ]),
      h("div", { class: "detail-grid" }, metricRows),
      hasHistory ? h("div", { class: "detail-chart-section" }, [
        h("div", { class: "detail-chart-head" }, [
          h("h3", null, "Score history"),
          h("div", { class: "detail-chart-legend" }, DETAIL_CHART_FIELDS.map((field) =>
            h("span", { class: "detail-chart-legend-item" }, [
              h("span", { class: "detail-chart-swatch", style: { backgroundColor: "var(" + field.color.replace(/^var\(|\)$/g, "") + ")" } }),
              field.label,
            ])
          )),
        ]),
        h("div", { id: "detail-chart-" + model.id, class: "detail-chart" }),
      ]) : null,
      h("div", { class: "detail-actions" }, [
        h("button", {
          class: "vw-btn vw-btn-secondary",
          type: "button",
          disabled: !hasHistory,
          title: hasHistory ? "Download a Markdown report" : "Not enough history yet",
          onclick: (e) => {
            e.stopPropagation();
            downloadModelReport(model);
          },
        }, "Export report"),
      ]),
      model.notes ? h("p", { class: "detail-notes" }, model.notes) : null,
    ]);
  }

  function renderSingleModelCard(model) {
    const key = String(model.id);
    const overall = getOverall(model);
    const collapsed = !!state.ui.modelInfoCollapsed[key];
    const node = renderCollapsiblePanel({
      id: "model-info-" + model.id,
      title: model.name,
      summary: [overall !== null ? "overall " + overall.toFixed(1) : "N/A"],
      actions: [
        h("button", {
          class: "action-btn subtle icon-btn",
          type: "button",
          "aria-label": "Close " + model.name,
          title: "Close",
          onclick: (e) => {
            e.stopPropagation();
            const idx = state.selectedModelIds.indexOf(model.id);
            if (idx !== -1) state.selectedModelIds.splice(idx, 1);
            delete state.ui.modelInfoCollapsed[key];
            destroyDetailUplot("detail-chart-" + model.id);
            persistUIState();
            render();
          },
        }, icon("x")),
      ],
      collapsed,
      onToggle: () => toggleSingleModelCollapse(model.id),
      children: renderModelCardBody(model),
    });
    if (!collapsed) scheduleDetailChartDraw(model.id);
    else destroyDetailUplot("detail-chart-" + model.id);
    return node;
  }

  function renderDetailPanelsNode(models) {
    if (!models.length) return null;
    const row = h("div", {
      class: "comparison-row" + (models.length >= 4 ? " is-compact" : ""),
      dataset: { cardCount: models.length >= 5 ? "5" : undefined },
    });
    row.style.setProperty("--card-count", models.length);
    for (const model of models) {
      row.appendChild(renderSingleModelCard(model));
    }
    return row;
  }

  function renderEmptyState(title, copy) {
    return h("div", { class: "empty-state" }, [
      h("h2", null, title),
      h("p", null, copy),
    ]);
  }

  function renderRangeCard(metric) {
    const range = state.filter[metric + "Range"];
    return h("div", { class: "range-card" }, [
      h("div", { class: "range-head" }, [
        h("span", { class: "range-title" }, METRIC_LABELS[metric]),
        h("span", { class: "range-values" }, formatScore(range[0]) + "–" + formatScore(range[1])),
      ]),
      h("label", { class: "range-label", for: "range-" + metric + "-min" }, "min"),
      h("input", {
        id: "range-" + metric + "-min",
        class: "range-input",
        type: "range",
        min: "0",
        max: "10",
        step: "0.1",
        value: String(range[0]),
        oninput: (event) => setMetricRange(metric, "min", event.target.value),
      }),
      h("label", { class: "range-label", for: "range-" + metric + "-max" }, "max"),
      h("input", {
        id: "range-" + metric + "-max",
        class: "range-input",
        type: "range",
        min: "0",
        max: "10",
        step: "0.1",
        value: String(range[1]),
        oninput: (event) => setMetricRange(metric, "max", event.target.value),
      }),
    ]);
  }

  function renderModelFilters() {
    const active = filterCount();
    return renderCollapsiblePanel({
      id: "model-filters",
      title: "Model Filters",
      summary: [
        state.models.length + " / " + state.totalModelCount + " models",
        " · ",
        active ? active + " filters active" : "No filters",
      ],
      actions: [
        h("button", {
          class: "action-btn subtle icon-btn",
          type: "button",
          onclick: resetModelFilters,
          "aria-label": "Reset filters",
          title: "Reset filters",
        }, icon("filter-x")),
      ],
      collapsed: state.ui.modelFiltersCollapsed,
      onToggle: toggleModelFiltersCollapsed,
      children: [
        h("div", { class: "filter-panel" }, [
          h("div", { class: "filter-summary" }, [
            h("div", { class: "filter-summary-copy" }, [
              h("span", { class: "summary-pill" }, state.models.length + " / " + state.totalModelCount + " models"),
              h("span", { class: "summary-note" }, active ? active + " filters active" : "All filters open"),
            ]),
          ]),
          h("div", { class: "filter-card" }, [
            h("label", { class: "control-label stacked", for: "model-search" }, "Search"),
            h("div", { class: "search-shell" }, h("input", {
              id: "model-search",
              class: "search-input",
              type: "search",
              placeholder: "Search name, vendor, notes, params",
              value: state.filter.text,
              oninput: (event) => setTextFilter(event.target.value),
            })),
          ]),
          h("div", { class: "filter-card" }, [
            h("div", { class: "control-label stacked" }, "Vendors"),
            h("div", { class: "chip-group" }, state.vendorOptions.map((vendor) =>
              h("button", {
                class: "filter-chip" + (state.filter.vendors.has(vendor) ? " is-active" : ""),
                type: "button",
                "aria-pressed": state.filter.vendors.has(vendor) ? "true" : "false",
                onclick: () => toggleVendor(vendor),
              }, vendor)
            )),
          ]),
          h("div", { class: "filter-card" }, [
            h("div", { class: "control-label stacked" }, "Tier"),
            h("div", { class: "chip-group tier-chip-group" }, TIER_FILTERS.map((item) =>
              h("button", {
                class: "filter-chip tier-filter-chip" + (state.filter.tier === item.key ? " is-active" : ""),
                type: "button",
                "aria-pressed": state.filter.tier === item.key ? "true" : "false",
                onclick: () => setTierFilter(item.key),
              }, item.label)
            )),
          ]),
          h("div", { class: "range-grid" }, METRIC_KEYS.map(renderRangeCard)),
        ]),
      ],
    });
  }

  function renderStatsFilters() {
    return renderCollapsiblePanel({
      id: "stats-filters",
      title: "Stats Filters",
      summary: [
        getFilteredMetrics().length + " runs",
        " · ",
        state.statsFilter.agent ? "Filtered by agent + date" : "All recorded runs",
      ],
      actions: [
        h("button", {
          class: "action-btn subtle icon-btn",
          type: "button",
          onclick: resetStatsFilters,
          "aria-label": "Reset filters",
          title: "Reset filters",
        }, icon("filter-x")),
      ],
      collapsed: state.ui.statsFiltersCollapsed,
      onToggle: toggleStatsFiltersCollapsed,
      children: [
        h("div", { class: "filter-panel stats-filter-panel" }, [
          h("div", { class: "filter-summary" }, [
            h("div", { class: "filter-summary-copy" }, [
              h("span", { class: "summary-pill" }, getFilteredMetrics().length + " runs"),
              h("span", { class: "summary-note" }, state.statsFilter.agent ? "Filtered by agent + date" : "All recorded runs"),
            ]),
          ]),
          h("div", { class: "stats-filter-grid" }, [
            h("label", { class: "field-block", for: "stats-from" }, [
              h("span", { class: "control-label stacked" }, "From"),
              h("input", {
                id: "stats-from",
                class: "text-input",
                type: "date",
                value: state.statsFilter.from,
                onchange: (event) => setStatsFilter("from", event.target.value),
              }),
            ]),
            h("label", { class: "field-block", for: "stats-to" }, [
              h("span", { class: "control-label stacked" }, "To"),
              h("input", {
                id: "stats-to",
                class: "text-input",
                type: "date",
                value: state.statsFilter.to,
                onchange: (event) => setStatsFilter("to", event.target.value),
              }),
            ]),
            h("label", { class: "field-block", for: "stats-agent" }, [
              h("span", { class: "control-label stacked" }, "Agent"),
              h("select", {
                id: "stats-agent",
                class: "text-input",
                value: state.statsFilter.agent,
                onchange: (event) => setStatsFilter("agent", event.target.value),
              }, [
                h("option", { value: "" }, "All Agents"),
                ...metricsAgentOptions().map(([key, label]) => h("option", { value: key, selected: state.statsFilter.agent === key }, label)),
              ]),
            ]),
          ]),
        ]),
      ],
    });
  }

  function wizardStatusChip(stateValue, text) {
    const cls = stateValue === "success"
      ? "vw-status-chip vw-status-success"
      : stateValue === "failed" || stateValue === "error"
        ? "vw-status-chip vw-status-error"
        : stateValue === "testing" || stateValue === "saving"
          ? "vw-status-chip vw-status-generating"
          : "vw-status-chip";
    return h("span", { class: cls }, text);
  }

  function renderWizardProgress() {
    const nodes = [];
    WIZARD_STEPS.forEach((label, index) => {
      const classes = ["vw-wizard-step"];
      if (index === state.wizard.step) classes.push("active");
      if (index < state.wizard.step) classes.push("completed");
      nodes.push(h("div", { class: classes.join(" ") }, [
        h("div", { class: "vw-wizard-dot" }, index < state.wizard.step ? "" : String(index + 1)),
        h("div", { class: "vw-wizard-label" }, label),
      ]));
      if (index < WIZARD_STEPS.length - 1) {
        nodes.push(h("div", { class: "vw-wizard-line" + (index < state.wizard.step ? " completed" : "") }));
      }
    });
    return h("div", { class: "vw-wizard-progress" }, nodes);
  }

  function wizardField(label, control, hint) {
    return h("label", { class: "vw-field" }, [
      h("span", { class: "vw-label" }, label),
      control,
      hint ? h("span", { class: "vw-hint" }, hint) : null,
    ]);
  }

  function renderHeaderEditor() {
    const rows = state.wizard.requestHeaders.length ? state.wizard.requestHeaders : [{ name: "", value: "" }];
    return h("div", { class: "wizard-header-editor" }, [
      ...rows.map((row, index) => h("div", { class: "wizard-header-row" }, [
        h("input", {
          id: "wizard-header-name-" + index,
          class: "vw-input",
          placeholder: "Header",
          value: row.name || "",
          oninput: (event) => {
            state.wizard.requestHeaders[index] = Object.assign({}, row, { name: event.target.value });
            state.wizard.connectionTestState = "idle";
            state.wizard.connectionTestSkipped = false;
            render();
          },
        }),
        h("input", {
          id: "wizard-header-value-" + index,
          class: "vw-input",
          placeholder: "Value",
          value: row.value || "",
          oninput: (event) => {
            state.wizard.requestHeaders[index] = Object.assign({}, row, { value: event.target.value });
            state.wizard.connectionTestState = "idle";
            state.wizard.connectionTestSkipped = false;
            render();
          },
        }),
        h("button", {
          class: "vw-btn vw-btn-icon",
          type: "button",
          "aria-label": "Remove header",
          onclick: () => {
            state.wizard.requestHeaders.splice(index, 1);
            render();
          },
        }, "×"),
      ])),
      h("button", {
        class: "vw-btn vw-btn-tertiary",
        type: "button",
        onclick: () => {
          state.wizard.requestHeaders.push({ name: "", value: "" });
          render();
        },
      }, "Add header"),
    ]);
  }

  function renderWizardProviderStep() {
    const preview = endpointPreview(state.wizard.baseUrl, state.wizard.endpointMode, state.wizard.modelsOverrideUrl);
    const presets = state.providerPresets.providers;
    return h("div", { class: "wizard-step-body" }, [
      wizardField("Preset", h("select", {
        class: "vw-select",
        value: state.wizard.presetId,
        onchange: (event) => applyWizardPreset(event.target.value),
      }, [
        h("option", { value: "" }, "Choose a provider"),
        ...presets.map((preset) => h("option", {
          value: preset.id,
          selected: state.wizard.presetId === preset.id,
        }, preset.label)),
      ])),
      wizardField("BASE_URL", h("input", {
        id: "wizard-base-url",
        class: "vw-input",
        value: state.wizard.baseUrl,
        placeholder: "https://api.openai.com",
        oninput: (event) => {
          state.wizard.baseUrl = event.target.value;
          state.wizard.connectionTestState = "idle";
          state.wizard.connectionTestSkipped = false;
          render();
        },
      })),
      wizardField("API_KEY", h("input", {
        id: "wizard-api-key",
        class: "vw-input",
        type: "password",
        value: state.wizard.apiKey,
        placeholder: state.provider.has_provider ? "Leave blank to keep stored key" : "sk-…",
        oninput: (event) => {
          state.wizard.apiKey = event.target.value;
          state.wizard.connectionTestState = "idle";
          state.wizard.connectionTestSkipped = false;
          render();
        },
      })),
      h("div", { class: "wizard-preview vw-card-compact" }, [
        h("span", null, "Chat: " + preview.chat),
        h("span", null, "Models: " + preview.models),
      ]),
      h("details", {
        class: "wizard-advanced",
        open: state.wizard.advancedOpen,
        ontoggle: (event) => {
          state.wizard.advancedOpen = event.currentTarget.open;
        },
      }, [
        h("summary", null, "Advanced"),
        h("div", { class: "wizard-advanced-body" }, [
          wizardField("MODELS_OVERRIDE_URL", h("input", {
            id: "wizard-models-override",
            class: "vw-input",
            value: state.wizard.modelsOverrideUrl,
            placeholder: "Optional",
            oninput: (event) => {
              state.wizard.modelsOverrideUrl = event.target.value;
              state.wizard.connectionTestState = "idle";
              state.wizard.connectionTestSkipped = false;
              render();
            },
          })),
          wizardField("Endpoint mode", h("select", {
            id: "wizard-endpoint-mode",
            class: "vw-select",
            value: state.wizard.endpointMode,
            onchange: (event) => {
              state.wizard.endpointMode = event.target.value;
              state.wizard.connectionTestState = "idle";
              state.wizard.connectionTestSkipped = false;
              render();
            },
          }, [
            h("option", { value: "append_v1", selected: state.wizard.endpointMode === "append_v1" }, "OpenAI /v1"),
            h("option", { value: "root", selected: state.wizard.endpointMode === "root" }, "Provider root"),
          ])),
          renderHeaderEditor(),
        ]),
      ]),
      h("div", { class: "wizard-test-row" }, [
        h("button", {
          class: "vw-btn vw-btn-secondary",
          type: "button",
          disabled: state.wizard.connectionTestState === "testing" || !state.wizard.baseUrl || (!state.provider.has_provider && !state.wizard.apiKey),
          onclick: testWizardConnection,
        }, state.wizard.connectionTestState === "testing" ? "Testing…" : "Test Connection"),
        state.wizard.connectionTestState !== "idle"
          ? wizardStatusChip(state.wizard.connectionTestState, state.wizard.connectionTestStatus || state.wizard.connectionTestState)
          : null,
      ]),
      state.wizard.connectionTestError ? h("p", { class: "wizard-error" }, state.wizard.connectionTestError) : null,
    ]);
  }

  function renderModelInput(kind, label) {
    const valueKey = kind === "default" ? "defaultModel" : "backupModel";
    const confirmKey = kind === "default" ? "customDefaultConfirmed" : "customBackupConfirmed";
    const value = state.wizard[valueKey];
    const custom = Boolean(value && !modelExists(value));
    return h("div", { class: "vw-field" }, [
      h("span", { class: "vw-label" }, label),
      h("input", {
        id: "wizard-model-" + kind,
        class: "vw-input",
        list: "wizard-model-options",
        value,
        placeholder: kind === "backup" ? "Optional backup model" : "Model ID",
        oninput: (event) => {
          state.wizard[valueKey] = event.target.value;
          state.wizard[confirmKey] = false;
          render();
        },
      }),
      custom ? h("label", { class: "wizard-confirm" }, [
        h("input", {
          type: "checkbox",
          checked: state.wizard[confirmKey],
          onchange: (event) => {
            state.wizard[confirmKey] = event.target.checked;
            render();
          },
        }),
        "Use custom model ID",
      ]) : null,
    ]);
  }

  function renderWizardModelsStep() {
    const options = state.wizard.availableModels.length
      ? state.wizard.availableModels
      : modelExamples().map((id) => ({ id, name: id }));
    return h("div", { class: "wizard-step-body" }, [
      state.wizard.modelsLoading ? wizardStatusChip("testing", "Loading models") : null,
      state.wizard.modelsError ? h("p", { class: "wizard-error" }, state.wizard.modelsError) : null,
      h("datalist", { id: "wizard-model-options" }, options.map((model) => h("option", { value: model.id }, model.name || model.id))),
      renderModelInput("default", "Default model"),
      renderModelInput("backup", "Backup model"),
    ]);
  }

  function renderWizardTestStep() {
    const defaultResult = state.wizard.modelTestResults.default;
    const backupResult = state.wizard.modelTestResults.backup;
    return h("div", { class: "wizard-step-body" }, [
      h("div", { class: "wizard-test-list" }, [
        h("div", { class: "vw-card-compact wizard-test-item" }, [
          h("strong", null, "Default"),
          wizardStatusChip(defaultResult?.state || "idle", defaultResult?.message || "Waiting"),
        ]),
        h("div", { class: "vw-card-compact wizard-test-item" }, [
          h("strong", null, "Backup"),
          wizardStatusChip(backupResult?.state || "idle", backupResult?.message || "Waiting"),
        ]),
      ]),
      state.wizard.modelTestState === "failed"
        ? h("div", { class: "wizard-test-row" }, [
            h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: runWizardModelTests }, "Retry"),
            h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => { state.wizard.step = 0; render(); } }, "Restart"),
          ])
        : null,
    ]);
  }

  function renderWizardExaStep() {
    if (state.wizard.exaAlreadyConfigured) {
      return h("div", { class: "wizard-step-body" }, [
        wizardStatusChip("success", "Exa already configured"),
      ]);
    }
    return h("div", { class: "wizard-step-body" }, [
      wizardField("Exa API key", h("input", {
        id: "wizard-exa-key",
        class: "vw-input",
        type: "password",
        value: state.wizard.exaKey,
        placeholder: "exa_…",
        oninput: (event) => {
          state.wizard.exaKey = event.target.value;
          render();
        },
      }), "Used by the update agent for web research."),
      h("a", { class: "wizard-link", href: "https://exa.ai", target: "_blank", rel: "noreferrer" }, "Sign up at exa.ai"),
    ]);
  }

  function renderWizardLLMStatsStep() {
    if (state.wizard.llmstatsAlreadyConfigured) {
      return h("div", { class: "wizard-step-body" }, [
        wizardStatusChip("success", "LLM Stats already configured"),
      ]);
    }
    return h("div", { class: "wizard-step-body" }, [
      wizardField("LLM Stats API key", h("input", {
        id: "wizard-llmstats-key",
        class: "vw-input",
        type: "password",
        value: state.wizard.llmstatsKey,
        placeholder: "ze_…",
        oninput: (event) => {
          state.wizard.llmstatsKey = event.target.value;
          render();
        },
      }), "Optional. Enriches updates with model catalog and benchmark data."),
      h("a", { class: "wizard-link", href: "https://llm-stats.com/developer", target: "_blank", rel: "noreferrer" }, "Get a key at llm-stats.com"),
    ]);
  }

  function renderWizardScheduleStep() {
    return h("div", { class: "wizard-step-body" }, [
      h("div", { class: "wizard-segmented" }, ["off", "daily", "weekly", "monthly"].map((cadence) => h("button", {
        class: "view-btn",
        type: "button",
        "aria-pressed": state.wizard.scheduleCadence === cadence ? "true" : "false",
        onclick: () => {
          state.wizard.scheduleCadence = cadence;
          render();
        },
      }, cadence[0].toUpperCase() + cadence.slice(1)))),
      state.wizard.scheduleCadence !== "off" ? wizardField("Local time", h("input", {
        id: "wizard-schedule-time",
        class: "vw-input",
        type: "time",
        value: state.wizard.scheduleTimeLocal,
        oninput: (event) => {
          state.wizard.scheduleTimeLocal = event.target.value;
          render();
        },
      }), "Runs at " + wizardScheduleUtcEcho()) : null,
      state.wizard.scheduleCadence === "weekly" ? wizardField("Day", h("select", {
        class: "vw-select",
        value: String(state.wizard.scheduleDayOfWeek),
        onchange: (event) => {
          state.wizard.scheduleDayOfWeek = Number(event.target.value);
        },
      }, WEEKDAYS.map((day, index) => h("option", {
        value: String(index + 1),
        selected: state.wizard.scheduleDayOfWeek === index + 1,
      }, day)))) : null,
      state.wizard.scheduleCadence === "monthly" ? wizardField("Day of month", h("input", {
        class: "vw-input",
        type: "number",
        min: "1",
        max: "28",
        value: String(state.wizard.scheduleDayOfMonth),
        oninput: (event) => {
          state.wizard.scheduleDayOfMonth = Number(event.target.value || 1);
        },
      }), "Limited to 1-28 so every month works.") : null,
      state.wizard.scheduleError ? h("p", { class: "wizard-error" }, state.wizard.scheduleError) : null,
    ]);
  }

  function renderWizardSummaryStep() {
    const scheduleText = state.wizard.scheduleCadence === "off"
      ? "Off"
      : state.wizard.scheduleCadence + " at " + state.wizard.scheduleTimeLocal + " (" + wizardScheduleUtcEcho() + ")";
    return h("div", { class: "wizard-step-body" }, [
      h("div", { class: "wizard-summary-grid" }, [
        h("div", null, [h("span", null, "Provider"), h("strong", null, state.wizard.preset?.label || state.wizard.baseUrl || "Custom")]),
        h("div", null, [h("span", null, "BASE_URL"), h("strong", null, state.wizard.baseUrl || "—")]),
        h("div", null, [h("span", null, "API_KEY"), h("strong", null, state.wizard.apiKey ? redactSecret(state.wizard.apiKey) : "stored key")]),
        h("div", null, [h("span", null, "Default"), h("strong", null, state.wizard.defaultModel || "—")]),
        h("div", null, [h("span", null, "Backup"), h("strong", null, state.wizard.backupModel || "—")]),
        h("div", null, [h("span", null, "Exa"), h("strong", null, state.wizard.exaAlreadyConfigured ? "Configured" : state.wizard.exaSkipped ? "Skipped" : state.wizard.exaKey ? redactSecret(state.wizard.exaKey) : "Skipped")]),
        h("div", null, [h("span", null, "LLM Stats"), h("strong", null, state.wizard.llmstatsAlreadyConfigured ? "Configured" : state.wizard.llmstatsSkipped ? "Skipped" : state.wizard.llmstatsKey ? redactSecret(state.wizard.llmstatsKey) : "Skipped")]),
        h("div", null, [h("span", null, "Schedule"), h("strong", null, scheduleText)]),
      ]),
    ]);
  }

  function renderWizardContent() {
    if (state.wizard.loading) {
      return h("div", { class: "wizard-step-body" }, [
        wizardStatusChip("testing", "Preparing setup"),
      ]);
    }
    if (state.wizard.step === 0) return renderWizardProviderStep();
    if (state.wizard.step === 1) return renderWizardModelsStep();
    if (state.wizard.step === 2) return renderWizardTestStep();
    if (state.wizard.step === 3) return renderWizardExaStep();
    if (state.wizard.step === 4) return renderWizardLLMStatsStep();
    if (state.wizard.step === 5) return renderWizardScheduleStep();
    return renderWizardSummaryStep();
  }

  function wizardCanNext() {
    if (state.wizard.loading) return false;
    if (state.wizard.saving || state.wizard.stepSaving) return false;
    if (state.wizard.step === 0) {
      return Boolean(
        state.wizard.baseUrl &&
        (state.provider.has_provider || state.wizard.apiKey) &&
        (state.wizard.connectionTestState === "success" || state.wizard.connectionTestSkipped)
      );
    }
    if (state.wizard.step === 1) return Boolean(state.wizard.defaultModel && !state.wizard.modelsLoading);
    if (state.wizard.step === 2) return state.wizard.modelTestState === "success";
    if (state.wizard.step === 3) return state.wizard.exaAlreadyConfigured || Boolean(state.wizard.exaKey);
    if (state.wizard.step === 4) return true;
    return true;
  }

  function renderWizardFooter() {
    const skipVisible = (state.wizard.step === 0 && state.wizard.connectionTestState === "failed") ||
      state.wizard.step === 3 ||
      state.wizard.step === 4 ||
      state.wizard.step === 5;
    const label = state.wizard.loading
      ? "Loading…"
      : state.wizard.step === 6
      ? state.wizard.saving ? "Finishing…" : "Finish"
      : state.wizard.step === 5
        ? state.wizard.scheduleState === "saving" ? "Saving…" : "Next"
        : "Next";
    return h("div", { class: "wizard-footer" }, [
      h("button", {
        class: "vw-btn vw-btn-tertiary",
        type: "button",
        disabled: state.wizard.loading || state.wizard.step === 0 || state.wizard.saving || state.wizard.stepSaving,
        onclick: wizardBack,
      }, "Back"),
      h("div", { class: "wizard-footer-actions" }, [
        skipVisible ? h("button", {
          class: "vw-btn vw-btn-secondary",
          type: "button",
          disabled: state.wizard.loading || state.wizard.saving || state.wizard.stepSaving,
          onclick: wizardSkip,
        }, "Skip") : null,
        h("button", {
          class: "vw-btn vw-btn-primary",
          type: "button",
          disabled: !wizardCanNext(),
          onclick: wizardNext,
        }, label),
      ]),
    ]);
  }

  function renderWizard() {
    const title = state.wizard.mode === "reconfigure" ? "Configure Agent Provider" : "Set Up Agent Provider";
    const subtitle = WIZARD_SUBTITLES[state.wizard.step] || "";
    const stepLabel = "Step " + (state.wizard.step + 1) + " of " + WIZARD_STEPS.length;
    return h("div", { class: "wizard-fullscreen", role: "main", "aria-labelledby": "wizard-title" }, [
      h("div", { class: "wizard-fs-header" }, [
        h("span", { class: "wizard-fs-brand" }, "LLM-Dash"),
        state.wizard.mode === "reconfigure"
          ? h("button", { class: "vw-btn vw-btn-tertiary wizard-fs-close", type: "button", onclick: closeWizard }, "Exit Setup")
          : null,
      ]),
      h("div", { class: "wizard-fs-center" }, [
        h("div", { class: "wizard-fs-card" }, [
          h("div", { class: "wizard-fs-title-block" }, [
            h("span", { class: "wizard-fs-step-label" }, stepLabel),
            h("h1", { id: "wizard-title" }, title),
            subtitle ? h("p", { class: "wizard-fs-subtitle" }, subtitle) : null,
          ]),
          renderWizardProgress(),
          h("div", { class: "wizard-fs-body" }, [
            state.wizard.saveError ? h("p", { class: "wizard-error" }, state.wizard.saveError) : null,
            renderWizardContent(),
          ]),
          renderWizardFooter(),
        ]),
      ]),
    ]);
  }

  function renderManualRefreshModal() {
    const body = state.manualRefreshModal.loading
      ? h("p", { class: "status-msg" }, "loading prompt…")
      : state.manualRefreshModal.error
        ? h("p", { class: "status-msg error" }, state.manualRefreshModal.error)
        : h("textarea", {
            id: "refresh-prompt",
            class: "modal-prompt",
            readonly: "readonly",
          }, state.manualRefreshModal.prompt);

    return h("div", {
      class: "overlay-shell",
      onclick: (event) => {
        if (event.target === event.currentTarget) closeManualRefreshModal();
      },
    }, h("div", {
      class: "modal-card",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "refresh-modal-title",
    }, [
      h("div", { class: "modal-head" }, [
        h("div", null, [
          h("h2", { id: "refresh-modal-title" }, "Run Today’s Update"),
          h("p", null, "Use this prompt with any supported CLI. It stays neutral so Claude, Codex, or Gemini can run it."),
        ]),
        h("button", {
          class: "modal-close",
          type: "button",
          onclick: closeManualRefreshModal,
          "aria-label": "Close refresh modal",
        }, "×"),
      ]),
      h("div", { class: "modal-body" }, [
        state.manualRefreshModal.copyMessage
          ? h("p", {
              class: "modal-copy-state",
              dataset: { tone: state.manualRefreshModal.copyState || "idle" },
            }, state.manualRefreshModal.copyMessage)
          : null,
        body,
        h("div", { class: "modal-actions" }, [
          h("button", {
            class: "action-btn",
            type: "button",
            disabled: state.manualRefreshModal.loading || !state.manualRefreshModal.prompt,
            onclick: copyManualPromptAgain,
          }, "Copy Again"),
          h("button", {
            class: "action-btn primary",
            type: "button",
            disabled:
              state.manualRefreshModal.loading ||
              !state.manualRefreshModal.prompt ||
              state.manualRefreshModal.terminalMessage === "Opening terminal…",
            onclick: openTerminalForManual,
          }, "Open Terminal"),
        ]),
        state.manualRefreshModal.terminalMessage
          ? h("p", {
              class: "modal-terminal-state",
              dataset: { tone: state.manualRefreshModal.terminalState || "idle" },
            }, state.manualRefreshModal.terminalMessage)
          : null,
        h("p", { class: "modal-hint" }, PASTE_HINT),
      ]),
    ]));
  }

  function runUpdateTitle() {
    if (state.runUpdate.state === "starting") return "Starting update";
    if (state.runUpdate.state === "succeeded") return "Update complete";
    if (state.runUpdate.state === "failed") return "Update failed";
    return "Updating dashboard";
  }

  function runUpdateStatusText() {
    if (state.runUpdate.state === "starting") return "Starting job";
    if (state.runUpdate.state === "succeeded") return "Finished in";
    if (state.runUpdate.state === "failed") return "Stopped after";
    return "Running for";
  }

  function renderRunUpdateOverlay() {
    const isBusy = isRunUpdateBusy();
    const model = state.provider.default_model || "configured model";
    const elapsed = state.runUpdate.startedAt
      ? formatElapsed((state.runUpdate.completedAt || Date.now()) - state.runUpdate.startedAt)
      : "0s";
    const actions = isBusy
      ? [h("button", { class: "action-btn", type: "button", disabled: true }, state.runUpdate.state === "starting" ? "Starting…" : "Running…")]
      : state.runUpdate.state === "succeeded"
        ? [
            h("button", { class: "action-btn primary", type: "button", onclick: reloadDashboardFromRunUpdate }, "Reload Dashboard"),
            h("button", { class: "action-btn", type: "button", onclick: closeRunUpdateOverlay }, "Close"),
          ]
        : [
            h("button", { class: "action-btn primary", type: "button", onclick: retryRunUpdate }, "Retry"),
            h("button", { class: "action-btn", type: "button", onclick: closeRunUpdateOverlay }, "Close"),
          ];

    const card = h("div", {
      class: "modal-card run-update-card",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "ru-title",
      "aria-busy": isBusy ? "true" : "false",
      tabindex: "-1",
    }, [
      h("div", { class: "modal-head" }, [
        h("div", null, [
          h("h2", { id: "ru-title" }, runUpdateTitle()),
          h("p", { id: "ru-model" }, model + " via Agent Provider"),
        ]),
        !isBusy ? h("button", {
          class: "modal-close",
          type: "button",
          onclick: closeRunUpdateOverlay,
          "aria-label": "Close update overlay",
        }, "×") : null,
      ]),
      h("div", { class: "modal-body" }, [
        state.runUpdate.error
          ? h("p", { class: "modal-copy-state", dataset: { tone: "error" } }, state.runUpdate.error)
          : null,
        h("div", { class: "run-update-status" }, [
          h("div", {
            class: "progress-indicator",
            dataset: { state: state.runUpdate.state },
            "aria-hidden": "true",
          }),
          h("span", { id: "ru-status-text" }, runUpdateStatusText()),
          h("span", { id: "ru-elapsed" }, elapsed),
        ]),
        h("pre", { id: "ru-log", class: "run-update-log" }, runUpdateLogText()),
        h("div", { class: "modal-actions" }, actions),
      ]),
    ]);

    window.requestAnimationFrame(() => {
      card.focus({ preventScroll: true });
      updateRunUpdateDom();
    });
    return h("div", {
      class: "overlay-shell",
      onclick: (event) => {
        if (!isBusy && event.target === event.currentTarget) closeRunUpdateOverlay();
      },
    }, card);
  }

  function renderBootstrapOverlay() {
    return h("div", { class: "overlay-shell" }, h("div", {
      class: "modal-card bootstrap-card",
      role: "status",
      "aria-live": "polite",
    }, [
      h("div", { class: "bootstrap-spinner", "aria-hidden": "true" }),
      h("div", { class: "db-skeleton" }, [
        h("div", { class: "db-skeleton-row" }),
        h("div", { class: "db-skeleton-row" }),
        h("div", { class: "db-skeleton-row" }),
        h("div", { class: "db-skeleton-row" }),
      ]),
      h("h2", null, "Preparing dashboard"),
      h("p", null, "First run is seeding the local SQLite bundle so the app has something real to load."),
      h("div", { class: "bootstrap-status" }, state.bootstrap.message || "Seeding dashboard database…"),
      state.bootstrap.detail ? h("div", { class: "bootstrap-detail" }, state.bootstrap.detail) : null,
    ]));
  }

  function renderOverlay() {
    const slot = document.getElementById("overlay-root");
    if (!slot) return;
    const nodes = [];
    if (state.bootstrap.state === "initializing") nodes.push(renderBootstrapOverlay());
    else if (state.runUpdate.active) nodes.push(renderRunUpdateOverlay());
    else if (state.manualRefreshModal.open) nodes.push(renderManualRefreshModal());
    if (state.helpModal.open) {
      const helpNode = renderHelpModal();
      if (helpNode) nodes.push(helpNode);
    }
    slot.replaceChildren(...nodes);
    document.body.classList.toggle("has-overlay", nodes.length > 0);
  }

  function syncRefreshButton() {
    const button = document.getElementById("refresh-trigger");
    if (!button) return;
    const checking = !state.provider.loaded || state.provider._fetching;
    button.disabled =
      state.bootstrap.state === "initializing" ||
      checking ||
      state.runUpdate.active ||
      state.runUpdate._starting ||
      state.wizard.open ||
      state.manualRefreshModal.loading;
    const setButtonLabel = (text, showIcon) => {
      button.replaceChildren();
      if (showIcon) button.appendChild(icon("refresh-cw"));
      button.appendChild(document.createTextNode(text));
    };
    if (state.bootstrap.state === "initializing") setButtonLabel("Loading…", false);
    else if (checking) setButtonLabel("Checking…", false);
    else if (state.runUpdate.active || state.runUpdate._starting) setButtonLabel("Running…", false);
    else if (state.wizard.open) setButtonLabel("Configuring…", false);
    else if (state.manualRefreshModal.loading) setButtonLabel("Loading…", false);
    else setButtonLabel("Refresh", true);
    button.title = state.runUpdate.error && !state.runUpdate.active ? state.runUpdate.error : "";
    let isStale = false;
    if (state.lastUpdated) {
      const timestamp = Date.parse(state.lastUpdated);
      if (!Number.isNaN(timestamp)) {
        const ageHours = (Date.now() - timestamp) / 3600000;
        isStale = ageHours > 24;
      }
    }
    button.dataset.stale = String(isStale);
    let error = document.getElementById("refresh-error");
    if (state.runUpdate.error && !state.runUpdate.active) {
      if (!error) {
        error = h("span", { id: "refresh-error", class: "refresh-error", role: "status" });
        button.parentElement.appendChild(error);
      }
      error.textContent = state.runUpdate.error;
    } else if (error) {
      error.remove();
    }
  }

  function renderTable() {
    if (!state.models.length) {
      return renderEmptyState("No Models Match", "Loosen the filters or reset them to see results.");
    }
    const head = h("thead", null, h("tr", null, [
      h("th", { class: "num" }, "#"),
      h("th", null, "Model"),
      h("th", null, "Intelligence"),
      h("th", null, "Coding"),
      h("th", null, "Agent Tasks"),
      h("th", null, "Speed"),
      h("th", { class: "num" }, "Overall"),
      h("th", { class: "trend-col" }, "Trend"),
      h("th", { class: "num" }, "Cost"),
      h("th", { class: "num" }, "Value"),
    ]));

    const body = h("tbody", null, state.models.map((model, index) => {
      const overall = getOverall(model);
      const value = getValue(model);
      const isSelected = state.selectedModelIds.includes(model.id);
      const sub = [model.vendor, model.pricing || null, model.status !== "active" ? model.status : null].filter(Boolean).join(" · ");
      return h("tr", {
        id: "model-row-" + model.id,
        class: isSelected ? "selected" : null,
        tabindex: "0",
        "aria-selected": String(isSelected),
        "aria-label": (isSelected ? "Remove " : "Add ") + model.name + " comparison",
        onclick: () => toggleModelSelection(model.id),
        onkeydown: (event) => handleModelSelectionKey(event, model.id),
      }, [
        h("td", null, String(index + 1)),
        h("td", null, h("div", { class: "model-cell" }, [
          h("div", { class: "dot", style: { backgroundColor: safeHex(model.color, "#888") } }),
          h("div", null, [
            h("div", { class: "name" }, [
              model.name,
              statusBadge(model.status),
            ]),
            h("div", { class: "sub" }, sub),
          ]),
        ])),
        h("td", null, renderScoreCell(model.intelligence)),
        h("td", null, renderScoreCell(model.coding)),
        h("td", null, renderScoreCell(model.agents)),
        h("td", null, renderScoreCell(model.speed)),
        h("td", { class: "summary-cell " + tier(overall).cls }, overall !== null ? overall.toFixed(1) : "—"),
        h("td", { class: "trend-col" }, renderSparkline(model.id)),
        h("td", { class: "summary-cell " + tier(model.cost).cls }, model.cost !== null ? Number(model.cost).toFixed(1) : "—"),
        h("td", { class: "summary-cell " + tier(value).cls }, value !== null ? value.toFixed(1) : "—"),
      ]);
    }));

    return h("div", { class: "table-wrap" }, h("table", { class: "models" }, [head, body]));
  }

  function renderChart() {
    if (!state.models.length) {
      return renderEmptyState("No Chart Data", "Loosen the filters or reset them to see results.");
    }
    const rows = state.models.map((model, index) => {
      const overall = getOverall(model);
      const isSelected = state.selectedModelIds.includes(model.id);
      return h("div", {
        id: "chart-row-" + model.id,
        class: "chart-row" + (isSelected ? " selected" : ""),
        role: "button",
        tabindex: "0",
        "aria-pressed": String(isSelected),
        "aria-label": (isSelected ? "Remove " : "Add ") + model.name + " comparison",
        onclick: () => toggleModelSelection(model.id),
        onkeydown: (event) => handleModelSelectionKey(event, model.id),
      }, [
        h("span", { class: "idx" }, String(index + 1)),
        h("div", { class: "dot", style: { backgroundColor: safeHex(model.color, "#888") } }),
        h("span", { class: "name" }, model.name),
        statusBadge(model.status),
        h("div", { class: "bars" }, CHART_BARS.map((bar) => {
          const value = model[bar.key];
          const width = value == null ? 0 : clamp((Number(value) / 10) * 25, 0, 25);
          return h("div", {
            class: "bar",
            style: {
              width: width + "%",
              backgroundColor: bar.raw,
              opacity: value == null ? 0.2 : 0.85,
            },
            title: bar.label + ": " + (value == null ? "N/A" : Number(value).toFixed(1)),
          });
        })),
        h("span", { class: "overall " + tier(overall).cls }, overall !== null ? overall.toFixed(1) : "—"),
      ]);
    });

    return h("div", { class: "chart-wrap" }, [
      ...rows,
      h("div", { class: "chart-legend" }, CHART_BARS.map((bar) =>
        h("span", null, [
          h("div", { class: "swatch", style: { backgroundColor: bar.raw } }),
          bar.label,
        ])
      )),
    ]);
  }

  function renderModelSortControls() {
    const options = [
      ["overall", "Overall"],
      ["value", "Value"],
      ["trend", "Trend"],
      ["intelligence", "Intelligence"],
      ["coding", "Coding"],
      ["agents", "Agents"],
      ["speed", "Speed"],
      ["cost", "Cost"],
    ];
    return h("div", { class: "sort-group models-sort-group", role: "group", "aria-label": "Sort models" }, [
      h("span", { class: "control-label" }, "Sort"),
      ...options.map(([key, label]) => h("button", {
        class: "sort-btn",
        type: "button",
        "aria-pressed": key === state.sortBy ? "true" : "false",
        onclick: () => {
          state.sortBy = key;
          refreshModels();
          render();
        },
      }, label)),
    ]);
  }

  function renderModelsSegmented() {
    return h("div", { class: "vw-segmented models-view-switch", role: "group", "aria-label": "Models view" }, [
      ["table", "Table"],
      ["chart", "Chart"],
    ].map(([view, label]) => h("button", {
      class: "vw-segmented-item" + (state.view === view ? " active" : ""),
      type: "button",
      "aria-pressed": state.view === view ? "true" : "false",
      "aria-current": state.view === view ? "page" : null,
      onclick: () => switchView(view),
    }, label)));
  }

  function renderTierLegend() {
    return h("div", { class: "tier-legend", "aria-label": "Tier legend" }, [
      h("span", { class: "tier-chip", dataset: { tier: "S" } }, "S · 9.0+"),
      h("span", { class: "tier-chip", dataset: { tier: "A" } }, "A · 8.0+"),
      h("span", { class: "tier-chip", dataset: { tier: "B" } }, "B · 7.0+"),
      h("span", { class: "tier-chip", dataset: { tier: "C" } }, "C · 6.0+"),
      h("span", { class: "tier-chip", dataset: { tier: "D" } }, "D · 5.0+"),
      h("span", { class: "tier-chip", dataset: { tier: "F" } }, "F · <5.0"),
    ]);
  }

  function renderModelsArea() {
    const selectedModels = state.selectedModelIds
      .map((id) => state.models.find((m) => m.id === id))
      .filter(Boolean);
    return h("div", { class: "models-area" }, [
      h("div", { class: "models-toolbar" }, [
        h("div", { class: "models-toolbar-left" }, [
          renderModelsSegmented(),
          renderModelSortControls(),
        ]),
        h("button", {
          class: "vw-btn vw-btn-secondary",
          type: "button",
          disabled: !state.models.length,
          onclick: downloadModelsCsv,
        }, "Export Models CSV"),
      ]),
      renderModelFilters(),
      renderDetailPanelsNode(selectedModels),
      state.view === "chart" ? renderChart() : renderTable(),
      h("footer", { class: "models-footnote" }, [
        renderTierLegend(),
        h("p", { class: "sources" }, [
          "Overall = avg(Intelligence, Coding, Agents, Speed). Value = avg(Overall, Cost). ",
          "Scores from Artificial Analysis, SWE-bench, Terminal-Bench, OSWorld, GPQA Diamond, and vendor reports; every claim cites a URL in the changelog.",
        ]),
      ]),
    ]);
  }

  function parseJsonArray(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function safeParseJson(value) {
    if (!value) return null;
    try { return JSON.parse(value); } catch (_) { return null; }
  }

  function lookupPriorScore(modelName, field, asOfDate) {
    if (!METRIC_KEYS.includes(field)) return null;
    const lcName = String(modelName || "").toLowerCase();
    const model = state.models.find((m) => String(m.name || "").toLowerCase() === lcName);
    const history = model ? state.scoreHistory.get(model.id) : null;
    if (!history || !history.length) return null;
    let prior = null;
    for (const row of history) {
      if (row.as_of < asOfDate) {
        const value = row[field];
        if (value !== null && value !== undefined && value !== "") prior = Number(value);
      } else {
        break;
      }
    }
    return prior;
  }

  function diffChangelogs(fromDate, toDate) {
    if (!fromDate || !toDate || fromDate >= toDate) {
      return { newModels: [], scoreChanges: [], statusChanges: [] };
    }
    const newSinceA = new Map();
    const scoreDeltas = new Map();
    const statusDeltas = new Map();
    const ascending = [...state.changelogs].sort((a, b) => String(a.date).localeCompare(String(b.date)));
    for (const row of ascending) {
      if (row.date <= fromDate || row.date > toDate) continue;
      const parsed = safeParseJson(row.changed_json) || {};
      const newModelsRaw = parseJsonArray(row.new_models_json);
      for (const m of newModelsRaw) {
        const entry = typeof m === "string" ? { name: m } : m;
        const name = entry && entry.name;
        if (name && !newSinceA.has(name)) newSinceA.set(name, entry);
      }
      for (const u of (parsed.score_updates || [])) {
        if (!u || !u.name || !u.field) continue;
        const k = u.name + "|" + u.field;
        const existing = scoreDeltas.get(k);
        scoreDeltas.set(k, {
          name: u.name,
          field: u.field,
          from: existing && existing.from !== undefined ? existing.from : lookupPriorScore(u.name, u.field, row.date),
          to: u.new === undefined ? u.to : u.new,
          occurred: row.date,
          source_url: u.source_url || (existing && existing.source_url) || "",
        });
      }
      for (const s of (parsed.status_changes || [])) {
        if (!s || !s.name) continue;
        const existing = statusDeltas.get(s.name);
        statusDeltas.set(s.name, {
          name: s.name,
          from: existing && existing.from !== undefined ? existing.from : null,
          to: s.to,
          occurred: row.date,
          source_url: s.source_url || (existing && existing.source_url) || "",
        });
      }
    }
    return {
      newModels: [...newSinceA.values()],
      scoreChanges: [...scoreDeltas.values()],
      statusChanges: [...statusDeltas.values()],
    };
  }

  function renderMarkdown(markdown) {
    const article = h("article", { class: "markdown vw-markdown" });
    if (window.marked && typeof window.marked.parse === "function") {
      article.innerHTML = window.marked.parse(markdown);
      for (const anchor of article.querySelectorAll("a[href^='http']")) {
        anchor.target = "_blank";
        anchor.rel = "noreferrer";
      }
    } else {
      article.appendChild(h("pre", { class: "raw-markdown" }, markdown));
    }
    return article;
  }

  function setChangelogTab(tab) {
    const next = tab === "compare" ? "compare" : "read";
    if (state.activeChangelogTab === next) return;
    state.activeChangelogTab = next;
    if (next === "compare") {
      state.changelogCompare.active = true;
      const dates = state.changelogs.map((c) => c.date).sort();
      if (!state.changelogCompare.from && dates.length) state.changelogCompare.from = dates[0];
      if (!state.changelogCompare.to && dates.length) state.changelogCompare.to = dates[dates.length - 1];
    }
    pushChangelogRouteHash(false);
    render();
  }

  function setCompareDate(field, value) {
    if (field !== "from" && field !== "to") return;
    state.changelogCompare[field] = value || null;
    pushChangelogRouteHash(true);
    render();
  }

  function renderCompareDatePicker(label, value, field) {
    const dates = state.changelogs.map((c) => c.date).sort();
    return h("label", { class: "compare-date-field" }, [
      h("span", { class: "compare-date-label" }, label),
      h("select", {
        class: "compare-date-select",
        value: value || "",
        onchange: (event) => setCompareDate(field, event.target.value),
      }, [
        h("option", { value: "" }, "—"),
        ...dates.map((date) => h("option", { value: date, selected: date === value }, formatShortDate(date))),
      ]),
    ]);
  }

  function renderCompareScoreArrow(from, to) {
    const fromText = from === null || from === undefined ? "—" : Number(from).toFixed(1);
    const toText = to === null || to === undefined ? "—" : Number(to).toFixed(1);
    let cls = "compare-arrow";
    if (typeof from === "number" && typeof to === "number") {
      if (to > from + 0.05) cls += " up";
      else if (to < from - 0.05) cls += " down";
      else cls += " flat";
    }
    return h("span", { class: cls }, [
      h("span", { class: "compare-from" }, fromText),
      h("span", { class: "compare-arrow-glyph" }, " → "),
      h("span", { class: "compare-to" }, toText),
    ]);
  }

  function renderCompareSection(diff) {
    const { newModels, scoreChanges, statusChanges } = diff;
    const totalChanges = newModels.length + scoreChanges.length + statusChanges.length;
    if (!totalChanges) {
      return h("div", { class: "compare-empty" }, "No changes between " +
        (state.changelogCompare.from || "—") + " and " + (state.changelogCompare.to || "—") + ".");
    }
    const newModelsBlock = newModels.length ? h("div", { class: "compare-block" }, [
      h("div", { class: "compare-block-head" }, [
        h("h3", null, "New models"),
        h("span", { class: "compare-count" }, String(newModels.length)),
      ]),
      h("ul", { class: "compare-new-list" }, newModels.map((m) => h("li", null, [
        h("span", { class: "compare-model-name" }, m.name || ""),
        m.vendor ? h("span", { class: "compare-vendor-pill" }, m.vendor) : null,
      ]))),
    ]) : null;
    const byModel = new Map();
    for (const change of scoreChanges) {
      if (!byModel.has(change.name)) byModel.set(change.name, []);
      byModel.get(change.name).push(change);
    }
    const scoreBlock = scoreChanges.length ? h("div", { class: "compare-block" }, [
      h("div", { class: "compare-block-head" }, [
        h("h3", null, "Score changes"),
        h("span", { class: "compare-count" }, String(scoreChanges.length)),
      ]),
      h("div", { class: "compare-score-groups" }, [...byModel.entries()].map(([name, changes]) =>
        h("div", { class: "compare-score-group" }, [
          h("div", { class: "compare-score-group-head" }, name),
          h("ul", { class: "compare-score-list" }, changes.map((c) => h("li", null, [
            h("span", { class: "compare-field" }, c.field),
            renderCompareScoreArrow(c.from, c.to),
            h("span", { class: "compare-occurred" }, formatShortDate(c.occurred)),
            c.source_url ? h("a", {
              class: "compare-source",
              href: c.source_url,
              target: "_blank",
              rel: "noopener noreferrer",
            }, "source") : null,
          ]))),
        ])
      )),
    ]) : null;
    const statusBlock = statusChanges.length ? h("div", { class: "compare-block" }, [
      h("div", { class: "compare-block-head" }, [
        h("h3", null, "Status changes"),
        h("span", { class: "compare-count" }, String(statusChanges.length)),
      ]),
      h("ul", { class: "compare-status-list" }, statusChanges.map((s) => h("li", null, [
        h("span", { class: "compare-model-name" }, s.name),
        h("span", { class: "compare-arrow flat" }, [
          h("span", { class: "compare-from" }, s.from || "—"),
          h("span", { class: "compare-arrow-glyph" }, " → "),
          h("span", { class: "compare-to" }, s.to || "—"),
        ]),
        h("span", { class: "compare-occurred" }, formatShortDate(s.occurred)),
      ]))),
    ]) : null;
    return h("div", { class: "compare-sections" }, [newModelsBlock, scoreBlock, statusBlock].filter(Boolean));
  }

  function renderChangelogReadBody(active, cache) {
    if (!active) {
      return renderEmptyState("Select an Entry", "Choose a date from the sidebar to view its changelog.");
    }
    if (!cache || cache.status === "loading") {
      return h("div", { class: "changelog-body" }, [
        h("div", { class: "changelog-skeleton" }, [
          h("div", { class: "skeleton-line w-60" }),
          h("div", { class: "skeleton-line w-80" }),
          h("div", { class: "skeleton-line w-45" }),
          h("div", { class: "skeleton-line w-70" }),
        ]),
      ]);
    }
    if (cache.status === "error") {
      return h("p", { class: "status-msg error" }, "Failed to load changelog: " + cache.error);
    }
    return renderMarkdown(cache.body);
  }

  function renderChangelogCompareBody() {
    const fromDate = state.changelogCompare.from;
    const toDate = state.changelogCompare.to;
    const validRange = fromDate && toDate && fromDate < toDate;
    const diff = validRange ? diffChangelogs(fromDate, toDate) : { newModels: [], scoreChanges: [], statusChanges: [] };
    return h("div", { class: "compare-body" }, [
      h("div", { class: "compare-controls" }, [
        renderCompareDatePicker("From (older)", fromDate, "from"),
        renderCompareDatePicker("To (newer)", toDate, "to"),
      ]),
      validRange
        ? renderCompareSection(diff)
        : h("div", { class: "compare-empty" }, "Pick two changelog dates above (older on the left, newer on the right) to compare."),
    ]);
  }

  function renderChangelog() {
    if (!state.changelogs.length) {
      return renderEmptyState("No Changelogs Yet", "Run a daily update and entries will appear here.");
    }
    const active = state.changelogs.find((row) => row.date === state.activeChangelogDate) || state.changelogs[0];
    if (active && state.activeChangelogDate !== active.date) state.activeChangelogDate = active.date;
    if (active && state.activeChangelogTab !== "compare") ensureChangelogBody(active.date);
    const cache = active ? state.changelogBodies[active.date] : null;
    const tab = state.activeChangelogTab === "compare" ? "compare" : "read";
    const body = tab === "compare" ? renderChangelogCompareBody() : renderChangelogReadBody(active, cache);
    const tabStrip = h("div", { class: "changelog-tabs vw-segmented", role: "tablist" }, [
      ["read", "Read"],
      ["compare", "Compare"],
    ].map(([key, label]) => h("button", {
      class: "vw-segmented-item" + (tab === key ? " active" : ""),
      type: "button",
      role: "tab",
      "aria-selected": String(tab === key),
      onclick: () => setChangelogTab(key),
    }, label)));

    return h("div", { class: "changelog-view" }, [
      h("aside", { class: "changelog-list" }, state.changelogs.map((entry) => {
        const isActive = entry.date === state.activeChangelogDate;
        const newModels = parseJsonArray(entry.new_models_json);
        return h("button", {
          class: "changelog-item vw-card-compact" + (isActive ? " is-active" : ""),
          type: "button",
          onclick: () => {
            state.activeChangelogDate = entry.date;
            if (state.activeChangelogTab !== "read") {
              state.activeChangelogTab = "read";
              pushChangelogRouteHash(true);
            }
            render();
          },
        }, [
          h("div", { class: "changelog-item-top" }, [
            h("span", { class: "changelog-date" }, formatShortDate(entry.date)),
            newModels.length ? h("span", { class: "summary-pill small" }, "+" + newModels.length + " models") : null,
          ]),
          h("div", { class: "changelog-title" }, entry.title || formatDate(entry.date)),
          entry.summary ? h("p", { class: "changelog-summary" }, entry.summary) : null,
        ]);
      })),
      h("section", { class: "changelog-panel" }, [
        h("div", { class: "changelog-panel-head" }, [
          h("div", null, [
            h("p", { class: "eyebrow" }, tab === "compare" ? "Compare" : (active ? active.date : "")),
            h("h2", null, tab === "compare" ? "Compare changelogs" : (active ? (active.title || formatDate(active.date)) : "Changelog")),
          ]),
          tab === "read" && active && active.summary ? h("p", { class: "panel-summary" }, active.summary) : null,
          tabStrip,
        ]),
        body,
      ]),
    ]);
  }

  function renderChangelogArea() {
    return renderChangelog();
  }

  function statCard(label, value, note, tone) {
    return h("div", { class: "stats-card vw-metric" + (tone ? " " + tone : "") }, [
      h("div", { class: "stats-value vw-metric-value" }, value),
      h("div", { class: "stats-label vw-metric-label" }, label),
      note ? h("div", { class: "stats-note vw-hint" }, note) : null,
    ]);
  }

  const LEADERBOARD_COLUMNS = [
    { key: "runs", label: "Runs", sortable: true, defaultDir: "desc", numeric: true },
    { key: "totalCost", label: "Total cost", sortable: true, defaultDir: "desc", numeric: true },
    { key: "costPerWord", label: "Cost / word", sortable: true, defaultDir: "asc", numeric: true },
    { key: "wordsPerDollar", label: "Words / $", sortable: true, defaultDir: "desc", numeric: true },
    { key: "minDuration", label: "Fastest run (min)", sortable: true, defaultDir: "asc", numeric: true },
  ];
  const LEADERBOARD_KEYS = new Set(LEADERBOARD_COLUMNS.map((column) => column.key));

  function leaderboardSortMarker(key) {
    const sort = state.ui.statsLeaderboardSort;
    if (!sort || sort.sortBy !== key) return "";
    return sort.direction === "asc" ? " ↑" : " ↓";
  }

  function toggleLeaderboardSort(key) {
    if (!LEADERBOARD_KEYS.has(key)) return;
    const sort = state.ui.statsLeaderboardSort;
    if (sort.sortBy === key) {
      sort.direction = sort.direction === "asc" ? "desc" : "asc";
    } else {
      const column = LEADERBOARD_COLUMNS.find((c) => c.key === key);
      sort.sortBy = key;
      sort.direction = column?.defaultDir || "desc";
    }
    persistUIState();
    render();
  }

  function compareLeaderboardEntries(a, b, key, dir) {
    const left = a[key];
    const right = b[key];
    const leftMissing = left === null || left === undefined || !Number.isFinite(left);
    const rightMissing = right === null || right === undefined || !Number.isFinite(right);
    if (leftMissing && rightMissing) return a.group.label.localeCompare(b.group.label);
    if (leftMissing) return 1;
    if (rightMissing) return -1;
    const sign = dir === "asc" ? 1 : -1;
    if (left === right) return a.group.label.localeCompare(b.group.label);
    return left < right ? -1 * sign : 1 * sign;
  }

  function renderAgentLeaderboard(rows) {
    const grouped = groupMetricsByAgent(rows);
    if (!grouped.length) {
      return h("div", { class: "leaderboard-empty stats-card vw-metric" }, [
        h("div", { class: "stats-value vw-metric-value" }, "—"),
        h("div", { class: "stats-label vw-metric-label" }, "No agents match the current filter"),
      ]);
    }
    const entries = grouped.map((group) => {
      const derived = deriveLeaderboardMetrics(group);
      return {
        group,
        runs: group.runs,
        totalCost: group.costCount > 0 ? group.totalCost : null,
        costPerWord: derived.costPerWord,
        wordsPerDollar: derived.wordsPerDollar,
        minDuration: derived.minDuration,
        medianDuration: derived.medianDuration,
        fastestEligible: derived.fastestEligible,
      };
    });

    const bestEntries = {};
    for (const column of LEADERBOARD_COLUMNS) {
      const dir = column.defaultDir;
      const ranked = [...entries].sort((a, b) => compareLeaderboardEntries(a, b, column.key, dir));
      const top = ranked.find((e) => {
        const v = e[column.key];
        return v !== null && v !== undefined && Number.isFinite(v);
      });
      bestEntries[column.key] = top || null;
    }

    const summaryTiles = [];
    if (bestEntries.costPerWord) {
      summaryTiles.push(statCard(
        "Best cost / word",
        formatMicroCost(bestEntries.costPerWord.costPerWord),
        bestEntries.costPerWord.group.label,
      ));
    } else {
      summaryTiles.push(statCard("Best cost / word", "—", "Needs paired cost + word data"));
    }
    if (bestEntries.wordsPerDollar) {
      summaryTiles.push(statCard(
        "Most words / $",
        formatNumber(bestEntries.wordsPerDollar.wordsPerDollar, 0),
        bestEntries.wordsPerDollar.group.label,
      ));
    } else {
      summaryTiles.push(statCard("Most words / $", "—", "Needs paired cost + word data"));
    }
    if (bestEntries.minDuration) {
      summaryTiles.push(statCard(
        "Fastest run (best)",
        formatDuration(bestEntries.minDuration.minDuration),
        bestEntries.minDuration.group.label,
      ));
    } else {
      summaryTiles.push(statCard("Fastest run (best)", "—", "Needs ≥ 3 timed runs per agent"));
    }

    const sort = state.ui.statsLeaderboardSort;
    const activeKey = LEADERBOARD_KEYS.has(sort.sortBy) ? sort.sortBy : "costPerWord";
    const activeDir = sort.direction === "asc" ? "asc" : "desc";
    const sorted = [...entries].sort((a, b) => compareLeaderboardEntries(a, b, activeKey, activeDir));
    const valuedCount = sorted.filter((entry) => {
      const v = entry[activeKey];
      return v !== null && v !== undefined && Number.isFinite(v);
    }).length;
    const eligibleForTopHighlight = grouped.length >= 3 && valuedCount >= 3;

    const renderHeaderCell = (column) => {
      const cls = column.numeric ? "num" : null;
      const isActive = activeKey === column.key;
      const ariaSort = isActive ? (activeDir === "asc" ? "ascending" : "descending") : "none";
      return h("th", { class: cls, "aria-sort": ariaSort }, h("button", {
        class: "table-sort-btn",
        type: "button",
        onclick: () => toggleLeaderboardSort(column.key),
      }, column.label + leaderboardSortMarker(column.key)));
    };

    const rowsBody = sorted.map((entry, idx) => {
      const valuedRank = entry[activeKey] !== null && entry[activeKey] !== undefined && Number.isFinite(entry[activeKey]);
      const rankBadgeIndex = valuedRank ? idx + 1 : null;
      const rankBadgeClass = ["leaderboard-rank"];
      if (eligibleForTopHighlight && rankBadgeIndex && rankBadgeIndex <= 3) {
        rankBadgeClass.push("rank-" + rankBadgeIndex);
      } else if (!valuedRank) {
        rankBadgeClass.push("rank-blank");
      }
      const rankCell = h("td", null, h("span", { class: rankBadgeClass.join(" ") },
        rankBadgeIndex ? "#" + rankBadgeIndex : "—"));

      const agentCell = h("td", null, h("div", { class: "leaderboard-agent" }, [
        h("div", { class: "leaderboard-agent-name" }, entry.group.agentName || "unknown"),
        h("div", { class: "leaderboard-agent-runtime" }, entry.group.agentRuntime || "unknown"),
      ]));

      const runsCell = h("td", { class: "num" }, String(entry.runs));

      const totalCostNote = entry.group.runs && entry.group.costCount < entry.group.runs
        ? entry.group.costCount + " of " + entry.group.runs + " runs reported cost"
        : null;
      const totalCostCell = h("td", {
        class: "num",
        title: totalCostNote || undefined,
      }, entry.totalCost !== null ? formatCurrency(entry.totalCost) : "—");

      const costPerWordCell = entry.costPerWord !== null
        ? h("td", { class: "num" }, formatMicroCost(entry.costPerWord))
        : h("td", { class: "num" }, [
            h("span", { class: "leaderboard-dim" }, "—"),
            h("span", { class: "vw-status-chip vw-status-warning leaderboard-chip" }, "no cost data"),
          ]);

      const wordsPerDollarCell = entry.wordsPerDollar !== null
        ? h("td", { class: "num" }, formatNumber(entry.wordsPerDollar, 0))
        : h("td", { class: "num" }, [
            h("span", { class: "leaderboard-dim" }, "—"),
            h("span", { class: "vw-status-chip vw-status-warning leaderboard-chip" }, "no cost data"),
          ]);

      let fastestCell;
      if (entry.fastestEligible && entry.minDuration !== null) {
        const tooltip = "min " + formatDuration(entry.minDuration)
          + " · median " + formatDuration(entry.medianDuration)
          + " · n=" + entry.group.durations.length;
        fastestCell = h("td", { class: "num", title: tooltip }, formatDuration(entry.minDuration));
      } else {
        fastestCell = h("td", { class: "num" }, [
          h("span", { class: "leaderboard-dim" }, "—"),
          h("span", { class: "vw-status-chip vw-status-warning leaderboard-chip" }, "n=" + entry.group.durations.length),
        ]);
      }

      return h("tr", null, [
        rankCell,
        agentCell,
        runsCell,
        totalCostCell,
        costPerWordCell,
        wordsPerDollarCell,
        fastestCell,
      ]);
    });

    return h("div", { class: "leaderboard" }, [
      h("div", { class: "leaderboard-summary stats-grid" }, summaryTiles),
      h("div", { class: "table-wrap leaderboard-table-wrap" }, h("table", { class: "data-table leaderboard-table" }, [
        h("thead", null, h("tr", null, [
          h("th", { class: "leaderboard-rank-head" }, "Rank"),
          h("th", null, "Agent"),
          ...LEADERBOARD_COLUMNS.map(renderHeaderCell),
        ])),
        h("tbody", null, rowsBody),
      ])),
    ]);
  }

  function renderAgentBreakdown(rows) {
    const grouped = groupMetricsByAgent(rows);
    return h("div", { class: "table-wrap" }, h("table", { class: "data-table" }, [
      h("thead", null, h("tr", null, [
        h("th", null, "Agent"),
        h("th", { class: "num" }, "Runs"),
        h("th", { class: "num" }, "Total cost"),
        h("th", { class: "num" }, "Avg duration"),
        h("th", { class: "num" }, "Avg input"),
        h("th", { class: "num" }, "Avg output"),
        h("th", { class: "num" }, "Avg words"),
      ])),
      h("tbody", null, grouped.map((group) => h("tr", null, [
        h("td", null, group.label),
        h("td", { class: "num" }, String(group.runs)),
        h("td", { class: "num" }, group.costCount ? formatCurrency(group.totalCost) : "—"),
        h("td", { class: "num" }, group.durationCount ? formatDuration(group.totalDuration / group.durationCount) : "—"),
        h("td", { class: "num" }, group.inputCount ? formatCompactNumber(group.totalInput / group.inputCount) : "—"),
        h("td", { class: "num" }, group.outputCount ? formatCompactNumber(group.totalOutput / group.outputCount) : "—"),
        h("td", { class: "num" }, group.wordCountCount ? formatNumber(group.totalWords / group.wordCountCount, 0) : "—"),
      ]))),
    ]));
  }

  function renderRunTable(rows) {
    const sorted = sortedMetricsRows(rows);
    const headers = [
      { key: "changelog_date", label: "Date" },
      { key: "agent", label: "Agent" },
      { key: "duration_sec", label: "Duration" },
      { key: "cost_usd", label: "Cost" },
      { key: "tokens_input", label: "Input" },
      { key: "tokens_output", label: "Output" },
      { key: "tokens_cached", label: "Cached" },
      { key: "word_count", label: "Words" },
      { key: "exa_searches", label: "Exa" },
    ];

    return h("div", { class: "table-wrap" }, h("table", { class: "data-table" }, [
      h("thead", null, h("tr", null, headers.map((header) =>
        h("th", { class: header.key === "agent" ? null : "num" }, h("button", {
          class: "table-sort-btn",
          type: "button",
          onclick: () => toggleStatsSort(header.key),
        }, header.label + statsSortMarker(header.key)))
      ))),
      h("tbody", null, sorted.map((row) => h("tr", null, [
        h("td", { class: "num" }, h("button", {
          class: "table-link-btn",
          type: "button",
          onclick: () => {
            state.activeChangelogDate = row.changelog_date;
            switchView("changelog");
          },
        }, formatShortDate(row.changelog_date))),
        h("td", null, formatAgentLabel(row)),
        h("td", { class: "num" }, formatDuration(row.duration_sec)),
        h("td", { class: "num" }, formatCurrency(row.cost_usd)),
        h("td", { class: "num" }, formatCompactNumber(row.tokens_input)),
        h("td", { class: "num" }, formatCompactNumber(row.tokens_output)),
        h("td", { class: "num" }, formatCompactNumber(row.tokens_cached)),
        h("td", { class: "num" }, formatNumber(row.word_count, 0)),
        h("td", { class: "num" }, formatNumber(row.exa_searches, 0) + " / " + formatNumber(row.exa_fetches, 0)),
      ]))),
    ]));
  }

  function renderStatsView() {
    const rows = getFilteredMetrics();
    const statsActions = h("div", { class: "stats-actions" }, h("a", {
      class: "vw-btn vw-btn-secondary",
      href: "/data/run_metrics.csv",
      download: "run_metrics.csv",
    }, "Download Metrics CSV"));
    if (!rows.length) {
      return h("div", { class: "stats-view" }, [
        statsActions,
        renderStatsFilters(),
        renderEmptyState("No Runs Match", "Try widening the date range or clearing the agent filter."),
      ]);
    }

    const totals = {
      runs: rows.length,
      cost: sumField(rows, "cost_usd"),
      duration: sumField(rows, "duration_sec"),
      input: sumField(rows, "tokens_input"),
      output: sumField(rows, "tokens_output"),
      cached: sumField(rows, "tokens_cached"),
      words: sumField(rows, "word_count"),
    };
    const averages = {
      cost: averageField(rows, "cost_usd"),
      duration: averageField(rows, "duration_sec"),
      input: averageField(rows, "tokens_input"),
      output: averageField(rows, "tokens_output"),
      words: averageField(rows, "word_count"),
      costPerWord: ratio(rows, "cost_usd", "word_count"),
    };

    return h("div", { class: "stats-view" }, [
      statsActions,
      renderStatsFilters(),
      h("section", { class: "stats-section" }, [
        h("div", { class: "section-head" }, [
          h("h2", null, "Totals"),
          h("p", null, "Cost, tokens, duration, and word counts across the filtered runs."),
        ]),
        h("div", { class: "stats-grid" }, [
          statCard("Runs", formatNumber(totals.runs, 0), "Changelogs with run metadata"),
          statCard("Total cost", formatCurrency(totals.cost), "Excludes runs without cost data"),
          statCard("Total duration", formatDuration(totals.duration), "Wall-clock time across all runs"),
          statCard("Input tokens", formatCompactNumber(totals.input), FULL_NUMBER.format(totals.input || 0)),
          statCard("Output tokens", formatCompactNumber(totals.output), FULL_NUMBER.format(totals.output || 0)),
          statCard("Cached tokens", formatCompactNumber(totals.cached), FULL_NUMBER.format(totals.cached || 0)),
          statCard("Words", formatCompactNumber(totals.words), FULL_NUMBER.format(totals.words || 0)),
        ]),
      ]),
      h("section", { class: "stats-section" }, [
        h("div", { class: "section-head" }, [
          h("h2", null, "Averages"),
          h("p", null, "Useful for spotting when the update flow gets slow, wordy, or expensive."),
        ]),
        h("div", { class: "stats-grid" }, [
          statCard("Cost / run", formatCurrency(averages.cost), "Average across rows with known cost"),
          statCard("Duration / run", formatDuration(averages.duration), "Average wall-clock duration"),
          statCard("Input / run", formatCompactNumber(averages.input), averages.input !== null ? FULL_NUMBER.format(Math.round(averages.input)) : "—"),
          statCard("Output / run", formatCompactNumber(averages.output), averages.output !== null ? FULL_NUMBER.format(Math.round(averages.output)) : "—"),
          statCard("Words / run", formatNumber(averages.words, 0), "Changelog body only"),
          statCard("Cost / word", formatCurrency(averages.costPerWord), "Runs with both cost and word data"),
        ]),
      ]),
      h("section", { class: "stats-section" }, [
        h("div", { class: "section-head" }, [
          h("h2", null, "Agent Provider Leaderboard"),
          h("p", null, "Ranks each agent + runtime by efficiency and best wall-clock. Cost-per-word and words-per-dollar use only runs that report both cost and word count; fastest run requires at least three timed runs."),
        ]),
        renderAgentLeaderboard(rows),
      ]),
      h("section", { class: "stats-section" }, [
        h("div", { class: "section-head" }, [
          h("h2", null, "Time Series"),
          h("p", null, "Daily totals across all runs. Hover for exact values."),
        ]),
        h("div", { class: "chart-card-grid" }, [
          h("div", { class: "chart-card" }, [
            h("div", { class: "chart-card-head" }, [h("h3", null, "Cost by day"), h("span", null, "bar")]),
            h("div", { id: "stats-chart-cost", class: "stats-chart" }),
          ]),
          h("div", { class: "chart-card" }, [
            h("div", { class: "chart-card-head" }, [h("h3", null, "Duration by day"), h("span", null, "line")]),
            h("div", { id: "stats-chart-duration", class: "stats-chart" }),
          ]),
          h("div", { class: "chart-card" }, [
            h("div", { class: "chart-card-head" }, [h("h3", null, "Output tokens by day"), h("span", null, "line")]),
            h("div", { id: "stats-chart-output", class: "stats-chart" }),
          ]),
          h("div", { class: "chart-card" }, [
            h("div", { class: "chart-card-head" }, [h("h3", null, "Words by day"), h("span", null, "line")]),
            h("div", { id: "stats-chart-words", class: "stats-chart" }),
          ]),
        ]),
      ]),
      h("section", { class: "stats-section" }, [
        h("div", { class: "section-head" }, [
          h("h2", null, "Per-Agent Breakdown"),
          h("p", null, "Grouped by agent model and provider for side-by-side comparison."),
        ]),
        renderAgentBreakdown(rows),
      ]),
      h("section", { class: "stats-section" }, [
        h("div", { class: "section-head" }, [
          h("h2", null, "Run Metrics"),
          h("p", null, "All recorded runs. Click a column header to sort, or a date to view that changelog."),
        ]),
        renderRunTable(rows),
      ]),
    ]);
  }

  function renderStatsArea() {
    return renderStatsView();
  }

  function settingsField(label, control, hint) {
    return h("label", { class: "vw-field" }, [
      h("span", { class: "vw-label" }, label),
      control,
      hint ? h("span", { class: "vw-hint" }, hint) : null,
    ]);
  }

  function renderSettingsGroup({ id, title, summary, children }) {
    return h("section", { class: "vw-settings-group", id }, [
      h("div", { class: "vw-settings-group-head" }, [
        h("h3", null, title),
        summary ? h("p", null, summary) : null,
      ]),
      h("div", { class: "vw-settings-group-body" }, children),
    ]);
  }

  function settingsStatusChip(text, tone) {
    if (!text) return null;
    const cls = "vw-status-chip" + (tone === "success" ? " vw-status-success" : tone === "error" ? " vw-status-error" : tone === "loading" ? " vw-status-generating" : "");
    return h("span", { class: cls }, text);
  }

  function authSourceLabel(source) {
    const labels = {
      env: "Environment",
      "voidware-broker": "Voidware broker",
      "keyring-legacy": "Legacy keyring",
      "auth-file-legacy": "Legacy auth file",
      missing: "Not configured",
    };
    return labels[source] || "Unavailable";
  }

  function brokerStatusCopy(code) {
    const labels = {
      approval_required: "Approval needed",
      grant_denied: "Grant denied",
      grant_invalidated: "Grant expired",
      cli_unavailable: "CLI unavailable",
      broker_timeout: "Broker timed out",
      broker_unavailable: "Broker unavailable",
    };
    return labels[code] || "Broker unavailable";
  }

  function renderCredentialStatus(label, status) {
    const source = status && status.source ? status.source : "missing";
    const tone = status && status.configured ? (source === "voidware-broker" ? "success" : "idle") : "error";
    return h("div", { class: "settings-auth-status vw-display-row" }, [
      h("span", { class: "vw-display-row-label" }, label),
      h("span", { class: "vw-display-row-value" }, [
        settingsStatusChip(authSourceLabel(source), tone),
        status && status.legacy_migration_available
          ? h("span", { class: "vw-status-chip" }, "Migration available")
          : null,
      ]),
    ]);
  }

  function renderBrokerStatus() {
    const broker = state.provider.auth && state.provider.auth.broker ? state.provider.auth.broker : null;
    if (!broker) return null;
    const available = Boolean(broker.available);
    const summary = available
      ? "Broker ready" + (broker.persistence ? " · " + broker.persistence : "")
      : broker.cli_available ? "Broker unavailable" : "CLI unavailable";
    const nextAction = available
      ? "Secrets are managed through the local grant broker."
      : brokerStatusCopy(broker.error_code) + ". Open the Voidware approval surface, then retry the save.";
    return h("div", { class: "settings-auth-broker vw-card vw-card-compact" }, [
      h("div", { class: "settings-auth-broker-head" }, [
        h("strong", null, "Voidware Auth"),
        settingsStatusChip(summary, available ? "success" : "error"),
      ]),
      h("p", null, nextAction),
      h("div", { class: "vw-summary-chip-row" }, [
        h("span", { class: "vw-summary-chip" }, "Max grant TTL " + (broker.grant_ttl || "120d")),
        !available && broker.error_code ? h("span", { class: "vw-summary-chip" }, brokerStatusCopy(broker.error_code)) : null,
      ]),
    ]);
  }

  function passwordFieldWithToggle(id, value, onInput, show, onToggleShow, placeholder, label) {
    const fieldLabel = label || "API key";
    return h("div", { class: "settings-password-wrap" }, [
      h("input", {
        id: id,
        class: "vw-input settings-password-input",
        type: show ? "text" : "password",
        value: value,
        placeholder: placeholder || "",
        oninput: onInput,
        autocomplete: "off",
      }),
      h("button", {
        class: "vw-btn vw-btn-icon settings-password-toggle",
        type: "button",
        "aria-label": (show ? "Hide " : "Show ") + fieldLabel,
        onclick: onToggleShow,
      }, [icon(show ? "eye-off" : "eye")]),
    ]);
  }

  function settingsScheduleUtcEcho() {
    const parts = String(state.settings.scheduleTimeLocal || "09:00").split(":");
    const date = new Date();
    date.setHours(Number(parts[0] || 9), Number(parts[1] || 0), 0, 0);
    return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC", timeZoneName: "short" });
  }

  function toggleSettingsSection(key) {
    state.ui.settingsCollapsed[key] = !state.ui.settingsCollapsed[key];
    persistUIState();
    render();
  }

  function initSettingsScheduleState() {
    if (!state.schedule.loaded) return;
    const s = state.settings;
    if (s._scheduleInitialized) return;
    s._scheduleInitialized = true;
    s.scheduleCadence = state.schedule.enabled && state.schedule.cadence !== "off" ? state.schedule.cadence : "off";
    s.scheduleTimeLocal = state.schedule.time_local || "09:00";
    s.scheduleDayOfWeek = state.schedule.day_of_week || 1;
    s.scheduleDayOfMonth = state.schedule.day_of_month || 1;
  }

  async function settingsSaveProvider(formEl) {
    const s = state.settings;
    s.providerSaving = true;
    s.providerStatus = "";
    render();
    try {
      const base_url = (s.draftBaseUrl !== null ? s.draftBaseUrl : state.provider.base_url || "").trim();
      const endpoint_mode = s.draftEndpointMode !== null ? s.draftEndpointMode : state.provider.endpoint_mode || "append_v1";
      const api_key = s.draftApiKey.trim();
      const default_model = (s.draftDefaultModel !== null ? s.draftDefaultModel : state.provider.default_model || "").trim();
      const backup_model = (s.draftBackupModel !== null ? s.draftBackupModel : state.provider.backup_model || "").trim();
      const models_override_url = state.provider.models_override_url || "";
      if (!base_url) throw new Error("Base URL is required");
      if (!default_model) throw new Error("Default model is required");
      const payload = { base_url, endpoint_mode, default_model, backup_model, models_override_url };
      if (api_key) payload.api_key = api_key;
      await fetchJson("/api/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await fetchProvider();
      s.draftBaseUrl = null;
      s.draftEndpointMode = null;
      s.draftApiKey = "";
      s.draftDefaultModel = null;
      s.draftBackupModel = null;
      s.providerStatus = "Provider saved";
      s.providerStatusTone = "success";
      s.modelsList = [];
      settingsLoadModels();
    } catch (error) {
      s.providerStatus = String(error?.message || error);
      s.providerStatusTone = "error";
    } finally {
      s.providerSaving = false;
      render();
    }
  }

  async function settingsTestConnection() {
    const s = state.settings;
    s.testingConnection = true;
    s.connectionResult = null;
    render();
    try {
      const base_url = (s.draftBaseUrl !== null ? s.draftBaseUrl : state.provider.base_url || "").trim();
      const endpoint_mode = s.draftEndpointMode !== null ? s.draftEndpointMode : state.provider.endpoint_mode || "append_v1";
      const api_key = s.draftApiKey.trim();
      const default_model = (s.draftDefaultModel !== null ? s.draftDefaultModel : state.provider.default_model || "").trim();
      const payload = { base_url, endpoint_mode, default_model };
      if (api_key) payload.api_key = api_key;
      const result = await fetchJson("/api/provider/test-connection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      s.connectionResult = result;
    } catch (error) {
      s.connectionResult = { ok: false, error: String(error?.message || error) };
    } finally {
      s.testingConnection = false;
      render();
    }
  }

  async function settingsLoadModels() {
    const s = state.settings;
    s.modelsLoading = true;
    s.modelsError = "";
    render();
    try {
      const result = await fetchJson("/api/provider/models");
      s.modelsList = Array.isArray(result.models) ? result.models : [];
      if (!s.modelsList.length) s.modelsError = "No models returned";
    } catch (error) {
      s.modelsList = [];
      s.modelsError = String(error?.message || error);
    } finally {
      s.modelsLoading = false;
      render();
    }
  }

  async function settingsTestModel(target) {
    const s = state.settings;
    const key = target === "backup" ? "testingBackup" : "testingDefault";
    const resultKey = target === "backup" ? "backupTestResult" : "defaultTestResult";
    s[key] = true;
    s[resultKey] = null;
    render();
    try {
      const result = await fetchJson("/api/provider/test-model", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target }),
      });
      s[resultKey] = result;
    } catch (error) {
      s[resultKey] = { ok: false, error: String(error?.message || error) };
    } finally {
      s[key] = false;
      render();
    }
  }

  async function settingsSaveExa() {
    const s = state.settings;
    const key = s.draftExaKey.trim();
    if (!key) { s.exaStatus = "API key is required"; s.exaStatusTone = "error"; render(); return; }
    s.exaSaving = true;
    s.exaStatus = "";
    render();
    try {
      await fetchJson("/api/exa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key }),
      });
      await fetchProvider();
      s.exaStatus = "Exa key saved";
      s.exaStatusTone = "success";
      s.draftExaKey = "";
    } catch (error) {
      s.exaStatus = String(error?.message || error);
      s.exaStatusTone = "error";
    } finally {
      s.exaSaving = false;
      render();
    }
  }

  async function settingsRemoveExa() {
    const s = state.settings;
    s.exaRemoving = true;
    s.exaStatus = "";
    render();
    try {
      await fetchJson("/api/exa", { method: "DELETE" });
      await fetchProvider();
      s.exaStatus = "Exa key removed";
      s.exaStatusTone = "success";
      s.exaConfirmRemove = false;
      s.draftExaKey = "";
      s.showExaKey = false;
    } catch (error) {
      s.exaStatus = String(error?.message || error);
      s.exaStatusTone = "error";
    } finally {
      s.exaRemoving = false;
      render();
    }
  }

  async function settingsSaveLLMStats() {
    const s = state.settings;
    const key = s.draftLLMStatsKey.trim();
    if (!key) { s.llmstatsStatus = "API key is required"; s.llmstatsStatusTone = "error"; render(); return; }
    s.llmstatsSaving = true;
    s.llmstatsStatus = "";
    render();
    try {
      await fetchJson("/api/llmstats", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ api_key: key }),
      });
      await fetchProvider();
      s.llmstatsStatus = "LLM Stats key saved";
      s.llmstatsStatusTone = "success";
      s.draftLLMStatsKey = "";
    } catch (error) {
      s.llmstatsStatus = String(error?.message || error);
      s.llmstatsStatusTone = "error";
    } finally {
      s.llmstatsSaving = false;
      render();
    }
  }

  async function settingsRemoveLLMStats() {
    const s = state.settings;
    s.llmstatsRemoving = true;
    s.llmstatsStatus = "";
    render();
    try {
      await fetchJson("/api/llmstats", { method: "DELETE" });
      await fetchProvider();
      s.llmstatsStatus = "LLM Stats key removed";
      s.llmstatsStatusTone = "success";
      s.llmstatsConfirmRemove = false;
      s.draftLLMStatsKey = "";
      s.showLLMStatsKey = false;
      s.llmstatsTestResult = null;
    } catch (error) {
      s.llmstatsStatus = String(error?.message || error);
      s.llmstatsStatusTone = "error";
    } finally {
      s.llmstatsRemoving = false;
      render();
    }
  }

  async function settingsTestLLMStats() {
    const s = state.settings;
    s.llmstatsTesting = true;
    s.llmstatsTestResult = null;
    s.llmstatsStatus = "";
    render();
    try {
      const result = await fetchJson("/api/llmstats/test-connection");
      s.llmstatsTestResult = result;
      s.llmstatsStatus = result.ok ? "Connection successful" : "Connection failed (HTTP " + result.status_code + ")";
      s.llmstatsStatusTone = result.ok ? "success" : "error";
    } catch (error) {
      s.llmstatsTestResult = { ok: false, error: String(error?.message || error) };
      s.llmstatsStatus = String(error?.message || error);
      s.llmstatsStatusTone = "error";
    } finally {
      s.llmstatsTesting = false;
      render();
    }
  }

  async function settingsRemoveProviderKey() {
    const s = state.settings;
    s.providerKeyRemoving = true;
    render();
    try {
      await fetchJson("/api/provider/key", { method: "DELETE" });
      await fetchProvider();
      s.providerStatus = "API key removed";
      s.providerStatusTone = "success";
      s.providerKeyConfirmRemove = false;
    } catch (error) {
      s.providerStatus = String(error?.message || error);
      s.providerStatusTone = "error";
    } finally {
      s.providerKeyRemoving = false;
      render();
    }
  }

  async function settingsSaveSchedule() {
    const s = state.settings;
    s.scheduleSaving = true;
    s.scheduleStatus = "";
    render();
    try {
      const payload = { cadence: s.scheduleCadence, time_local: s.scheduleTimeLocal };
      if (s.scheduleCadence === "weekly") payload.day_of_week = s.scheduleDayOfWeek;
      if (s.scheduleCadence === "monthly") payload.day_of_month = s.scheduleDayOfMonth;
      if (s.scheduleCadence === "off") {
        await fetchJson("/api/schedule", { method: "DELETE" });
      } else {
        await fetchJson("/api/schedule", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      await fetchSchedule();
      s.scheduleStatus = s.scheduleCadence === "off" ? "Schedule removed" : "Schedule saved";
      s.scheduleStatusTone = "success";
    } catch (error) {
      s.scheduleStatus = String(error?.message || error);
      s.scheduleStatusTone = "error";
    } finally {
      s.scheduleSaving = false;
      render();
    }
  }

  async function settingsRemoveSchedule() {
    const s = state.settings;
    s.scheduleRemoving = true;
    s.scheduleStatus = "";
    render();
    try {
      await fetchJson("/api/schedule", { method: "DELETE" });
      await fetchSchedule();
      s.scheduleCadence = "off";
      s.scheduleStatus = "Schedule removed";
      s.scheduleStatusTone = "success";
    } catch (error) {
      s.scheduleStatus = String(error?.message || error);
      s.scheduleStatusTone = "error";
    } finally {
      s.scheduleRemoving = false;
      render();
    }
  }

  function renderSettingsProviderSection() {
    const s = state.settings;
    const presets = state.providerPresets.providers || [];
    const currentPresetId = presets.find((p) => p.base_url === state.provider.base_url)?.id || "";
    const connResult = s.connectionResult;
    return renderSettingsGroup({
      id: "settings-provider",
      title: "Agent Provider",
      summary: state.provider.has_provider ? state.provider.default_model + " via " + state.provider.base_url : "Not configured",
      children: [
        h("form", { class: "settings-form", onsubmit: (e) => { e.preventDefault(); settingsSaveProvider(e.target); } }, [
          presets.length ? settingsField("Preset", h("select", {
            class: "vw-select",
            value: currentPresetId,
            onchange: (e) => {
              const preset = presets.find((p) => p.id === e.target.value);
              if (!preset) return;
              s.draftBaseUrl = preset.default_base_url || "";
              s.draftEndpointMode = preset.endpoint_mode || "append_v1";
              render();
            },
          }, [
            h("option", { value: "" }, "Custom"),
            ...presets.map((p) => h("option", { value: p.id, selected: p.id === currentPresetId }, p.label || p.id)),
          ])) : null,
          settingsField("Base URL", h("input", {
            id: "settings-base-url",
            class: "vw-input",
            type: "text",
            value: s.draftBaseUrl !== null ? s.draftBaseUrl : state.provider.base_url || "",
            required: true,
            placeholder: "https://api.openai.com",
            oninput: (e) => { s.draftBaseUrl = e.target.value; },
          })),
          settingsField("Endpoint mode", h("select", {
            id: "settings-endpoint-mode",
            class: "vw-select",
            value: s.draftEndpointMode !== null ? s.draftEndpointMode : state.provider.endpoint_mode || "append_v1",
            onchange: (e) => { s.draftEndpointMode = e.target.value; },
          }, [
            h("option", { value: "append_v1", selected: (s.draftEndpointMode !== null ? s.draftEndpointMode : state.provider.endpoint_mode) !== "root" }, "Append /v1"),
            h("option", { value: "root", selected: (s.draftEndpointMode !== null ? s.draftEndpointMode : state.provider.endpoint_mode) === "root" }, "Root (use URL as-is)"),
          ])),
          settingsField("API key", passwordFieldWithToggle(
            "settings-api-key", s.draftApiKey, (e) => { s.draftApiKey = e.target.value; }, s.showApiKey,
            () => { s.showApiKey = !s.showApiKey; render(); },
            state.provider.has_provider ? "••••••••  (leave empty to keep current)" : "Enter API key",
            "provider API key"
          )),
          renderBrokerStatus(),
          renderCredentialStatus("Provider key", state.provider.auth && state.provider.auth.provider),
          h("div", { class: "settings-actions" }, [
            h("button", { class: "vw-btn vw-btn-primary", type: "submit", disabled: s.providerSaving }, s.providerSaving ? "Saving…" : "Save Provider"),
            h("button", { class: "vw-btn vw-btn-secondary", type: "button", disabled: s.testingConnection || !state.provider.has_provider, onclick: settingsTestConnection }, s.testingConnection ? "Testing…" : "Test Connection"),
            state.provider.has_provider ? h("button", {
              class: "vw-btn vw-btn-danger", type: "button",
              disabled: s.providerKeyRemoving,
              onclick: () => {
                if (s.providerKeyConfirmRemove) { settingsRemoveProviderKey(); } else { s.providerKeyConfirmRemove = true; render(); }
              },
            }, s.providerKeyConfirmRemove ? "Confirm Remove Key" : "Remove API Key") : null,
            s.providerKeyConfirmRemove ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => { s.providerKeyConfirmRemove = false; render(); } }, "Cancel") : null,
          ]),
          settingsStatusChip(s.providerStatus, s.providerStatusTone),
          connResult ? h("div", { class: "settings-test-result" }, [
            settingsStatusChip(connResult.ok ? "Connection OK — " + (connResult.models_count || 0) + " models" : "Failed: " + (connResult.error || "unknown error"), connResult.ok ? "success" : "error"),
          ]) : null,
        ]),
      ],
    });
  }

  function renderSettingsModelsSection() {
    const s = state.settings;
    const hasModels = s.modelsList.length > 0;
    const defaultResult = s.defaultTestResult;
    const backupResult = s.backupTestResult;
    return renderSettingsGroup({
      id: "settings-models",
      title: "Models",
      summary: state.provider.default_model ? state.provider.default_model + (state.provider.backup_model ? " / " + state.provider.backup_model : "") : "Not set",
      children: [
        h("div", { class: "settings-form" }, [
          settingsField("Default model", hasModels
            ? h("select", { id: "settings-default-model", class: "vw-select", onchange: (e) => { s.draftDefaultModel = e.target.value; } }, s.modelsList.map((m) => {
                const mid = typeof m === "string" ? m : m.id;
                const sel = s.draftDefaultModel !== null ? s.draftDefaultModel : state.provider.default_model;
                return h("option", { value: mid, selected: mid === sel }, mid);
              }))
            : h("input", { id: "settings-default-model", class: "vw-input", type: "text", value: s.draftDefaultModel !== null ? s.draftDefaultModel : state.provider.default_model || "", placeholder: "e.g. gpt-4o", oninput: (e) => { s.draftDefaultModel = e.target.value; } }),
            hasModels ? null : "Enter the model ID exactly as your provider expects it."
          ),
          settingsField("Backup model", hasModels
            ? h("select", { id: "settings-backup-model", class: "vw-select", onchange: (e) => { s.draftBackupModel = e.target.value; } }, [
                h("option", { value: "" }, "— none —"),
                ...s.modelsList.map((m) => {
                  const mid = typeof m === "string" ? m : m.id;
                  const sel = s.draftBackupModel !== null ? s.draftBackupModel : state.provider.backup_model;
                  return h("option", { value: mid, selected: mid === sel }, mid);
                }),
              ])
            : h("input", { id: "settings-backup-model", class: "vw-input", type: "text", value: s.draftBackupModel !== null ? s.draftBackupModel : state.provider.backup_model || "", placeholder: "Optional backup model", oninput: (e) => { s.draftBackupModel = e.target.value; } }),
            hasModels ? null : "Optional fallback model for daily runs."
          ),
          h("div", { class: "settings-actions" }, [
            h("button", { class: "vw-btn vw-btn-secondary", type: "button", disabled: s.modelsLoading || !state.provider.has_provider, onclick: settingsLoadModels }, s.modelsLoading ? "Loading…" : "Refresh Models"),
            h("button", { class: "vw-btn vw-btn-secondary", type: "button", disabled: s.testingDefault || !state.provider.has_provider, onclick: () => settingsTestModel("default") }, s.testingDefault ? "Testing…" : "Test Default"),
            state.provider.backup_model ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", disabled: s.testingBackup, onclick: () => settingsTestModel("backup") }, s.testingBackup ? "Testing…" : "Test Backup") : null,
          ]),
          s.modelsError ? settingsStatusChip(s.modelsError, "error") : null,
          defaultResult ? settingsStatusChip(defaultResult.ok ? "✓ " + (defaultResult.model || "default") + " — " + (defaultResult.output || "ok").slice(0, 80) : "✗ Default: " + (defaultResult.error || "failed"), defaultResult.ok ? "success" : "error") : null,
          backupResult ? settingsStatusChip(backupResult.ok ? "✓ " + (backupResult.model || "backup") + " — " + (backupResult.output || "ok").slice(0, 80) : "✗ Backup: " + (backupResult.error || "failed"), backupResult.ok ? "success" : "error") : null,
        ]),
      ],
    });
  }

  function renderSettingsExaSection() {
    const s = state.settings;
    return renderSettingsGroup({
      id: "settings-exa",
      title: "Exa",
      summary: state.provider.exa_configured ? "Configured" : "Not set",
      children: [
        h("div", { class: "settings-form" }, [
          h("p", { class: "settings-field-status" }, state.provider.exa_configured ? "Exa API key is configured." : "No Exa API key set. Web research will be unavailable."),
          renderBrokerStatus(),
          renderCredentialStatus("Exa key", state.provider.auth && state.provider.auth.exa),
          settingsField("API key", passwordFieldWithToggle(
            "settings-exa-key", s.draftExaKey, (e) => { s.draftExaKey = e.target.value; }, s.showExaKey,
            () => { s.showExaKey = !s.showExaKey; render(); },
            state.provider.exa_configured ? "••••••••  (leave empty to keep current)" : "Enter Exa API key",
            "Exa API key"
          )),
          h("div", { class: "settings-actions" }, [
            h("button", { class: "vw-btn vw-btn-primary", type: "button", disabled: s.exaSaving, onclick: settingsSaveExa }, s.exaSaving ? "Saving…" : "Save Exa Key"),
            state.provider.exa_configured ? h("button", {
              class: "vw-btn vw-btn-danger", type: "button",
              disabled: s.exaRemoving,
              onclick: () => {
                if (s.exaConfirmRemove) { settingsRemoveExa(); } else { s.exaConfirmRemove = true; render(); }
              },
            }, s.exaConfirmRemove ? "Confirm Remove" : "Remove Exa Key") : null,
            s.exaConfirmRemove ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => { s.exaConfirmRemove = false; render(); } }, "Cancel") : null,
          ]),
          settingsStatusChip(s.exaStatus, s.exaStatusTone),
        ]),
      ],
    });
  }

  function renderSettingsLLMStatsSection() {
    const s = state.settings;
    return renderSettingsGroup({
      id: "settings-llmstats",
      title: "LLM Stats",
      summary: state.provider.llmstats_configured ? "Configured" : "Not set",
      children: [
        h("div", { class: "settings-form" }, [
          h("p", { class: "settings-field-status" }, state.provider.llmstats_configured ? "LLM Stats API key is configured." : "No LLM Stats API key set. Update enrichment will be unavailable."),
          renderBrokerStatus(),
          renderCredentialStatus("LLM Stats key", state.provider.auth && state.provider.auth.llmstats),
          settingsField("API key", passwordFieldWithToggle(
            "settings-llmstats-key", s.draftLLMStatsKey, (e) => { s.draftLLMStatsKey = e.target.value; }, s.showLLMStatsKey,
            () => { s.showLLMStatsKey = !s.showLLMStatsKey; render(); },
            state.provider.llmstats_configured ? "••••••••  (leave empty to keep current)" : "ze_…",
            "LLM Stats API key"
          )),
          h("div", { class: "settings-actions" }, [
            h("button", { class: "vw-btn vw-btn-primary", type: "button", disabled: s.llmstatsSaving, onclick: settingsSaveLLMStats }, s.llmstatsSaving ? "Saving…" : "Save LLM Stats Key"),
            state.provider.llmstats_configured ? h("button", {
              class: "vw-btn vw-btn-secondary", type: "button",
              disabled: s.llmstatsTesting,
              onclick: settingsTestLLMStats,
            }, s.llmstatsTesting ? "Testing…" : "Test Connection") : null,
            state.provider.llmstats_configured ? h("button", {
              class: "vw-btn vw-btn-danger", type: "button",
              disabled: s.llmstatsRemoving,
              onclick: () => {
                if (s.llmstatsConfirmRemove) { settingsRemoveLLMStats(); } else { s.llmstatsConfirmRemove = true; render(); }
              },
            }, s.llmstatsConfirmRemove ? "Confirm Remove" : "Remove Key") : null,
            s.llmstatsConfirmRemove ? h("button", { class: "vw-btn vw-btn-secondary", type: "button", onclick: () => { s.llmstatsConfirmRemove = false; render(); } }, "Cancel") : null,
          ]),
          settingsStatusChip(s.llmstatsStatus, s.llmstatsStatusTone),
          h("p", { class: "vw-hint" }, "Optional. Enriches update runs with model catalog and benchmark data from LLM Stats."),
        ]),
      ],
    });
  }

  function renderSettingsScheduleSection() {
    const s = state.settings;
    initSettingsScheduleState();
    const scheduleLabel = !state.schedule.enabled || state.schedule.cadence === "off"
      ? "Off"
      : state.schedule.cadence + " · " + (state.schedule.time_local || "09:00") + " (" + (state.schedule.utc_echo || "UTC") + ")";
    return renderSettingsGroup({
      id: "settings-schedule",
      title: "Schedule",
      summary: scheduleLabel,
      children: [
        h("div", { class: "settings-form" }, [
          settingsField("Cadence", h("div", { class: "settings-segmented" }, ["off", "daily", "weekly", "monthly"].map((cadence) => h("button", {
            class: "vw-btn settings-seg-btn" + (s.scheduleCadence === cadence ? " vw-btn-primary" : " vw-btn-secondary"),
            type: "button",
            "aria-pressed": s.scheduleCadence === cadence ? "true" : "false",
            onclick: () => { s.scheduleCadence = cadence; render(); },
          }, cadence[0].toUpperCase() + cadence.slice(1))))),
          s.scheduleCadence !== "off" ? settingsField("Local time", h("input", {
            id: "settings-schedule-time",
            class: "vw-input",
            type: "time",
            value: s.scheduleTimeLocal,
            oninput: (e) => { s.scheduleTimeLocal = e.target.value; render(); },
          }), "Runs at " + settingsScheduleUtcEcho()) : null,
          s.scheduleCadence === "weekly" ? settingsField("Day", h("select", {
            class: "vw-select",
            value: String(s.scheduleDayOfWeek),
            onchange: (e) => { s.scheduleDayOfWeek = Number(e.target.value); },
          }, WEEKDAYS.map((day, i) => h("option", { value: String(i + 1), selected: s.scheduleDayOfWeek === i + 1 }, day)))) : null,
          s.scheduleCadence === "monthly" ? settingsField("Day of month", h("input", {
            class: "vw-input", type: "number", min: "1", max: "28",
            value: String(s.scheduleDayOfMonth),
            oninput: (e) => { s.scheduleDayOfMonth = Number(e.target.value || 1); },
          }), "Limited to 1–28 so every month works.") : null,
          h("div", { class: "settings-actions" }, [
            h("button", { class: "vw-btn vw-btn-primary", type: "button", disabled: s.scheduleSaving, onclick: settingsSaveSchedule }, s.scheduleSaving ? "Saving…" : "Save Schedule"),
            state.schedule.enabled && state.schedule.cadence !== "off" ? h("button", { class: "vw-btn vw-btn-danger", type: "button", disabled: s.scheduleRemoving, onclick: settingsRemoveSchedule }, s.scheduleRemoving ? "Removing…" : "Remove Schedule") : null,
          ]),
          settingsStatusChip(s.scheduleStatus, s.scheduleStatusTone),
        ]),
      ],
    });
  }

  function renderSettingsManualSection() {
    if (!state.dataPromptLoaded && !state.dataPromptLoading) fetchDataPrompt();
    const promptText = state.dataPromptLoading ? "Loading prompt…" : state.dataPrompt;
    return renderCollapsiblePanel({
      id: "settings-manual",
      title: "Manual Update (CLI)",
      summary: "Copy a prompt for manual dashboard refresh",
      collapsed: state.ui.settingsCollapsed.manual,
      onToggle: () => toggleSettingsSection("manual"),
      children: [
        h("div", { class: "settings-form" }, [
          h("textarea", {
            id: "data-prompt",
            class: "prompt-display",
            readonly: "readonly",
          }, promptText),
          h("div", { class: "prompt-actions" }, [
            h("button", {
              class: "vw-btn vw-btn-secondary",
              type: "button",
              disabled: state.dataPromptLoading || !state.dataPrompt,
              onclick: copyDataPrompt,
            }, "Copy Prompt"),
            h("button", {
              class: "vw-btn vw-btn-secondary",
              type: "button",
              disabled: state.dataTerminalMessage === "Opening terminal…",
              onclick: openTerminalForData,
            }, "Open Terminal"),
          ]),
          h("p", { class: "paste-hint" }, PASTE_HINT),
          h("div", { class: "data-card-status" }, [
            state.dataCopyMessage ? h("p", { dataset: { tone: state.dataCopyState || "idle" } }, state.dataCopyMessage) : null,
            state.dataTerminalMessage ? h("p", { dataset: { tone: state.dataTerminalState || "idle" } }, state.dataTerminalMessage) : null,
          ]),
        ]),
      ],
    });
  }

  function renderSettingsView() {
    if (!state.providerPresets.loaded && !state.providerPresets.loading) fetchProviderPresets();
    if (!state.schedule.loaded && !state.schedule.loading) fetchSchedule();
    if (state.provider.has_provider && !state.settings.modelsList.length && !state.settings.modelsLoading && !state.settings.modelsError) settingsLoadModels();
    const noBanner = !state.provider.has_provider
      ? h("div", { class: "settings-no-provider-banner vw-card" }, [
          h("p", null, "Agent Provider not configured"),
          h("button", { class: "vw-btn vw-btn-primary", type: "button", onclick: () => openWizard(0) }, "Run Setup Wizard"),
        ])
      : null;
    const subview = state.subview.settings || "provider";
    const pages = {
      provider: [noBanner, renderSettingsProviderSection(), renderSettingsManualSection()],
      models: [renderSettingsModelsSection()],
      research: [renderSettingsExaSection(), renderSettingsLLMStatsSection()],
      schedule: [renderSettingsScheduleSection()],
    };
    return h("div", { class: "settings-view" }, pages[subview] || pages.provider);
  }

  function buildSeriesData(rows, field) {
    const points = [...rows]
      .sort((a, b) => String(a.changelog_date).localeCompare(String(b.changelog_date)))
      .map((row) => {
        const raw = row[field];
        const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
        const ts = Date.parse(row.changelog_date + "T00:00:00Z");
        return Number.isFinite(ts) && value !== null && Number.isFinite(value)
          ? [Math.floor(ts / 1000), value]
          : null;
      })
      .filter(Boolean);
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    return { xs, ys };
  }

  function renderUplotChart(mountId, rows, field, options) {
    const mount = document.getElementById(mountId);
    if (!mount || typeof uPlot === "undefined") return;

    const prior = state.uplots[mountId];
    if (prior) {
      try { prior.destroy(); } catch (_) { /* noop */ }
      state.uplots[mountId] = null;
    }
    mount.innerHTML = "";

    const { xs, ys } = buildSeriesData(rows, field);
    const width = Math.max(mount.clientWidth || 0, 260);
    const height = 200;

    if (!xs.length) {
      const empty = document.createElement("div");
      empty.className = "chart-empty";
      empty.textContent = "No data";
      empty.style.height = height + "px";
      mount.appendChild(empty);
      return;
    }

    const isBar = options.type === "bar";
    const stroke = resolveCSSVar(options.color);
    const fill = colorWithAlpha(stroke, 0.2);

    const series = [
      {},
      {
        label: options.label,
        stroke,
        width: 2,
        fill,
        points: isBar ? { show: false } : { show: true, size: 5, stroke, fill: stroke },
        paths: isBar && uPlot.paths && uPlot.paths.bars
          ? uPlot.paths.bars({ size: [0.6, 48] })
          : undefined,
        value: (_u, v) => (v == null ? "—" : options.axis(v)),
      },
    ];

    const dayPadSec = 86400 * 3;
    const xRange = xs.length <= 1
      ? [xs[0] - dayPadSec, xs[0] + dayPadSec]
      : null;

    const opts = {
      width,
      height,
      padding: [12, 12, 6, 8],
      legend: { show: true, live: true },
      cursor: {
        drag: { x: false, y: false },
        points: { size: isBar ? 0 : 6 },
      },
      scales: {
        x: xRange ? { time: true, range: () => xRange } : { time: true },
        y: { range: (_u, dataMin, dataMax) => {
          const lo = Math.min(0, dataMin);
          const hi = dataMax > 0 ? dataMax * 1.08 : 1;
          return [lo, hi];
        } },
      },
      axes: [
        {
          stroke: resolveCSSVar("var(--vw-text-faint)"),
          grid: { stroke: "rgba(255,255,255,0.06)" },
          ticks: { stroke: "rgba(255,255,255,0.12)" },
          values: (_u, splits) => splits.map((s) => formatShortDate(new Date(s * 1000).toISOString().slice(0, 10))),
          font: "10px var(--vw-font-body)",
        },
        {
          stroke: resolveCSSVar("var(--vw-text-faint)"),
          grid: { stroke: "rgba(255,255,255,0.06)" },
          ticks: { stroke: "rgba(255,255,255,0.12)" },
          size: 56,
          values: (_u, splits) => splits.map((s) => options.axis(s)),
          font: "10px var(--vw-font-body)",
        },
      ],
      series,
    };

    state.uplots[mountId] = new uPlot(opts, [xs, ys], mount);
  }

  function destroyAllUplots() {
    Object.keys(state.uplots).forEach((id) => {
      const instance = state.uplots[id];
      if (instance) {
        try { instance.destroy(); } catch (_) { /* noop */ }
      }
      state.uplots[id] = null;
    });
  }

  const DETAIL_CHART_FIELDS = [
    { key: "intelligence", label: "Intelligence", color: "var(--vw-iridescent-1)" },
    { key: "coding", label: "Coding", color: "var(--vw-iridescent-2)" },
    { key: "agents", label: "Agents", color: "var(--vw-iridescent-3)" },
    { key: "speed", label: "Speed", color: "var(--vw-iridescent-4)" },
    { key: "cost", label: "Cost", color: "var(--vw-iridescent-5)" },
  ];

  function buildMultiSeriesData(history, fields) {
    const sorted = [...history].sort((a, b) => String(a.as_of).localeCompare(String(b.as_of)));
    const xs = [];
    const seriesArrays = fields.map(() => []);
    for (const row of sorted) {
      const ts = Date.parse(row.as_of + "T00:00:00Z");
      if (!Number.isFinite(ts)) continue;
      xs.push(Math.floor(ts / 1000));
      fields.forEach((field, i) => {
        const raw = row[field.key];
        const value = raw === null || raw === undefined || raw === "" ? null : Number(raw);
        seriesArrays[i].push(Number.isFinite(value) ? value : null);
      });
    }
    return { xs, seriesArrays };
  }

  function renderMultiSeriesChart(mountId, history, fields, options) {
    const mount = document.getElementById(mountId);
    if (!mount || typeof uPlot === "undefined") return;
    const prior = state.detailUplots[mountId];
    if (prior) {
      try { prior.destroy(); } catch (_) { /* noop */ }
      state.detailUplots[mountId] = null;
    }
    mount.innerHTML = "";
    const { xs, seriesArrays } = buildMultiSeriesData(history, fields);
    if (!xs.length) {
      const empty = document.createElement("div");
      empty.className = "detail-chart-empty";
      empty.textContent = "Not enough history yet";
      mount.appendChild(empty);
      return;
    }
    const width = Math.max(mount.clientWidth || 0, 260);
    const height = (options && options.height) || 180;
    const series = [
      {},
      ...fields.map((field) => ({
        label: field.label,
        stroke: resolveCSSVar(field.color),
        width: 1.5,
        points: { show: true, size: 4, stroke: resolveCSSVar(field.color) },
        value: (_u, v) => (v == null ? "—" : Number(v).toFixed(1)),
      })),
    ];
    const dayPadSec = 86400 * 3;
    const xRange = xs.length <= 1 ? [xs[0] - dayPadSec, xs[0] + dayPadSec] : null;
    const opts = {
      width,
      height,
      padding: [10, 10, 4, 4],
      legend: { show: false },
      cursor: { drag: { x: false, y: false }, points: { size: 5 } },
      scales: {
        x: xRange ? { time: true, range: () => xRange } : { time: true },
        y: { range: () => [0, 10] },
      },
      axes: [
        {
          stroke: resolveCSSVar("var(--vw-text-faint)"),
          grid: { stroke: "rgba(255,255,255,0.06)" },
          ticks: { stroke: "rgba(255,255,255,0.12)" },
          values: (_u, splits) => splits.map((s) => formatShortDate(new Date(s * 1000).toISOString().slice(0, 10))),
          font: "10px var(--vw-font-body)",
        },
        {
          stroke: resolveCSSVar("var(--vw-text-faint)"),
          grid: { stroke: "rgba(255,255,255,0.06)" },
          ticks: { stroke: "rgba(255,255,255,0.12)" },
          size: 32,
          values: (_u, splits) => splits.map((s) => Number(s).toFixed(0)),
          font: "10px var(--vw-font-body)",
        },
      ],
      series,
    };
    state.detailUplots[mountId] = new uPlot(opts, [xs, ...seriesArrays], mount);
  }

  function destroyDetailUplot(mountId) {
    const instance = state.detailUplots[mountId];
    if (instance) {
      try { instance.destroy(); } catch (_) { /* noop */ }
    }
    state.detailUplots[mountId] = null;
    const modelKey = mountId.replace(/^detail-chart-/, "");
    if (state.detailChartFrames[modelKey]) {
      window.cancelAnimationFrame(state.detailChartFrames[modelKey]);
      state.detailChartFrames[modelKey] = null;
    }
  }

  function destroyAllDetailUplots() {
    for (const key of Object.keys(state.detailChartFrames)) {
      const frame = state.detailChartFrames[key];
      if (frame) {
        window.cancelAnimationFrame(frame);
        state.detailChartFrames[key] = null;
      }
    }
    Object.keys(state.detailUplots).forEach(destroyDetailUplot);
  }

  function scheduleDetailChartDraw(modelId) {
    const mountId = "detail-chart-" + modelId;
    const history = modelHistory(modelId);
    if (!history || history.length < 2) {
      destroyDetailUplot(mountId);
      const mount = document.getElementById(mountId);
      if (mount) {
        mount.innerHTML = "";
        const empty = document.createElement("div");
        empty.className = "detail-chart-empty";
        empty.textContent = "Not enough history yet";
        mount.appendChild(empty);
      }
      return;
    }
    const prevFrame = state.detailChartFrames[modelId];
    if (prevFrame) window.cancelAnimationFrame(prevFrame);
    state.detailChartFrames[modelId] = window.requestAnimationFrame(() => {
      renderMultiSeriesChart(mountId, history, DETAIL_CHART_FIELDS, { height: 180 });
    });
  }

  function scheduleChartDraw() {
    if (state.area !== "models") {
      destroyAllDetailUplots();
    }
    if (state.view !== "stats") {
      destroyAllUplots();
      return;
    }
    window.cancelAnimationFrame(state.chartFrame);
    state.chartFrame = window.requestAnimationFrame(() => {
      const rows = getFilteredMetrics();
      renderUplotChart("stats-chart-cost", rows, "cost_usd", {
        type: "bar",
        label: "Cost",
        color: "var(--vw-iridescent-7)",
        axis: (value) => formatCurrency(value),
      });
      renderUplotChart("stats-chart-duration", rows, "duration_sec", {
        type: "line",
        label: "Duration",
        color: "var(--vw-iridescent-5)",
        axis: (value) => formatDuration(value),
      });
      renderUplotChart("stats-chart-output", rows, "tokens_output", {
        type: "line",
        label: "Output tokens",
        color: "var(--vw-iridescent-4)",
        axis: (value) => formatCompactNumber(value),
      });
      renderUplotChart("stats-chart-words", rows, "word_count", {
        type: "line",
        label: "Words",
        color: "var(--vw-iridescent-3)",
        axis: (value) => formatCompactNumber(value),
      });
    });
  }

  async function fetchChangelogMarkdown(entry) {
    const cached = state.changelogBodies[entry.date];
    if (cached && cached.status === "ready") return cached.body;
    try {
      const res = await fetch(normalizeAssetPath(entry.path), { cache: "no-store" });
      if (!res.ok) return null;
      return stripFrontmatter(await res.text());
    } catch (_) {
      return null;
    }
  }

  function changelogMentionsModel(entry, modelName) {
    const lcName = modelName.toLowerCase();
    const newModels = parseJsonArray(entry.new_models_json);
    for (const m of newModels) {
      const name = typeof m === "string" ? m : m && m.name;
      if (name && String(name).toLowerCase() === lcName) return true;
    }
    let parsed = null;
    try { parsed = JSON.parse(entry.changed_json || "null"); } catch (_) { parsed = null; }
    if (parsed && Array.isArray(parsed.score_updates)) {
      for (const u of parsed.score_updates) {
        if (u && String(u.name || "").toLowerCase() === lcName) return true;
      }
    }
    if (parsed && Array.isArray(parsed.status_changes)) {
      for (const s of parsed.status_changes) {
        if (s && String(s.name || "").toLowerCase() === lcName) return true;
      }
    }
    return false;
  }

  function extractModelMentions(markdown, modelName) {
    if (!markdown) return [];
    const lines = markdown.split(/\r?\n/);
    const lcName = modelName.toLowerCase();
    const blocks = [];
    let current = [];
    let inHeadingForModel = false;
    const flush = () => {
      if (!current.length) return;
      const text = current.join("\n").trim();
      if (text) blocks.push(text);
      current = [];
    };
    for (const line of lines) {
      const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
      if (headingMatch) {
        flush();
        const headingText = headingMatch[2].toLowerCase();
        inHeadingForModel = headingText.includes(lcName);
        continue;
      }
      if (line.trim() === "") {
        if (current.length) {
          const text = current.join("\n").trim();
          const matches = inHeadingForModel || text.toLowerCase().includes(lcName);
          if (matches && text) blocks.push(text);
          current = [];
        }
        continue;
      }
      current.push(line);
    }
    if (current.length) {
      const text = current.join("\n").trim();
      const matches = inHeadingForModel || text.toLowerCase().includes(lcName);
      if (matches && text) blocks.push(text);
    }
    return blocks;
  }

  function yamlScalar(value) {
    const text = String(value === null || value === undefined ? "" : value);
    if (!text) return "\"\"";
    const YAML_RESERVED = /^(null|true|false|yes|no|on|off|~|[+-]?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?|[+-]?\.\d+(?:[eE][+-]?\d+)?|0x[0-9a-fA-F]+|\.nan|[+-]?\.inf)$/i;
    if (
      /[:#\[\]{}>|&*!%@`\n\r\t"'\\]/.test(text) ||
      /^[\s-?]/.test(text) ||
      /\s$/.test(text) ||
      YAML_RESERVED.test(text)
    ) {
      return "\"" + text.replace(/\\/g, "\\\\").replace(/"/g, "\\\"").replace(/\n/g, " ").replace(/\r/g, "").replace(/\t/g, " ") + "\"";
    }
    return text;
  }

  function buildModelReportFrontmatter(model) {
    const generated = new Date().toISOString();
    const lines = [
      "---",
      "model: " + yamlScalar(model.name),
      "vendor: " + yamlScalar(model.vendor),
      "status: " + yamlScalar(model.status || "active"),
      "generated: " + yamlScalar(generated),
      "generator: " + yamlScalar("LLM-Dash"),
      "---",
      "",
    ];
    return lines.join("\n");
  }

  function tierLabel(score) {
    return tier(score).label;
  }

  function buildLatestScoresTable(model) {
    const overall = getOverall(model);
    const rows = [
      ["Intelligence", model.intelligence],
      ["Coding", model.coding],
      ["Agents", model.agents],
      ["Speed", model.speed],
      ["Cost", model.cost],
    ];
    const lines = [
      "| Metric | Score | Tier |",
      "|---|---|---|",
    ];
    for (const [label, score] of rows) {
      const value = score === null || score === undefined ? "—" : Number(score).toFixed(1);
      lines.push("| " + label + " | " + value + " | " + tierLabel(score) + " |");
    }
    const overallText = overall === null || overall === undefined ? "—" : overall.toFixed(1);
    lines.push("| **Overall** | **" + overallText + "** | **" + tierLabel(overall) + "** |");
    return lines.join("\n");
  }

  function buildHistoryTable(history) {
    if (!history || !history.length) return "_No history rows yet._";
    const lines = [
      "| Date | Intelligence | Coding | Agents | Speed | Cost | Overall |",
      "|---|---|---|---|---|---|---|",
    ];
    for (const row of history) {
      const overall = avgOverallRow(row);
      const cells = [
        row.as_of,
        row.intelligence === null || row.intelligence === undefined ? "—" : Number(row.intelligence).toFixed(1),
        row.coding === null || row.coding === undefined ? "—" : Number(row.coding).toFixed(1),
        row.agents === null || row.agents === undefined ? "—" : Number(row.agents).toFixed(1),
        row.speed === null || row.speed === undefined ? "—" : Number(row.speed).toFixed(1),
        row.cost === null || row.cost === undefined ? "—" : Number(row.cost).toFixed(1),
        overall === null ? "—" : overall.toFixed(1),
      ];
      lines.push("| " + cells.join(" | ") + " |");
    }
    return lines.join("\n");
  }

  async function buildModelReport(model) {
    const history = modelHistory(model.id) || [];
    const latestRow = history.length ? history[history.length - 1] : null;
    const latestDate = latestRow ? latestRow.as_of : "—";
    const firstDate = history.length ? history[0].as_of : "—";
    const sections = [];
    sections.push(buildModelReportFrontmatter(model));
    sections.push("# " + model.name + " — Score Report\n");
    const headLines = [];
    if (model.vendor) headLines.push("**Vendor:** " + model.vendor);
    headLines.push("**First seen:** " + firstDate);
    headLines.push("**Latest:** " + latestDate);
    headLines.push("**Status:** " + (model.status || "active"));
    if (model.params) headLines.push("**Parameters:** " + model.params);
    if (model.pricing) headLines.push("**Pricing:** " + model.pricing + "/M tok");
    sections.push(headLines.join("\n") + "\n");
    sections.push("## Latest Scores (" + (latestRow ? latestRow.as_of : "—") + ")\n");
    sections.push(buildLatestScoresTable(model) + "\n");
    sections.push("## Score History\n");
    sections.push(buildHistoryTable(history) + "\n");

    const candidates = state.changelogs.filter((entry) => changelogMentionsModel(entry, model.name));
    const mentionLimit = 8;
    const mentionBlocks = [];
    let truncated = false;
    for (const entry of candidates) {
      if (mentionBlocks.length >= mentionLimit) {
        truncated = true;
        break;
      }
      const body = await fetchChangelogMarkdown(entry);
      if (!body) continue;
      const blocks = extractModelMentions(body, model.name);
      if (!blocks.length) continue;
      mentionBlocks.push({ date: entry.date, block: blocks[0] });
    }
    if (mentionBlocks.length) {
      sections.push("## Notes & Citations\n");
      sections.push("> Pulled from changelog entries that mention this model.\n");
      for (const m of mentionBlocks) {
        sections.push("### " + m.date + "\n");
        sections.push(m.block + "\n");
      }
      if (truncated) {
        sections.push("> ...older mentions truncated\n");
      }
    }
    sections.push("---\n");
    sections.push("_Exported from LLM-Dash on " + new Date().toISOString() + "_\n");
    return sections.join("\n");
  }

  async function downloadModelReport(model) {
    try {
      const markdown = await buildModelReport(model);
      const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      const slug = String(model.name || "model").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      anchor.download = (slug || "model") + "-report.md";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      console.error("Model report export failed:", error);
    }
  }

  function csvCell(value) {
    if (value === null || value === undefined) return "";
    const string = String(value);
    if (!/[",\n]/.test(string)) return string;
    return "\"" + string.replace(/"/g, "\"\"") + "\"";
  }

  function downloadModelsCsv() {
    if (!state.models.length) return;
    const headers = [
      "Rank",
      "Name",
      "Vendor",
      "Released",
      "Params",
      "Pricing",
      "Status",
      "Intelligence",
      "Coding",
      "Agents",
      "Speed",
      "Overall",
      "Cost",
      "Value",
      "Notes",
    ];
    const rows = [headers.join(",")];
    state.models.forEach((model, index) => {
      rows.push([
        index + 1,
        model.name,
        model.vendor,
        model.released || "",
        model.params || "",
        model.pricing || "",
        model.status || "active",
        formatScore(model.intelligence),
        formatScore(model.coding),
        formatScore(model.agents),
        formatScore(model.speed),
        formatScore(getOverall(model)),
        formatScore(model.cost),
        formatScore(getValue(model)),
        model.notes || "",
      ].map(csvCell).join(","));
    });

    const blob = new Blob([rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "llm-dash-models-" + (state.lastUpdated ? String(state.lastUpdated).slice(0, 10) : "export") + ".csv";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function renderPlaceholder(message) {
    return h("p", { class: "status-msg" }, message);
  }

  function renderError(message, hint) {
    return h("p", { class: "status-msg error" }, [
      h("span", null, message),
      hint ? h("span", { style: { display: "block", marginTop: "8px" } }, hint) : null,
    ]);
  }

  function renderPageHeader() {
    const slot = document.getElementById("page-header");
    if (!slot) return;
    syncRouteFromView();
    const config = AREA_CONFIG[state.area] || AREA_CONFIG.models;
    slot.replaceChildren(
      h("div", { class: "app-page-title" }, [
        h("p", { class: "shell-kicker" }, state.area === "models" ? "Explore / Compare" : config.label),
        h("h2", null, config.label),
        h("p", null, config.deck),
      ])
    );
    const mobileTitle = document.querySelector(".shell-mobile-title");
    if (mobileTitle) mobileTitle.textContent = config.label;
  }

  function renderSubpageNav() {
    const nav = document.getElementById("subpage-nav");
    if (!nav) return;
    syncRouteFromView();
    const config = AREA_CONFIG[state.area] || AREA_CONFIG.models;
    nav.replaceChildren();
    if (state.area !== "settings" || !config.subpages.length) {
      nav.hidden = true;
      return;
    }
    nav.hidden = false;
    const active = state.subview[state.area] || config.subpages[0].key;
    config.subpages.forEach((item) => {
      const selected = item.key === active;
      nav.appendChild(h("button", {
        class: "vw-subpage-nav-link" + (selected ? " active" : ""),
        type: "button",
        "aria-current": selected ? "page" : null,
        "aria-pressed": selected ? "true" : "false",
        onclick: () => switchArea(state.area, item.key),
      }, item.label));
    });
  }

  function syncShellNav() {
    syncRouteFromView();
    document.querySelectorAll(".vw-sidebar-link").forEach((button) => {
      const isActive = button.dataset.area === state.area;
      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      if (isActive) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    const sidebar = document.getElementById("sidebar");
    const backdrop = document.getElementById("sidebar-backdrop");
    const toggle = document.getElementById("sidebar-toggle");
    if (sidebar) {
      sidebar.classList.toggle("open", state.ui.sidebarOpen);
      sidebar.dataset.vwOpen = state.ui.sidebarOpen ? "true" : "false";
    }
    if (backdrop) backdrop.classList.toggle("open", state.ui.sidebarOpen);
    if (toggle) toggle.setAttribute("aria-expanded", state.ui.sidebarOpen ? "true" : "false");
  }

  function finishBootPaint() {
    const app = document.getElementById("app");
    if (app) app.removeAttribute("data-booting");
  }

  const KEYBOARD_SHORTCUT_HELP = [
    { keys: ["/"], label: "Focus search" },
    { keys: ["j"], label: "Focus next row (Models table)" },
    { keys: ["k"], label: "Focus previous row (Models table)" },
    { keys: ["Enter"], label: "Toggle selected row's panel" },
    { keys: ["e"], label: "Export current single-model report" },
    { keys: ["r"], label: "Refresh data" },
    { keys: ["?"], label: "Open this shortcuts modal" },
    { keys: ["Esc"], label: "Close drawer / overlay" },
  ];

  function shortcutsAllowed() {
    if (state.wizard.open) return false;
    if (state.bootstrap.state === "initializing") return false;
    return true;
  }

  function isEditingTarget(target) {
    if (!target) return false;
    const tag = target.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
    if (target.isContentEditable) return true;
    return false;
  }

  function focusSearchInput() {
    if (state.area !== "models") return;
    if (state.ui.modelFiltersCollapsed) {
      state.ui.modelFiltersCollapsed = false;
      persistUIState();
      render();
    }
    window.setTimeout(() => {
      const input = document.getElementById("model-search");
      if (!input) return;
      input.focus();
      try { input.select(); } catch (_) { /* noop */ }
    }, 0);
  }

  function moveTableFocus(direction) {
    if (!state.models.length) return;
    if (state.area !== "models" || state.view !== "table") return;
    if (state.focusedRowIndex < 0 && direction < 0) return;
    const next = clamp(state.focusedRowIndex + direction, 0, state.models.length - 1);
    state.focusedRowIndex = next;
    const id = state.models[next] && state.models[next].id;
    if (!id) return;
    const row = document.getElementById("model-row-" + id);
    if (!row) return;
    row.focus();
    if (typeof row.scrollIntoView === "function") {
      row.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function exportSelectedModelReport() {
    if (state.area !== "models") return;
    if (state.selectedModelIds.length !== 1) return;
    const model = state.models.find((m) => m.id === state.selectedModelIds[0]);
    if (!model) return;
    downloadModelReport(model);
  }

  function triggerRefresh() {
    if (state.runUpdate.active || state.runUpdate._starting) return;
    if (state.wizard.open) return;
    if (state.manualRefreshModal && state.manualRefreshModal.open) return;
    if (state.bootstrap.state === "initializing") return;
    handleRefresh();
  }

  function openHelpModal() {
    if (state.runUpdate.active) return;
    if (state.bootstrap.state === "initializing") return;
    if (state.manualRefreshModal && state.manualRefreshModal.open) return;
    state.helpModal.open = true;
    state.helpModal.returnFocus = captureFocus();
    render();
    window.requestAnimationFrame(() => {
      const closeBtn = document.querySelector(".help-modal .help-modal-close");
      if (closeBtn && typeof closeBtn.focus === "function") {
        try { closeBtn.focus({ preventScroll: true }); } catch (_) { closeBtn.focus(); }
      }
    });
  }

  function closeHelpModal() {
    if (!state.helpModal.open) return;
    const focusToRestore = state.helpModal.returnFocus;
    state.helpModal.open = false;
    state.helpModal.returnFocus = null;
    render();
    if (focusToRestore) restoreFocus(focusToRestore);
  }

  function renderHelpModal() {
    if (!state.helpModal.open) return null;
    return h("div", {
      class: "vw-modal-backdrop help-modal-backdrop",
      role: "presentation",
      onclick: (e) => { if (e.target === e.currentTarget) closeHelpModal(); },
    }, h("div", {
      class: "vw-modal help-modal",
      role: "dialog",
      "aria-modal": "true",
      "aria-labelledby": "help-modal-title",
    }, [
      h("div", { class: "vw-modal-header" }, [
        h("h2", { id: "help-modal-title" }, "Keyboard shortcuts"),
        h("button", {
          class: "action-btn subtle icon-btn help-modal-close",
          type: "button",
          "aria-label": "Close shortcuts",
          onclick: closeHelpModal,
        }, icon("x")),
      ]),
      h("div", { class: "vw-modal-body" }, h("ul", { class: "help-shortcuts" }, KEYBOARD_SHORTCUT_HELP.map((entry) =>
        h("li", null, [
          h("span", { class: "help-keys" }, entry.keys.map((key) => h("kbd", null, key))),
          h("span", { class: "help-label" }, entry.label),
        ])
      ))),
    ]));
  }

  function ensureToastContainer() {
    let container = document.querySelector(".vw-toast-container");
    if (container) return container;
    container = document.createElement("div");
    container.className = "vw-toast-container";
    container.setAttribute("role", "status");
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
    return container;
  }

  function showToast(opts) {
    const container = ensureToastContainer();
    const tone = opts && opts.tone ? opts.tone : "info";
    const toast = document.createElement("div");
    toast.className = "vw-toast vw-toast-" + tone;
    if (tone === "error" || tone === "warning") {
      toast.setAttribute("role", "alert");
      toast.setAttribute("aria-live", "assertive");
    }
    let timer = null;
    let actionTaken = false;
    const dismiss = (viaAction) => {
      if (viaAction) actionTaken = true;
      if (timer) { clearTimeout(timer); timer = null; }
      toast.classList.add("dismissing");
      window.setTimeout(() => {
        if (toast.parentElement) toast.parentElement.removeChild(toast);
        if (typeof opts.onDismiss === "function") opts.onDismiss(actionTaken);
      }, 200);
    };
    const message = document.createElement("span");
    message.className = "vw-toast-message";
    message.textContent = opts && opts.message ? opts.message : "";
    toast.appendChild(message);
    if (opts && opts.actionLabel) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "vw-toast-action";
      action.textContent = opts.actionLabel;
      action.addEventListener("click", () => {
        dismiss(true);
        if (typeof opts.onAction === "function") {
          try { opts.onAction(); } catch (e) { console.error(e); }
        }
      });
      toast.appendChild(action);
    }
    const close = document.createElement("button");
    close.type = "button";
    close.className = "vw-toast-dismiss";
    close.setAttribute("aria-label", "Dismiss");
    close.textContent = "×";
    close.addEventListener("click", () => dismiss(false));
    toast.appendChild(close);
    container.appendChild(toast);
    if (opts && opts.autoDismissMs && opts.autoDismissMs > 0) {
      timer = window.setTimeout(() => dismiss(false), opts.autoDismissMs);
    }
    return { dismiss: () => dismiss(false) };
  }

  function showNewDataToast(serverLastUpdated) {
    if (!serverLastUpdated) return;
    if (state.uiToastDismissed === serverLastUpdated) return;
    if (state.uiToastShownFor === serverLastUpdated) return;
    if (state.uiToastHandle && typeof state.uiToastHandle.dismiss === "function") {
      try { state.uiToastHandle.dismiss(); } catch (_) { /* noop */ }
    }
    state.uiToastShownFor = serverLastUpdated;
    const handle = showToast({
      message: "New data available",
      actionLabel: "Reload",
      tone: "success",
      onAction: async () => {
        try {
          await reloadDB();
          updateFreshness();
          render();
        } catch (error) {
          console.error("toast reload failed", error);
        } finally {
          state.uiToastHandle = null;
          state.uiToastShownFor = null;
        }
      },
      onDismiss: (actionTaken) => {
        if (!actionTaken) state.uiToastDismissed = serverLastUpdated;
        if (state.uiToastShownFor === serverLastUpdated) state.uiToastShownFor = null;
        if (state.uiToastHandle && state.uiToastHandle.__lastUpdated === serverLastUpdated) state.uiToastHandle = null;
      },
    });
    handle.__lastUpdated = serverLastUpdated;
    state.uiToastHandle = handle;
  }

  async function checkForNewData() {
    if (state.runUpdate.active || state.runUpdate._starting) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/meta", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      const next = data && data.last_updated;
      if (!next) return;
      if (state.lastUpdated && next !== state.lastUpdated) {
        showNewDataToast(next);
      }
    } catch (_) {
      /* offline; silently retry next tick */
    }
  }

  function renderWizardPage() {
    const app = document.getElementById("app");
    const overlayRoot = document.getElementById("overlay-root");
    if (app) app.hidden = true;
    if (overlayRoot) overlayRoot.hidden = true;
    document.body.classList.remove("has-overlay");
    let container = document.getElementById("wizard-page");
    if (!container) {
      container = document.createElement("div");
      container.id = "wizard-page";
      document.body.appendChild(container);
    }
    const focus = captureFocus();
    container.replaceChildren(renderWizard());
    restoreFocus(focus);
  }

  function teardownWizardPage() {
    const app = document.getElementById("app");
    const overlayRoot = document.getElementById("overlay-root");
    const container = document.getElementById("wizard-page");
    if (app) app.hidden = false;
    if (overlayRoot) overlayRoot.hidden = false;
    if (container) container.remove();
  }

  function render() {
    const viewSlot = document.getElementById("content-body");
    if (!viewSlot) return;
    finishBootPaint();

    if (state.wizard.open) {
      renderWizardPage();
      return;
    }
    teardownWizardPage();

    const focus = captureFocus();
    syncRouteFromView();
    renderPageHeader();
    renderSubpageNav();
    renderOverlay();
    syncRefreshButton();
    syncShellNav();

    if (state.error) {
      viewSlot.replaceChildren(state.error);
      updateFreshness();
      if (state.wizard.open || (!state.manualRefreshModal.open && !state.runUpdate.active && state.bootstrap.state !== "initializing")) restoreFocus(focus);
      return;
    }
    if (!state.ready) {
      viewSlot.replaceChildren(renderPlaceholder(
        state.bootstrap.state === "initializing" ? "Preparing dashboard…" : "Loading dashboard…"
      ));
      updateFreshness();
      if (state.wizard.open || (!state.manualRefreshModal.open && !state.runUpdate.active && state.bootstrap.state !== "initializing")) restoreFocus(focus);
      return;
    }

    let content;
    if (MODEL_VIEWS.has(state.view)) content = renderModelsArea();
    else if (state.view === "changelog") content = renderChangelogArea();
    else if (state.view === "stats") content = renderStatsArea();
    else if (state.view === "data") content = renderSettingsView();
    else content = renderTable();

    viewSlot.replaceChildren(content);

    document.querySelectorAll(".sort-btn").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.sort === state.sortBy ? "true" : "false");
    });
    document.querySelectorAll(".view-btn").forEach((button) => {
      const isActive = button.dataset.view === state.view;
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      if (isActive) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    syncShellNav();

    updateFreshness();
    if (state.wizard.open || (!state.manualRefreshModal.open && !state.runUpdate.active && state.bootstrap.state !== "initializing")) restoreFocus(focus);
    if (state.manualRefreshModal.open && !state.manualRefreshModal.loading) {
      const promptField = document.getElementById("refresh-prompt");
      if (promptField && state.manualRefreshModal.selectPrompt) {
        selectText(promptField);
        state.manualRefreshModal.selectPrompt = false;
      }
    }
    scheduleChartDraw();
  }

  function switchArea(area, subview) {
    const config = AREA_CONFIG[area] || AREA_CONFIG.models;
    const nextSubview = subview || (config.subpages[0] && config.subpages[0].key) || "index";
    applyRoute({ view: viewForRoute(area, nextSubview), area, subview: nextSubview }, { updateHash: true });
    render();
  }

  function switchView(view, options) {
    if (!view || view === state.view) return;
    const stage = document.getElementById("content-body");
    if (stage) stage.classList.add("is-switching");
    applyRoute(routeForView(view), { updateHash: !(options && options.skipHash), replace: options && options.replace });
    requestAnimationFrame(() => {
      render();
      requestAnimationFrame(() => {
        if (stage) stage.classList.remove("is-switching");
      });
    });
  }

  function wireStaticControls() {
    document.querySelectorAll(".sort-btn").forEach((button) => {
      button.addEventListener("click", () => {
        state.sortBy = button.dataset.sort;
        refreshModels();
        render();
      });
    });
    document.querySelectorAll(".view-btn").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        if (button.dataset.area && button.dataset.area !== state.area) {
          switchArea(button.dataset.area, button.dataset.subview);
          return;
        }
        switchView(button.dataset.view);
      });
    });
    const refreshButton = document.getElementById("refresh-trigger");
    if (refreshButton) refreshButton.addEventListener("click", handleRefresh);
    const helpButton = document.getElementById("help-trigger");
    if (helpButton) helpButton.addEventListener("click", openHelpModal);
    const sidebarToggle = document.getElementById("sidebar-toggle");
    if (sidebarToggle) sidebarToggle.addEventListener("click", () => {
      state.ui.sidebarOpen = !state.ui.sidebarOpen;
      syncShellNav();
    });
    const sidebarBackdrop = document.getElementById("sidebar-backdrop");
    if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", () => {
      state.ui.sidebarOpen = false;
      syncShellNav();
    });
    window.addEventListener("resize", scheduleChartDraw);
    window.addEventListener("keydown", (event) => {
      if (event.defaultPrevented) return;

      // Escape: existing behavior preserved verbatim, including in inputs.
      if (event.key === "Escape") {
        if (state.helpModal.open) {
          closeHelpModal();
          return;
        }
        if (state.ui.sidebarOpen) {
          state.ui.sidebarOpen = false;
          syncShellNav();
          return;
        }
        if (state.wizard.open) return;
        if (isRunUpdateBusy()) return;
        if (state.runUpdate.active && state.runUpdate.state !== "running") {
          closeRunUpdateOverlay();
          return;
        }
        if (state.manualRefreshModal.open) closeManualRefreshModal();
        return;
      }

      // Custom shortcuts: gated against editing surfaces, modifiers, and
      // any in-progress modal/wizard/bootstrap.
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditingTarget(document.activeElement)) return;
      if (!shortcutsAllowed()) return;
      if (state.manualRefreshModal && state.manualRefreshModal.open) return;
      if (state.runUpdate.active) return;
      if (state.helpModal.open) return;

      const key = String(event.key || "").toLowerCase();
      const drawerOpen = !!state.ui.sidebarOpen;
      switch (key) {
        case "/":
          event.preventDefault();
          focusSearchInput();
          return;
        case "j":
          if (drawerOpen) return;
          if (state.area === "models" && state.view === "table") {
            event.preventDefault();
            moveTableFocus(1);
          }
          return;
        case "k":
          if (drawerOpen) return;
          if (state.area === "models" && state.view === "table") {
            event.preventDefault();
            moveTableFocus(-1);
          }
          return;
        case "e":
          if (drawerOpen) return;
          if (state.area === "models" && state.selectedModelIds.length === 1) {
            event.preventDefault();
            exportSelectedModelReport();
          }
          return;
        case "r":
          event.preventDefault();
          triggerRefresh();
          return;
        case "?":
          event.preventDefault();
          openHelpModal();
          return;
      }
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") checkForNewData();
    });
    applyRoute(parseHashRoute(location.hash), { updateHash: true, replace: true });
    window.addEventListener("popstate", () => {
      applyRoute(parseHashRoute(location.hash), { updateHash: false });
      render();
    });
    window.addEventListener("hashchange", () => {
      applyRoute(parseHashRoute(location.hash), { updateHash: false });
      render();
    });
    window.addEventListener("beforeunload", () => {
      resetRunUpdate(false);
      if (state.db) state.db.close();
    });
  }

  async function boot() {
    wireStaticControls();
    try {
      const resetLaunch = consumeResetLaunchFlag();
      await waitForBootstrapReady();
      state.db = await loadDB();
      if (!resetLaunch) applyStoredUIState();
      loadStaticState();
      state.bootstrap.state = state.bootstrap.supported ? "ready" : state.bootstrap.state;
      await fetchProvider();
      await fetchSchedule();
      state.ready = true;
      if (resetLaunch || !state.provider.has_provider) {
        await openWizard(0);
      }
      window.setInterval(updateFreshness, 60000);
      state.metaPollFrame = window.setInterval(checkForNewData, 15000);
    } catch (error) {
      console.error("LLM-Dash boot failed:", error);
      if (error && error.code === "bootstrap-failed") {
        state.error = renderError(
          "dashboard bootstrap failed.",
          h("span", null, [
            state.bootstrap.message || "The seed pass crashed before it finished.",
            state.bootstrap.detail ? " " + state.bootstrap.detail : "",
            " Check the server logs, then refresh the page or rerun ",
            h("code", null, "python scripts/init_db.py"),
            ".",
          ])
        );
      } else if (error && error.code === "db-missing") {
        state.error = renderError(
          "dashboard hasn't been seeded.",
          state.bootstrap.supported
            ? h("span", null, "The local server should seed it automatically. Give it a second, then refresh.")
            : h("span", null, [
                "run ",
                h("code", null, "python scripts/init_db.py"),
                " from the repo root and refresh.",
              ])
        );
      } else {
        state.error = renderError(
          "Failed to load dashboard",
          h("span", null, String((error && error.message) || error))
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
