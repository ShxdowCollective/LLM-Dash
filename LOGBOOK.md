# LLM-Dash Logbook
Casual handoff notes. Newest first.

---

## Entry 111 — 2026-06-09

**Agent:** Codex GPT-5 (Mica, auth hardening)
**Cycle:** Install-over Voidware auth retention remediation
**Task:** Prevent old install-over marker artifacts from clobbering or poisoning
Voidware auth handling

---

Remediated the reported marker-only `auth.json` failure on the LLM-Dash side.
The named writer scripts (`scripts/verify-desktop-install-over.mjs` and
`scripts/win-install-over-verify.ps1`) are not present in this checkout, and
`git log --all --name-only` shows no tracked history for them, so the direct
installer-side writer fix belongs wherever those scripts live. This repo now
guards the auth pipeline against their old bad artifact.

`scripts/voidware_auth.py` now recognizes only the exact old marker shape:
`{"marker": <non-empty string>, "version": 3, "credentials": {}}` with no
other keys. That shape is treated as empty/no credentials for broker status,
provider discovery, and secret reads; missing markers, corrupt JSON, plaintext
v2, and real encrypted v3 files still go through normal Voidware handling. New
secret writes move that old marker file to
`~/.shxdow/.shxdowgen-install-over-marker` first, then let Voidware create the
real encrypted auth file. The Settings provider panel now shows targeted
recovery copy only for that `legacy_install_over_marker` broker state; a
marker-less invalid v3 file remains an unreadable vault instead of being
silently treated as old verification state.

Regression coverage in `tests/test_voidware_auth.py` now creates a valid
encrypted v3 auth file through `@shxdowcollective/voidware/auth` with
`setPasswordProvider`, confirms a separate marker file does not overwrite it,
and covers the classifier matrix. Focused verification:
`python3 -m unittest tests.test_voidware_auth` (24 tests),
`python3 -m py_compile scripts/voidware_auth.py tests/test_voidware_auth.py`,
and `node --check web/app.js`.

Plan: `docs/plans/2026-06-09-install-over-auth-retention-fix.md`. TODO updated
with the completed remediation. No commit/push.

---

## Entry 110 — 2026-06-09

**Agent:** Claude Fable 5 (Iris, orchestrator)
**Cycle:** M13 follow-up close-out — metadata backfill
**Task:** Close the three open TODO follow-ups (logo audit, capability
backfill, per-model card_urls) via nano-agent research + implementation

---

Ran the whole thing through nano-agents per the goal — four flash research
batches (queued, two tracks max), one pro implementation nano, one pro final
reviewer — with every claim re-verified by the main agent before it touched
anything durable. Plan + full verified research table with citations:
`docs/plans/2026-06-09-open-followups-metadata-backfill-nanoagent-plan.md`
(local-only, like the other milestone plans).

**Logo audit (follow-up 1).** Closed as audit-only: all 10 DB vendors map in
`VENDOR_LOGO` and all 12 slugs have SVGs in `web/vendor/logos/` (DeepSeek +
Mistral are spares). No edits.

**Capabilities (follow-up 2).** 21 of 34 rows upgraded from the `["text"]`
default, every one backed by a fetched primary source (vendor model cards,
DeepMind/Gemma cards, vendor-org HF cards): OpenAI GPT-5.x/4.1 + all Claude
text+image; Gemini 3.x text+image+audio+video; Qwen3.5/3.6 + Kimi K2.5
text+image+video (HF cards have image-text-to-text tags + image/video chat
templates); Gemma 26B MoE text+image. Ten models stay text-only because their
cards document nothing else (GLM, MiniMax, Nemotron, Qwen3-Coder-Next,
MiMo-V2-Pro, GPT-OSS — the last is documented text-only, now explicit).
Rejected two nano over-reads: Gemma E4B "video" (the card's spec table says
Text/Image/Audio only) and a Gemini 3.1 Flash-Lite "deprecation" that is just
Google's routine 1-year lifecycle table.

**Deprecations.** Two real ones found and stamped with citations:
Grok Code Fast 1 (`deprecated_on` 2026-05-15 — retired from the xAI API,
requests now redirect to grok-build-0.1) and GPT-5.1-Codex-Mini (2026-04-22
announce, 2026-07-23 shutdown, replacement gpt-5.4-mini). GPT-5 mini, GPT-4.1,
Opus 4.6 stay `superseded` — absent from vendor deprecation pages.

**card_urls (follow-up 3).** 32 of 34 upgraded to exact per-model pages, all
curl-verified (Anthropic news links swapped for the per-model docs pages;
Qwen3.6 Plus blog verified by rendering the JS page via agent-browser). MiMo
x2 keep the vendor org page — the nano returned MiMo-V2.5 cards (wrong
version) and the real V2 repos are 401-gated, so the fallback is the honest
choice.

