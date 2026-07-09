// T8: unit coverage for the extracted ranking math. Run with `node --test web/`.
// These lock in the CURRENT behavior so the app.js -> ranking.js extraction is
// provably behavior-preserving; a couple of edge quirks are asserted-and-noted
// rather than "fixed" (that would be a ranking-behavior change, out of scope).

import { test } from "node:test";
import assert from "node:assert/strict";
import { weighted, overall, valueScore, metricValue, tier, sortValue, compareBy } from "./ranking.js";

test("weighted: normalizes over surviving weights and rounds to 1dp", () => {
  assert.equal(weighted([[8, 0.25], [8, 0.25], [8, 0.25], [8, 0.1], [8, 0.15]]), 8);
  assert.equal(weighted([[10, 1], [0, 1]]), 5);
  assert.equal(weighted([[7.35, 1]]), 7.3); // 7.35 is stored as 7.3499… -> toFixed(1) = "7.3"
});

test("weighted: drops non-finite pairs, renormalizing", () => {
  // Missing cost (NaN/undefined) -> that pair is ignored, weights renormalize.
  assert.equal(weighted([[9, 0.25], [9, 0.25], [9, 0.25], [9, 0.1], [NaN, 0.15]]), 9);
  // Number(null)=0 IS finite, so a null value counts as a real 0, not "missing":
  assert.equal(weighted([[6, 0.5], [null, 0.5]]), 3);
});

test("weighted: null when nothing finite", () => {
  assert.equal(weighted([]), null);
  assert.equal(weighted([[undefined, 0.5], [NaN, 0.5]]), null);
});

test("overall: full model averages the five metrics", () => {
  assert.equal(overall({ intelligence: 8, coding: 8, agents: 8, speed: 8, cost: 8 }), 8);
});

test("overall: missing cost renormalizes (does not tank the score)", () => {
  assert.equal(overall({ intelligence: 9, coding: 9, agents: 9, speed: 9 }), 9);
});

test("overall: undefined-vs-null quirk (all-missing -> null, all-null -> 0)", () => {
  // All fields absent -> Number(undefined)=NaN -> filtered -> null (no data).
  assert.equal(overall({}), null);
  // Explicit nulls -> Number(null)=0 is finite -> averages to a real 0. This is
  // why an unscored row (overall===null) and an all-null row differ; asserted,
  // not "fixed" (a ranking-behavior change is out of scope for T8).
  assert.equal(overall({ intelligence: null, coding: null, agents: null, speed: null, cost: null }), 0);
});

test("valueScore: blends overall/cost/speed", () => {
  const m = { intelligence: 8, coding: 8, agents: 8, speed: 8, cost: 8 };
  assert.equal(valueScore(m), 8);
});

test("valueScore: all-null model collapses to 0 (overall null -> Number(null)=0 quirk)", () => {
  // NOTE current behavior: overall({}) is null, but Number(null)=0 is finite, so
  // valueScore counts it as 0 rather than propagating null. Asserted, not fixed.
  assert.equal(valueScore({}), 0);
});

test("tier: grade boundaries", () => {
  assert.equal(tier(10).label, "S");
  assert.equal(tier(9.0).label, "S");
  assert.equal(tier(8.99).label, "A");
  assert.equal(tier(8.0).label, "A");
  assert.equal(tier(7.99).label, "B");
  assert.equal(tier(7.0).label, "B");
  assert.equal(tier(6.0).label, "C");
  assert.equal(tier(5.0).label, "D");
  assert.equal(tier(4.99).label, "F");
  assert.equal(tier(0).label, "F");
});

test("tier: non-finite -> N/A; null is a documented quirk", () => {
  assert.equal(tier(NaN).label, "N/A");
  assert.equal(tier(undefined).label, "N/A");
  assert.equal(tier(Infinity).label, "N/A");
  // NOTE: Number(null)=0 passes the finiteness guard, then null>=5 is false, so
  // an unscored model (overall===null) currently renders "F", not "N/A".
  assert.equal(tier(null).label, "F");
});

test("tier: cls tracks the label", () => {
  assert.equal(tier(9).cls, "tier-s");
  assert.equal(tier(4).cls, "tier-f");
  assert.equal(tier(NaN).cls, "tier-na");
});

test("metricValue: overall/value keys vs raw fields vs missing", () => {
  const m = { intelligence: 8, coding: 8, agents: 8, speed: 8, cost: 8 };
  assert.equal(metricValue(m, "overall"), 8);
  assert.equal(metricValue(m, "value"), 8);
  assert.equal(metricValue(m, "coding"), 8);
  assert.equal(metricValue({}, "coding"), 0);
});

test("sortValue: null-safe (missing overall sorts as 0)", () => {
  assert.equal(sortValue({}, "overall"), 0);
  assert.equal(sortValue({ intelligence: 8, coding: 8, agents: 8, speed: 8, cost: 8 }, "overall"), 8);
  assert.equal(sortValue({ coding: 5 }, "coding"), 5);
});

test("compareBy: lexical for name/vendor, numeric otherwise, with name tiebreak", () => {
  const a = { name: "Alpha", vendor: "OpenAI", intelligence: 9, coding: 9, agents: 9, speed: 9, cost: 9 };
  const b = { name: "Beta", vendor: "Anthropic", intelligence: 5, coding: 5, agents: 5, speed: 5, cost: 5 };
  assert.ok(compareBy(a, b, "name", "asc") < 0);
  assert.ok(compareBy(a, b, "name", "desc") > 0);
  assert.ok(compareBy(a, b, "overall", "desc") < 0); // a has higher overall, desc -> a first
  assert.ok(compareBy(a, b, "overall", "asc") > 0);
  // Equal metric -> falls back to name comparison.
  const c = { name: "Zed", coding: 7 };
  const d = { name: "Ace", coding: 7 };
  assert.ok(compareBy(c, d, "coding", "desc") > 0);
});
