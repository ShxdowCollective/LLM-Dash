// LLM-Dash ranking math — the single source of truth for Overall/Value scores,
// tiers, and sort ordering. Extracted from app.js (T8) so it is unit-testable
// under `node --test` while the browser imports it as a plain ES module.
//
// Pure functions only: they take a model-like object (`{intelligence, coding,
// agents, speed, cost}`) and return numbers/labels. No DOM, no app state.

// Weighted average of [value, weight] pairs, ignoring non-finite entries and
// renormalizing by the surviving weights. Returns null when nothing is finite,
// so callers can distinguish "no data" from a real 0. Rounded to 1 decimal.
export function weighted(parts) {
  const valid = parts.map(([v, w]) => [Number(v), Number(w)]).filter(([v, w]) => Number.isFinite(v) && Number.isFinite(w));
  if (!valid.length) return null;
  const w = valid.reduce((sum, item) => sum + item[1], 0);
  return +(valid.reduce((sum, item) => sum + item[0] * item[1], 0) / w).toFixed(1);
}

// M13 ranking weights (documented in docs/ARCHITECTURE.md). Capability is 75%
// of Overall, but cost now counts so the leaderboard isn't price-blind. Value
// is the practical-buyer sort: mostly Overall, then cost, then speed.
export function overall(model) {
  return weighted([[model.intelligence, 0.25], [model.coding, 0.25], [model.agents, 0.25], [model.speed, 0.10], [model.cost, 0.15]]);
}

export function valueScore(model) {
  return weighted([[overall(model), 0.60], [model.cost, 0.25], [model.speed, 0.15]]);
}

export function metricValue(model, key) {
  if (key === "overall") return overall(model);
  if (key === "value") return valueScore(model);
  return Number(model[key]) || 0;
}

export function tier(score) {
  if (!Number.isFinite(Number(score))) return { label: "N/A", cls: "tier-na" };
  if (score >= 9) return { label: "S", cls: "tier-s" };
  if (score >= 8) return { label: "A", cls: "tier-a" };
  if (score >= 7) return { label: "B", cls: "tier-b" };
  if (score >= 6) return { label: "C", cls: "tier-c" };
  if (score >= 5) return { label: "D", cls: "tier-d" };
  return { label: "F", cls: "tier-f" };
}

export function sortValue(model, key) {
  if (key === "overall") return overall(model) || 0;
  if (key === "value") return valueScore(model) || 0;
  return Number(model[key]) || 0;
}

// Pareto frontier over a model set on two 0–10 score axes. Every metric (cost
// included) is scaled higher-is-better, so a model is DOMINATED when another
// model is at least as good on both axes and strictly better on at least one;
// the frontier is the non-dominated remainder. A model whose value on either
// axis is null/NaN/absent is excluded entirely — "no data" can't sit on a
// frontier. Ties (identical x,y) are all kept: neither dominates the other.
// Pure: takes model-like objects, returns a subset of the input array.
export function paretoFrontier(models, xKey, yKey) {
  const read = (model, key) => {
    if (key === "overall") return overall(model);
    if (key === "value") return valueScore(model);
    const raw = model[key];
    if (raw === null || raw === undefined || raw === "") return null;
    const v = Number(raw);
    return Number.isFinite(v) ? v : null;
  };
  const pts = (models || [])
    .map((model) => ({ model, x: read(model, xKey), y: read(model, yKey) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
  return pts
    .filter((p) => !pts.some((q) => q !== p && q.x >= p.x && q.y >= p.y && (q.x > p.x || q.y > p.y)))
    .map((p) => p.model);
}

// String columns (name, vendor) compare lexically; everything else numerically.
export function compareBy(a, b, key, dir) {
  let delta;
  if (key === "name" || key === "vendor") {
    delta = String(a[key] || "").localeCompare(String(b[key] || ""), undefined, { sensitivity: "base" });
  } else {
    delta = sortValue(a, key) - sortValue(b, key);
  }
  if (dir === "desc") delta = -delta;
  return delta || String(a.name || "").localeCompare(String(b.name || ""));
}