**Mechanics.** Seed (`scripts/init_db.py` MODELS) is the durable, committable
source of truth — fresh clones/reseeds get everything. One-off
`scripts/backfill_metadata_20260609.py` (`--db-path`, `--dry-run`, protected-
row guard, deprecation allowlist, single transaction) synced the live DB:
matched=34 card_url=32 capabilities=21 status=2. This is deliberate dev-time
maintenance with citations, not an update run — no changelog, no run_metrics
row, no `meta.last_updated` bump; scores/notes untouched (verified by full-
column diff against a pre-apply copy). Updated the stale
`test_seed_multimodal_capabilities` example (GPT-5.4 is now a *documented*
text+image model; MiniMax M2.5 is the new default example). 24/24 tests pass.

---

## Entry 109 — 2026-06-08

**Agent:** Claude Opus 4.8 (Vega, full-stack)
**Cycle:** Milestone 13 — implementation + M12 follow-up close-out
**Task:** Ship all of M13 (table UX, ranking, reset, schema v4 metadata) + full
screenshot-led UX pass, no follow-ups left

---

Implemented M13 end to end against
[`docs/plans/2026-06-08-m13-table-ux-data-overhaul.md`](docs/plans/2026-06-08-m13-table-ux-data-overhaul.md).
Picked up the uncommitted data-layer drift Entry 108 flagged and finished it
(no double-applied migration — `migrate_model_metadata_v4` is idempotent).
Per the goal, routed delegatable work through nano-agents: a pro nano reviewed
the data-layer diff (clean), a pro nano did the docs sweep (verified), an image
nano ran the screenshot UI/UX review, and a final pro nano reviewed the app.js
diff (verdict: shippable). Tightly-coupled JS stayed native for one mental model.

