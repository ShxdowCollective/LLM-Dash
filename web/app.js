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
    { key: "intelligence", label: "Intelligence", raw: "#7c5cc4" },
    { key: "coding", label: "Coding", raw: "#86a8ff" },
    { key: "agents", label: "Agents", raw: "#72f0d7" },
    { key: "speed", label: "Speed", raw: "#a6f17b" },
  ];
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
  const PASTE_HINT = [
    'macOS: claude "$(pbpaste)"  |  codex "$(pbpaste)"  |  gemini "$(pbpaste)"',
    'Linux: claude "$(xclip -selection clipboard -o)"  or  claude "$(wl-paste)"',
    "Windows PowerShell: claude (Get-Clipboard)  |  codex (Get-Clipboard)",
  ].join("\n");

  const state = {
    db: null,
    SQL: null,
    ready: false,
    error: null,
    view: "table",
    sortBy: "overall",
    selectedModelId: null,
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
      chat_endpoint: "",
      models_endpoint: "",
      default_model: "",
      backup_model: "",
      endpoint_mode: "append_v1",
      exa_configured: false,
      _fetching: false,
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
    if (score === null || score === undefined || Number.isNaN(score)) return "#3a3a3a";
    if (score >= 9) return "#7c5cc4";
    if (score >= 8) return "#86a8ff";
    if (score >= 7) return "#72f0d7";
    if (score >= 6) return "#a6f17b";
    if (score >= 5) return "#f1d47b";
    return "#f2ad5b";
  }

  function clamp(value, lo, hi) {
    return value < lo ? lo : value > hi ? hi : value;
  }

  function sortKey(model, key) {
    if (key === "overall") return getOverall(model) ?? 0;
    if (key === "value") return getValue(model) ?? 0;
    return model[key] ?? 0;
  }

  function sortedModels(rows) {
    return [...rows].sort((a, b) => {
      const delta = sortKey(b, state.sortBy) - sortKey(a, state.sortBy);
      return delta || String(a.name).localeCompare(String(b.name));
    });
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

  async function waitForBootstrapReady() {
    const first = await fetchBootstrapStatus();
    if (!first) return;
    render();
    while (state.bootstrap.state === "initializing") {
      await sleep(BOOTSTRAP_POLL_MS);
      await fetchBootstrapStatus();
      render();
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
    state.manualRefreshModal.terminalMessage = "Opening terminal...";
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
    state.dataTerminalMessage = "Opening terminal...";
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
    if (state.runUpdate.state === "running") return;
    resetRunUpdate(false);
    render();
    const refreshButton = document.getElementById("refresh-trigger");
    if (refreshButton) refreshButton.focus({ preventScroll: true });
  }

  function retryRunUpdate() {
    if (state.runUpdate.state === "running") return;
    resetRunUpdate(false);
    startRunUpdate();
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
      log.textContent = state.runUpdate.tail || "Waiting for log output...";
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
    state.runUpdate._starting = true;
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
        state.provider.has_provider = false;
        await openManualRefreshModal();
        return;
      }
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
      openManualRefreshModal();
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
    if (state.selectedModelId !== null && !state.models.some((row) => row.id === state.selectedModelId)) {
      state.selectedModelId = null;
    }
  }

  function updateFreshness() {
    const el = document.getElementById("freshness");
    if (!el) return;
    if (!state.lastUpdated) {
      el.textContent = "never updated";
      el.dataset.state = "unknown";
      el.title = "no meta.last_updated row";
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
    el.title = "meta.last_updated = " + state.lastUpdated;
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

  function groupMetricsByAgent(rows) {
    const groups = new Map();
    for (const row of rows) {
      const key = formatAgentKey(row);
      if (!groups.has(key)) {
        groups.set(key, {
          key,
          label: formatAgentLabel(row),
          runs: 0,
          totalCost: 0,
          costCount: 0,
          totalDuration: 0,
          durationCount: 0,
          totalInput: 0,
          inputCount: 0,
          totalOutput: 0,
          outputCount: 0,
          totalWords: 0,
          wordCountCount: 0,
        });
      }
      const group = groups.get(key);
      group.runs += 1;
      if (row.cost_usd !== null && row.cost_usd !== undefined && row.cost_usd !== "") {
        group.totalCost += Number(row.cost_usd);
        group.costCount += 1;
      }
      if (row.duration_sec !== null && row.duration_sec !== undefined && row.duration_sec !== "") {
        group.totalDuration += Number(row.duration_sec);
        group.durationCount += 1;
      }
      if (row.tokens_input !== null && row.tokens_input !== undefined && row.tokens_input !== "") {
        group.totalInput += Number(row.tokens_input);
        group.inputCount += 1;
      }
      if (row.tokens_output !== null && row.tokens_output !== undefined && row.tokens_output !== "") {
        group.totalOutput += Number(row.tokens_output);
        group.outputCount += 1;
      }
      if (row.word_count !== null && row.word_count !== undefined && row.word_count !== "") {
        group.totalWords += Number(row.word_count);
        group.wordCountCount += 1;
      }
    }
    return [...groups.values()].sort((a, b) => b.runs - a.runs || b.totalCost - a.totalCost || a.label.localeCompare(b.label));
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
    const color = barColor(Number(score));
    return h("div", { class: "score-cell" }, [
      h("span", { class: "tier-pill " + t.cls }, t.label),
      h("div", { class: "track" }, h("div", {
        class: "fill",
        style: {
          width: width + "%",
          background: "linear-gradient(90deg, " + color + "aa, " + color + ")",
        },
      })),
      h("span", { class: "val" }, Number(score).toFixed(1)),
    ]);
  }

  function statusBadge(status) {
    if (!status || status === "active") return null;
    return h("span", { class: "status-badge", dataset: { status } }, status);
  }

  function renderDetailPanel(model) {
    const slot = document.getElementById("detail");
    if (!slot) return;
    if (!model) {
      slot.replaceChildren();
      return;
    }
    const overall = getOverall(model);
    const value = getValue(model);
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

    slot.replaceChildren(h("div", { class: "detail-panel" }, [
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
      model.notes ? h("p", { class: "detail-notes" }, model.notes) : null,
      h("button", {
        class: "detail-close",
        type: "button",
        onclick: () => {
          state.selectedModelId = null;
          render();
        },
      }, "close"),
    ]));
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
    return h("div", { class: "filter-panel" }, [
      h("div", { class: "filter-summary" }, [
        h("div", { class: "filter-summary-copy" }, [
          h("span", { class: "summary-pill" }, state.models.length + " / " + state.totalModelCount + " models"),
          h("span", { class: "summary-note" }, active ? active + " filters active" : "all filters open"),
        ]),
        h("button", {
          class: "action-btn subtle",
          type: "button",
          onclick: resetModelFilters,
        }, "Reset filters"),
      ]),
      h("div", { class: "filter-card" }, [
        h("label", { class: "control-label stacked", for: "model-search" }, "search"),
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
        h("div", { class: "control-label stacked" }, "vendors"),
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
        h("div", { class: "control-label stacked" }, "tier"),
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
    ]);
  }

  function renderStatsFilters() {
    return h("div", { class: "filter-panel stats-filter-panel" }, [
      h("div", { class: "filter-summary" }, [
        h("div", { class: "filter-summary-copy" }, [
          h("span", { class: "summary-pill" }, getFilteredMetrics().length + " runs"),
          h("span", { class: "summary-note" }, state.statsFilter.agent ? "filtered by agent + date" : "all recorded runs"),
        ]),
        h("button", {
          class: "action-btn subtle",
          type: "button",
          onclick: resetStatsFilters,
        }, "Reset filters"),
      ]),
      h("div", { class: "stats-filter-grid" }, [
        h("label", { class: "field-block", for: "stats-from" }, [
          h("span", { class: "control-label stacked" }, "from"),
          h("input", {
            id: "stats-from",
            class: "text-input",
            type: "date",
            value: state.statsFilter.from,
            onchange: (event) => setStatsFilter("from", event.target.value),
          }),
        ]),
        h("label", { class: "field-block", for: "stats-to" }, [
          h("span", { class: "control-label stacked" }, "to"),
          h("input", {
            id: "stats-to",
            class: "text-input",
            type: "date",
            value: state.statsFilter.to,
            onchange: (event) => setStatsFilter("to", event.target.value),
          }),
        ]),
        h("label", { class: "field-block", for: "stats-agent" }, [
          h("span", { class: "control-label stacked" }, "agent"),
          h("select", {
            id: "stats-agent",
            class: "text-input",
            value: state.statsFilter.agent,
            onchange: (event) => setStatsFilter("agent", event.target.value),
          }, [
            h("option", { value: "" }, "All agents"),
            ...metricsAgentOptions().map(([key, label]) => h("option", { value: key, selected: state.statsFilter.agent === key }, label)),
          ]),
        ]),
      ]),
    ]);
  }

  function renderActionBar() {
    const slot = document.getElementById("view-actions");
    if (!slot) return;
    let content = null;
    if (state.view === "table") {
      content = h("button", {
        class: "action-btn",
        type: "button",
        disabled: !state.models.length,
        onclick: downloadModelsCsv,
      }, "Export models CSV");
    } else if (state.view === "stats") {
      content = h("a", {
        class: "action-btn link-btn",
        href: "/data/run_metrics.csv",
        download: "run_metrics.csv",
      }, "Download run_metrics.csv");
    }
    slot.replaceChildren();
    if (content) slot.appendChild(content);
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
          h("h2", { id: "refresh-modal-title" }, "Run today's update"),
          h("p", null, "Prompt is agent-neutral on purpose. Pick your CLI and fire away."),
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
          }, "Copy again"),
          h("button", {
            class: "action-btn primary",
            type: "button",
            disabled:
              state.manualRefreshModal.loading ||
              !state.manualRefreshModal.prompt ||
              state.manualRefreshModal.terminalMessage === "Opening terminal...",
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
    if (state.runUpdate.state === "succeeded") return "Update complete";
    if (state.runUpdate.state === "failed") return "Update failed";
    return "Updating dashboard";
  }

  function runUpdateStatusText() {
    if (state.runUpdate.state === "succeeded") return "Finished in";
    if (state.runUpdate.state === "failed") return "Stopped after";
    return "Running for";
  }

  function renderRunUpdateOverlay() {
    const isRunning = state.runUpdate.state === "running";
    const model = state.provider.default_model || "configured model";
    const elapsed = state.runUpdate.startedAt
      ? formatElapsed((state.runUpdate.completedAt || Date.now()) - state.runUpdate.startedAt)
      : "0s";
    const logText = state.runUpdate.tail || (isRunning ? "Waiting for log output..." : state.runUpdate.error || "No log output.");
    const actions = isRunning
      ? [h("button", { class: "action-btn", type: "button", disabled: true }, "Running...")]
      : state.runUpdate.state === "succeeded"
        ? [
            h("button", { class: "action-btn primary", type: "button", onclick: reloadDashboardFromRunUpdate }, "Reload dashboard"),
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
      "aria-busy": isRunning ? "true" : "false",
      tabindex: "-1",
    }, [
      h("div", { class: "modal-head" }, [
        h("div", null, [
          h("h2", { id: "ru-title" }, runUpdateTitle()),
          h("p", { id: "ru-model" }, model + " via Agent Provider"),
        ]),
        !isRunning ? h("button", {
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
        h("pre", { id: "ru-log", class: "run-update-log" }, logText),
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
        if (!isRunning && event.target === event.currentTarget) closeRunUpdateOverlay();
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
      h("h2", null, "Preparing dashboard"),
      h("p", null, "First run is seeding the local SQLite bundle so the app has something real to load."),
      h("div", { class: "bootstrap-status" }, state.bootstrap.message || "Seeding dashboard database..."),
      state.bootstrap.detail ? h("div", { class: "bootstrap-detail" }, state.bootstrap.detail) : null,
    ]));
  }

  function renderOverlay() {
    const slot = document.getElementById("overlay-root");
    if (!slot) return;
    const nodes = [];
    if (state.bootstrap.state === "initializing") nodes.push(renderBootstrapOverlay());
    if (state.manualRefreshModal.open) nodes.push(renderManualRefreshModal());
    if (state.runUpdate.active) nodes.push(renderRunUpdateOverlay());
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
      state.manualRefreshModal.loading;
    if (state.bootstrap.state === "initializing") button.textContent = "Loading...";
    else if (checking) button.textContent = "Checking...";
    else if (state.runUpdate.active || state.runUpdate._starting) button.textContent = "Running...";
    else if (state.manualRefreshModal.loading) button.textContent = "Loading...";
    else button.textContent = "Refresh";
    button.title = state.runUpdate.error && !state.runUpdate.active ? state.runUpdate.error : "";
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

  function renderFilterSlot() {
    const slot = document.getElementById("filters");
    if (!slot) return;
    slot.replaceChildren();
    if (!state.ready || state.error) return;
    if (MODEL_VIEWS.has(state.view)) {
      slot.appendChild(renderModelFilters());
    } else if (state.view === "stats") {
      slot.appendChild(renderStatsFilters());
    }
  }

  function renderTable() {
    if (!state.models.length) {
      return renderEmptyState("No models match this filter.", "Trim the filters or reset them and the table will fill back in.");
    }
    const head = h("thead", null, h("tr", null, [
      h("th", { class: "num" }, "#"),
      h("th", null, "Model"),
      h("th", null, "Intelligence"),
      h("th", null, "Coding"),
      h("th", null, "Agent Tasks"),
      h("th", null, "Speed"),
      h("th", { class: "num" }, "Overall"),
      h("th", { class: "num" }, "Cost"),
      h("th", { class: "num" }, "Value"),
    ]));

    const body = h("tbody", null, state.models.map((model, index) => {
      const overall = getOverall(model);
      const value = getValue(model);
      const isSelected = state.selectedModelId === model.id;
      const sub = [model.vendor, model.pricing || null, model.status !== "active" ? model.status : null].filter(Boolean).join(" · ");
      return h("tr", {
        class: isSelected ? "selected" : null,
        onclick: () => {
          state.selectedModelId = isSelected ? null : model.id;
          render();
        },
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
        h("td", { class: "summary-cell " + tier(model.cost).cls }, model.cost !== null ? Number(model.cost).toFixed(1) : "—"),
        h("td", { class: "summary-cell " + tier(value).cls }, value !== null ? value.toFixed(1) : "—"),
      ]);
    }));

    return h("div", { class: "table-wrap" }, h("table", { class: "models" }, [head, body]));
  }

  function renderChart() {
    if (!state.models.length) {
      return renderEmptyState("No chart data to draw.", "Right now the filters are too tight, so there is nothing left to graph.");
    }
    const rows = state.models.map((model, index) => {
      const overall = getOverall(model);
      const isSelected = state.selectedModelId === model.id;
      return h("div", {
        class: "chart-row" + (isSelected ? " selected" : ""),
        onclick: () => {
          state.selectedModelId = isSelected ? null : model.id;
          render();
        },
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

  function parseJsonArray(value) {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch (_) {
      return [];
    }
  }

  function renderMarkdown(markdown) {
    const article = h("article", { class: "markdown" });
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

  function renderChangelog() {
    if (!state.changelogs.length) {
      return renderEmptyState("No changelogs yet.", "Run the daily update flow and the changelog timeline will start filling in.");
    }
    const active = state.changelogs.find((row) => row.date === state.activeChangelogDate) || state.changelogs[0];
    if (active && state.activeChangelogDate !== active.date) state.activeChangelogDate = active.date;
    if (active) ensureChangelogBody(active.date);
    const cache = active ? state.changelogBodies[active.date] : null;
    let body;
    if (!active) {
      body = renderEmptyState("Pick a changelog.", "Nothing is selected.");
    } else if (!cache || cache.status === "loading") {
      body = h("p", { class: "status-msg" }, "loading changelog…");
    } else if (cache.status === "error") {
      body = h("p", { class: "status-msg error" }, "failed to load changelog: " + cache.error);
    } else {
      body = renderMarkdown(cache.body);
    }

    return h("div", { class: "changelog-view" }, [
      h("aside", { class: "changelog-list" }, state.changelogs.map((entry) => {
        const isActive = entry.date === state.activeChangelogDate;
        const newModels = parseJsonArray(entry.new_models_json);
        return h("button", {
          class: "changelog-item" + (isActive ? " is-active" : ""),
          type: "button",
          onclick: () => {
            state.activeChangelogDate = entry.date;
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
            h("p", { class: "eyebrow" }, active ? active.date : ""),
            h("h2", null, active ? (active.title || formatDate(active.date)) : "Changelog"),
          ]),
          active && active.summary ? h("p", { class: "panel-summary" }, active.summary) : null,
        ]),
        body,
      ]),
    ]);
  }

  function statCard(label, value, note, tone) {
    return h("div", { class: "stats-card" + (tone ? " " + tone : "") }, [
      h("div", { class: "stats-label" }, label),
      h("div", { class: "stats-value" }, value),
      note ? h("div", { class: "stats-note" }, note) : null,
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
            state.view = "changelog";
            state.activeChangelogDate = row.changelog_date;
            render();
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
    if (!rows.length) {
      return renderEmptyState("No runs match these stats filters.", "Widen the date range or clear the agent filter.");
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
      h("section", { class: "stats-section" }, [
        h("div", { class: "section-head" }, [
          h("h2", null, "Totals"),
          h("p", null, "Raw spend, tokens, Agent Provider, and words across the filtered runs."),
        ]),
        h("div", { class: "stats-grid" }, [
          statCard("Runs", formatNumber(totals.runs, 0), "Changelogs with recorded run metadata"),
          statCard("Total cost", formatCurrency(totals.cost), "NULL cost rows stay out of the sum"),
          statCard("Total duration", formatDuration(totals.duration), "Wall-clock time across runs"),
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
          statCard("Words / run", formatNumber(averages.words, 0), "Body word count only"),
          statCard("Cost / word", formatCurrency(averages.costPerWord), "Across rows with both cost + words"),
        ]),
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
          h("p", null, "Grouped by agent model + Agent Provider so comparisons stay honest."),
        ]),
        renderAgentBreakdown(rows),
      ]),
      h("section", { class: "stats-section" }, [
        h("div", { class: "section-head" }, [
          h("h2", null, "Run Metrics"),
          h("p", null, "Sortable raw rows from the `run_metrics` table. Click a date to jump to that changelog."),
        ]),
        renderRunTable(rows),
      ]),
    ]);
  }

  function renderDataView() {
    if (!state.dataPromptLoaded && !state.dataPromptLoading) fetchDataPrompt();
    const promptText = state.dataPromptLoading ? "Loading prompt..." : state.dataPrompt;
    return h("div", { class: "data-view" }, h("section", { class: "data-card prompt-card" }, [
      h("div", { class: "data-card-head" }, [
        h("h3", null, "AI Prompt for updating"),
        h("p", null, "Copy this prompt and paste it into any AI coding agent to run today's dashboard update manually."),
      ]),
      h("div", { class: "data-card-body" }, [
        h("textarea", {
          id: "data-prompt",
          class: "prompt-display",
          readonly: "readonly",
        }, promptText),
        h("div", { class: "prompt-actions" }, [
          h("button", {
            class: "action-btn",
            type: "button",
            disabled: state.dataPromptLoading || !state.dataPrompt,
            onclick: copyDataPrompt,
          }, "Copy prompt"),
          h("button", {
            class: "action-btn primary",
            type: "button",
            disabled: state.dataTerminalMessage === "Opening terminal...",
            onclick: openTerminalForData,
          }, "Open Terminal"),
        ]),
        h("p", { class: "paste-hint" }, PASTE_HINT),
        h("div", { class: "data-card-status" }, [
          state.dataCopyMessage
            ? h("p", {
                id: "data-copy-state",
                dataset: { tone: state.dataCopyState || "idle" },
              }, state.dataCopyMessage)
            : null,
          state.dataTerminalMessage
            ? h("p", {
                id: "data-terminal-state",
                dataset: { tone: state.dataTerminalState || "idle" },
              }, state.dataTerminalMessage)
            : null,
        ]),
      ]),
    ]));
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
    const stroke = options.color;
    const fill = options.color + "33";

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
          stroke: "#72726b",
          grid: { stroke: "rgba(255,255,255,0.06)" },
          ticks: { stroke: "rgba(255,255,255,0.12)" },
          values: (_u, splits) => splits.map((s) => formatShortDate(new Date(s * 1000).toISOString().slice(0, 10))),
          font: '10px "JetBrains Mono", monospace',
        },
        {
          stroke: "#72726b",
          grid: { stroke: "rgba(255,255,255,0.06)" },
          ticks: { stroke: "rgba(255,255,255,0.12)" },
          size: 56,
          values: (_u, splits) => splits.map((s) => options.axis(s)),
          font: '10px "JetBrains Mono", monospace',
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

  function scheduleChartDraw() {
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
        color: "#f17bb5",
        axis: (value) => formatCurrency(value),
      });
      renderUplotChart("stats-chart-duration", rows, "duration_sec", {
        type: "line",
        label: "Duration",
        color: "#86a8ff",
        axis: (value) => formatDuration(value),
      });
      renderUplotChart("stats-chart-output", rows, "tokens_output", {
        type: "line",
        label: "Output tokens",
        color: "#72f0d7",
        axis: (value) => formatCompactNumber(value),
      });
      renderUplotChart("stats-chart-words", rows, "word_count", {
        type: "line",
        label: "Words",
        color: "#a6f17b",
        axis: (value) => formatCompactNumber(value),
      });
    });
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

  function render() {
    const viewSlot = document.getElementById("view");
    const sortGroup = document.querySelector(".sort-group");
    if (!viewSlot) return;

    const focus = captureFocus();
    renderActionBar();
    renderFilterSlot();
    renderOverlay();
    syncRefreshButton();

    if (sortGroup) sortGroup.hidden = !state.ready || !MODEL_VIEWS.has(state.view);

    if (state.error) {
      viewSlot.replaceChildren(state.error);
      renderDetailPanel(null);
      updateFreshness();
      if (!state.manualRefreshModal.open && !state.runUpdate.active && state.bootstrap.state !== "initializing") restoreFocus(focus);
      return;
    }
    if (!state.ready) {
      viewSlot.replaceChildren(renderPlaceholder(
        state.bootstrap.state === "initializing" ? "preparing dashboard…" : "loading dashboard…"
      ));
      renderDetailPanel(null);
      updateFreshness();
      if (!state.manualRefreshModal.open && !state.runUpdate.active && state.bootstrap.state !== "initializing") restoreFocus(focus);
      return;
    }

    let content;
    if (state.view === "chart") content = renderChart();
    else if (state.view === "changelog") content = renderChangelog();
    else if (state.view === "stats") content = renderStatsView();
    else if (state.view === "data") content = renderDataView();
    else content = renderTable();

    viewSlot.replaceChildren(content);

    const selected = state.selectedModelId !== null
      ? state.models.find((model) => model.id === state.selectedModelId) || null
      : null;
    renderDetailPanel(MODEL_VIEWS.has(state.view) ? selected : null);

    document.querySelectorAll(".sort-btn").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.sort === state.sortBy ? "true" : "false");
    });
    document.querySelectorAll(".view-btn").forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.view === state.view ? "true" : "false");
    });

    updateFreshness();
    if (!state.manualRefreshModal.open && !state.runUpdate.active && state.bootstrap.state !== "initializing") restoreFocus(focus);
    if (state.manualRefreshModal.open && !state.manualRefreshModal.loading) {
      const promptField = document.getElementById("refresh-prompt");
      if (promptField && state.manualRefreshModal.selectPrompt) {
        selectText(promptField);
        state.manualRefreshModal.selectPrompt = false;
      }
    }
    scheduleChartDraw();
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
      button.addEventListener("click", () => {
        state.view = button.dataset.view;
        if (!MODEL_VIEWS.has(state.view)) state.selectedModelId = null;
        render();
      });
    });
    const refreshButton = document.getElementById("refresh-trigger");
    if (refreshButton) refreshButton.addEventListener("click", handleRefresh);
    window.addEventListener("resize", scheduleChartDraw);
    window.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      if (state.runUpdate.state === "running") return;
      if (state.runUpdate.active && state.runUpdate.state !== "running") {
        closeRunUpdateOverlay();
        return;
      }
      if (state.manualRefreshModal.open) closeManualRefreshModal();
    });
    window.addEventListener("beforeunload", () => {
      resetRunUpdate(false);
      if (state.db) state.db.close();
    });
  }

  async function boot() {
    wireStaticControls();
    try {
      await waitForBootstrapReady();
      state.db = await loadDB();
      loadStaticState();
      state.bootstrap.state = state.bootstrap.supported ? "ready" : state.bootstrap.state;
      await fetchProvider();
      state.ready = true;
      window.setInterval(updateFreshness, 60000);
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
          "failed to load dashboard",
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