**Data layer (schema v4).** `scripts/migrate_model_metadata_v4.py` adds
`input_capabilities` (canonical JSON subset of text/image/audio/video, default
`["text"]`) and `deprecated_on` (nullable; stamped on status→deprecated, cleared
on reactivation). Idempotent, recreates `v_models_latest`, bumps 3→4. Wired into
`server.py` startup + top of `run_update.py`; upsert uses COALESCE so a run never
wipes either field; status_changes loop stamps `deprecated_on`. schema.sql +
init_db seed (3 documented multimodal models) + writer validation + full SKILL.md
contract sweep. No prose backfill (data-honesty rule). Ran clean + idempotent on
the live DB; applied the 3 documented multimodal rows to live so the UI shows
real variety (modalities from each model's own card, not invented).

**Ranking (frontend-only).** Overall = 25/25/25/10/15 (cost now counts),
Value = 60/25/15. Re-checked distribution (A:13 B:13 C:5 D:3, top 8.6 — empty S
is the deliberate cost-weighting consequence). Documented in ARCHITECTURE.

**Table (items 1+2).** Header-click sort (`COLUMNS` model, `aria-sort`, caret)
replacing the dropdown; real Provider column; pointer-drag resizable columns via
`<colgroup>` persisted to `colWidths`; zoom slider scaling `--table-zoom`;
desktop grade-letter collapse <0.85 (reuses `tier()`, CSS-only number→letter so
it keeps numeric in title for a11y); compact mobile sort `<select>`. `STORE_KEY`
→ `-v4` with full `loadPrefs` normalization + `sortKey` whitelist.

**Metadata UI (items 8+9).** Inline-SVG capability chips (distinct hue, no emoji)
in table/detail/filters/mobile; deprecation badge + date; "Ignore deprecated"
toggle (yields to explicit Status=Deprecated); CSV adds status/deprecated_on/
capabilities. Added `path` to the `h()` SVG tag set — the exact gap Entry 108's
review predicted; without it the glyphs render as HTML and vanish.

**Settings Reset (item 4).** `POST /api/reset` + server-validated typed
`confirm_token`. Scoped functions in `reset_local_state.py`: stats (run_metrics
+ CSV + logs, keep freshness), changelog (FK-ordered run_metrics→changelogs + md;
the one sanctioned append-only exception, now documented across CLAUDE/AGENTS/
SKILL/docs), models (clear + reseed bootstrap), full (all-or-nothing; server
re-seeds on reload). Credentials safe by construction — config is metadata-only,
zero keyring/broker calls. New Reset tab: four typed-confirm cards, danger-styled
full reset, explicit "credentials not affected" note.

**Spacing/copy (items 5, 6, 10).** Stats CTA top-right beside the filters;
freshness centered under Refresh (`text-align`, the prior `justify-content` was
inert on inline text); kicker removed; app-wide density pass. The image nano
caught stretched Stats KPI cards — grid rows defaulting to stretch in the
flex-grown shell; fixed with `align-content:start` (card 423→115px). Wider Reset
panel, filter-row toggles aligned to the control baseline, brighter KPI labels.

**Verification.** New `tests/test_m13.py` (14) + existing auth suite = 24 passing
(migration idempotency, capability order/dedupe/unknown-rejection, all reset
scopes on throwaway DBs, FK ordering, freshness preservation). Endpoint token
gating tested live (wrong token → 400). Header sort, zoom/grade collapse, column
resize, capability filter, prefs persistence verified live via agent-browser
(`getComputedStyle`, not attributes). Final nano review fixes applied: zoom
slider now keeps focus across the grade threshold (class toggle, not a re-render
that rebuilt the toolbar mid-drag) and resize cleans up on `pointercancel`.
Headed 1440 + 390 screenshots in `e2e/screenshots/m13/`. Hardened `init_db` path
prints against out-of-root seeding (surfaced by the harness). `?v=` →
`m13-20260608c`. Not committed.

---

## Entry 108 — 2026-06-08

**Agent:** Claude Opus 4.8 (shxdowflow orchestrator)
**Cycle:** Milestone 13 — planning (Codex review pass + tree-state reconciliation)
**Task:** Final Codex review of the M13 plan; flag working-tree drift

---

Ran the requested final Codex review of
[`docs/plans/2026-06-08-m13-table-ux-data-overhaul.md`](docs/plans/2026-06-08-m13-table-ux-data-overhaul.md)
after the pro nano-agent review. Codex returned and I verified:

- **OWNER_SIGNOFF needed:** (a) item 4 changelog reset deletes `changelogs/*.md`,
  which conflicts with the append-only rule (`AGENTS.md:47`, `CLAUDE.md:39`); (b)
  item 3 ranking formula folds cost into `overall` with new weights — reshuffles
  the leaderboard.
- **MISSING_WIRING:** the hand-rolled `h()` (`web/app.js:1544`) only namespaces a
  fixed set of SVG tags (`svg`,`rect`,`line`,`text`,`circle`,`polygon`,`g`) —
  capability icons using `path`/`use`/`polyline` won't render unless that set is
  extended. Items 8/9 frontend (defaults, filters, table/detail render, CSV
  export) is still unwired.
- **RISK:** item 7 — seed notes in `init_db.py` still embed raw benchmark numbers,
  which would violate the new notes guidance on any post-M13 model reset; rewrite
  seeds or grandfather legacy entries.

**⚠️ Tree-state drift discovered.** The plan and Entry 107 both say "no
implementation has started," but the working tree already carries uncommitted
data-layer implementation for items 7/8/9:
- Modified: `scripts/schema.sql` (adds `input_capabilities`, `deprecated_on`),
  `scripts/init_db.py`, `scripts/run_update.py`, `server.py`, `skill/SKILL.md`.
- New (untracked): `scripts/migrate_model_metadata_v4.py`.

These appear to be from the parallel Codex/Vesper background process that also
revised the plan. **Left untouched** — not reverted, not committed, not pushed —
pending the owner's call. The plan/TODO "no implementation yet" wording is now
stale and should be reconciled before the coding pass to avoid double-applying the
v4 migration. No frontend (`web/`) implementation exists yet.

---

## Entry 107 — 2026-06-08

**Agent:** Codex GPT-5 (Vesper, planning)
**Cycle:** Milestone 13 — planning
**Task:** Plan the table UX, ranking, reset, metadata, and Voidware/auth follow-up

---

Planned M13 from the owner's 12-item brief without implementation changes.
Used shxdowflow + nano-agents as requested: ran nano-agent preflight, dispatched
two read-only repo explorers, verified their file claims directly, used Exa for
current ranking-methodology research, drafted/revised the plan, sent it through a
pro nano-agent plan review, and folded in the actionable findings.

Plan:
[`docs/plans/2026-06-08-m13-table-ux-data-overhaul.md`](docs/plans/2026-06-08-m13-table-ux-data-overhaul.md).
TODO now has M13 as the active planned work with implementation checkboxes.

Key decisions recorded:
- Header-click sorting gets a real Provider column; Model sorts by model name,
  Provider sorts by provider then model.
- Ranking formula proposal is researched and concrete: Overall =
  25% intelligence, 25% coding, 25% agents, 10% speed, 15% cost; Value =
  60% Overall, 25% cost, 15% speed.
- Schema v4 combines `input_capabilities` JSON text and `deprecated_on`, with
  one migration file (`scripts/migrate_model_metadata_v4.py`) and runtime wiring
  required in both server startup and update runs. Migration backfill must not
  guess modality/deprecation values from prose.
- Reset tab is explicitly destructive and typed-confirmed; full reset may clear
  LLM-Dash app config/schedule, but must not touch Voidware credentials,
  reusable provider credentials, keyring/keystore secrets, or broker grants. The
  server endpoint must validate a scope-specific `confirm_token`, not just trust
  frontend confirmation.
- Table density decisions are pinned: desktop grade collapse happens below zoom
  `0.85`; mobile gets a compact sort select, not resize/grade-collapse.
- Voidware package check: `npm view @shxdowcollective/voidware version` returned
  `1.0.4`, matching `package.json` and `web/vendor/voidware/VERSION.md`.

No app implementation, DB mutation, benchmark update, changelog reset, or
credential operation was performed.

---
