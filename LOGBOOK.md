# LLM-Dash Logbook
Casual handoff notes. Newest first.

---

## Entry 117 — 2026-06-12

**Agent:** GPT-5 Codex (Mica, coding agent)
**Cycle:** Voidware 1.1.0 plan retarget
**Task:** Update the active Voidware 1.0.5 plan to use Voidware 1.1.0

---

Planning/docs-only pass. Retargeted the active package-native upgrade plan from
Voidware 1.0.5 to 1.1.0 and moved it to
[`docs/plans/2026-06-12-voidware-1-1-0-package-native-upgrade.md`](docs/plans/2026-06-12-voidware-1-1-0-package-native-upgrade.md).
Left a small superseded stub at the old 1.0.5 path so Entry 116 links do not go
dead.

Verified with authenticated GitHub Packages probes: `npm view` reports both
`@shxdowcollective/voidware` and `@shxdowcollective/voidware-cli` at `1.1.0`;
`npm pack` confirmed the plan-critical surfaces still exist in 1.1.0:
`auth:ref:write|delete|rotate`, `discoverProviderCredentialsByRef`, and the
client-grant index/path plumbing. Also compared 1.1.0 CSS against the current
vendored 1.0.4 copy and corrected the plan: 1.1.0 is a real CSS refresh
(`animations.css`, `base.css`, `layout.css`, `status-chips.css`, `toggles.css`,
`typography.css`, plus new `theme-template.css`), not the 1.0.5 no-op vendor
bump.

Updated `TODO.md` Now to point at the 1.1.0 plan and describe the new P0
expectation. No app code, dependency files, lockfiles, vendored CSS, data, or
credentials were changed.

---

## Entry 116 — 2026-06-10

**Agent:** Claude Opus 4.8 (Wren, orchestrating)
**Cycle:** Voidware 1.0.5 upgrade scoping + planning
**Task:** Scope voidware 1.0.5, decide the upgrade architecture, plan TASK 1+2

---

Planning-only pass (no code changed). Scoped voidware 1.0.5 from primary source
by diffing freshly fetched 1.0.4 vs 1.0.5 tarballs of both `@shxdowcollective/voidware`
and `@shxdowcollective/voidware-cli`.

What 1.0.5 actually adds (verified, not from notes): main pkg gains
`discoverProviderCredentialsByRef` + `userClientGrantIndexPath()`; CSS is
byte-identical to 1.0.4 (re-vendor is a no-op + VERSION bump). The cli pkg gains
broker ops `auth:ref:write|delete|rotate` and `clientGrantIndex` /
grant-cache purge plumbing. README calls it an "integration-hardening release
[adding] ref-bound broker mutations, purgeable durable client-grant cache
metadata, and ref-qualified provider discovery" — which maps 1:1 onto the two
deferred Now tasks.

Architecture decision (user-driven): no dependency on the local `~/Repos/voidware`
checkout. I first wrongly concluded `voidware-cli` was unpublished after a 401
then a 404 — but the 404 was my own botched `npm pack` (ran without the scoped
`.npmrc`), and the 401 was just the home `~/.npmrc` token lacking scope. Phxntom
pointed at `GH_PACKAGES_KEY` in `.env`; with that token `voidware-cli@1.0.5`
installs fine and ships `dist/service/index.js` (all 6 broker exports) + `dist/bin.js`.
So the plan adds `voidware-cli` as a proper npm dep and points the bridge
(`resolveServiceModule`) + Python `resolve_cli` at `node_modules` instead of the
checkout — no broker/grant subsystem rewrite, which is what an earlier reading of
the constraint had threatened.

Flow: I did the primary-source scoping myself (version/API claims gate real code,
so I verified them directly), ran one pro nano-agent to map the LLM-Dash auth
integration and one to review the plan. The plan review caught real gaps now
folded in: ESM `createRequire` for resolution, `which voidware` shadowing the
pinned dep, launchers never run `npm ci`, `_request_args` has no ref param,
write/delete don't invalidate the ref-scoped cached grant, ref-scoped accounts
under stale fingerprints in the T2 purge, and T1/T2 sharing `voidware_auth.py`
(run sequentially). Plan:
[`docs/plans/2026-06-10-voidware-1-0-5-package-native-upgrade.md`](docs/plans/2026-06-10-voidware-1-0-5-package-native-upgrade.md)
— P0 (dep + node_modules wiring, the gate) → T1 (ref write/delete) → T2 (grant
purge) → T3 (ref-qualified provider discovery). Six decision flags were put to
Phxntom and all resolved this pass: node_modules cli before global `which
voidware`; token-gated `npm ci` in the launchers; keep `~/Repos/voidware` as
last-resort fallback; `_remove_secret` becomes ref-aware for provider removals;
commit `.env.example`; and **adopt `discoverProviderCredentialsByRef` now** (the
one non-default pick → new Track T3). Plan + TODO updated with every decision;
tracks run sequentially since they share `voidware_auth.py`/`config.py`. No
docs/code touched beyond TODO + this entry + the plan.

---

## Entry 115 — 2026-06-10

**Agent:** Claude Fable 5 (Vex, orchestrating)
**Cycle:** Provider slot exact-source ref candidates
**Task:** Close deferred follow-up #1 from Entry 114

---

Connection's credential picker now gets exact-source candidates. Backend:
`discover_credential_candidates()` joins provider-discovery rows (base URL,
models URL, endpoint mode, provider family) onto same-name
`discoverAuthRefs` rows, emitting one candidate per source; name-only
fallback is kept for refs-unavailable installs. `_provider_candidate()`
passes `ref`/`source_label`/`managed_by_llmdash`/`locked`/`unreadable`
through (ref re-sanitized via `safe_credential_ref`). Frontend was already
ref-capable; only `candidateKey()` was hardened to key on
`authFilePath`/`envVar` (the old `ref.path||ref.id` fields don't exist on
safe refs), and dropdown labels append the auth-file basename when same-name
same-source-label duplicates differ only by file.

Flow: I wrote the plan (`docs/plans/2026-06-10-provider-slot-ref-candidates.md`,
local-only per .gitignore), one pro nano-agent implemented all four steps
cleanly, I reviewed the diffs (no fixes needed) and ran verification: 57/57
pytest (4 new join/passthrough/rejection tests), py_compile, `node --check`,
`git diff --check`, and an isolated-home live smoke of
`/api/credentials/discovery` (no secret-shaped fields).

Remaining credential follow-ups in TODO.md are ref-bound mutations and the
fingerprint-stale cache purge — both partly blocked on Voidware 1.0.5 asks
(ref-bound broker ops, enumerable client-grant cache).

---

## Entry 114 — 2026-06-10

**Agent:** Claude Fable 5 (Vex, orchestrating)
**Cycle:** Reset + Voidware credential remediation implementation
**Task:** Implement the full Entry-113 plan via shxdowflow nano-agent dispatch

---

Implemented `docs/plans/2026-06-10-reset-voidware-credentials-nanoagent-plan.md`
end to end. Three write-enabled pro nano-agents did the heavy lifting
(NA-impl-1: reset reliability + setup mode + grant cleanup; NA-impl-2:
discovery/config v2/grant scoping backend; NA-impl-3: slot UX + approval
modal), a pro nano reviewed the final tree, and the main agent reviewed every
diff, fixed review findings, and ran all verification.

What shipped:

- Reset: typed token actually sent, global busy guard, in-tab progress/result
  surface with cleared/removed/reseeded/warning counts, `409` when an in-app
  update job is running, full reset revokes LLM-Dash broker grants via the
  local CLI (`grants list/revoke/cleanup`, warning-only when the broker is
  down) and clears the in-process approved-secret cache. Voidware credentials
  are never deleted. `--dry-run` previews grant cleanup.
- Setup mode: `?setup=1` (launchers + in-app full reset) opens a Settings-backed
  step rail (Connection, Models, Research, Schedule, Finish); finish lands on
  Models. Separate `state.setupMode` from the legacy `resetMode` prefs wipe.
- Credential slots: config v2 (in-place migration, no rewrite churn) persists
  selected ref/name + safe metadata + grant metadata for provider/exa/llmstats.
  `/api/credentials/*` routes for discovery/select/save/update/delete with
  server-side external-mutation enforcement — ownership verified against live
  Voidware ref metadata (`custom.app`/`kind`), fail-closed, dual-flag + fresh
  password approval required for external edit/delete (`forceRefresh` plumbed
  through the bridge).
- Approval modal: renders from broker metadata (operation, target, scopes,
  TTL, passwordRequired/secretRequired); common flows are password-only; staged
  app secrets never render a Secret box; deny/close hits the broker deny
  endpoint and scrubs all secret state.
- Grants: 120d durable grants in the official `voidware-client-grants`
  namespace; legacy `llm-dash-voidware-grants` is read-fallback + cleanup-only
  (derived-account deletion for known secret names in both namespaces).

Review findings fixed before ship: default-name ownership bypass in
`_slot_managed`, config v2 rewrite-on-every-load, no-op legacy cache cleanup,
full-reset summary skipped before redirect, 90-day doc drift, dead duplicated
block in `delete_slot_credential`. Deferred follow-ups live in TODO.md
(provider ref candidates, ref-bound mutations, fingerprint-stale cache purge).

Verification: 53/53 pytest, py_compile, `node --check` on both JS entry
points, `git diff --check`, `npm run smoke:voidware`, live endpoint smoke with
isolated `LLM_DASH_SHXDOW_ROOT`, and headed screenshots
(`e2e/screenshots/m14-reset-credentials/`) confirming setup mode, research
slots, and the reset tab render clean. No real Voidware auth stores touched.

---

## Entry 113 — 2026-06-10

**Agent:** Codex GPT-5 (Sable, planning)
**Cycle:** Reset + Voidware credential remediation planning
**Task:** Scope broken Settings reset and Voidware credential flows without implementation

---

Created the planning-only remediation spec at
`docs/plans/2026-06-10-reset-voidware-credentials-nanoagent-plan.md`. No app
code, tests, database files, credentials, or Voidware auth stores were changed.

Used `shxdowflow` with nano-agents exactly for scoping/review: one flash nano
explored Settings reset/setup behavior, one flash nano explored Voidware
credential/broker behavior, and one pro nano reviewed the plan. Main-agent
verification checked the relevant files directly before writing the plan:
`web/app.js`, `server.py`, `scripts/reset_local_state.py`,
`scripts/config.py`, `scripts/voidware_auth.py`,
`scripts/voidware_app_broker.mjs`, launcher reset paths, tests, and Voidware
1.0.4 runtime guidance. Voidware spec check matched the repo dependency.

Key findings captured in the plan: the frontend posts the baked reset token
instead of the typed token; the old setup wizard no longer exists and full reset
only routes to Connection settings; reset currently preserves broker grants
despite the new desired policy; Exa and LLM Stats do not have selectable
credential slots; credential discovery is provider-only and name-collapsed; the
approval modal always shows both password and secret; process-lifetime approved
secret cache and legacy grant cache need reset cleanup; and ref-bound Voidware
selection is needed to avoid same-name keyring/auth.json ambiguity.

The pro review findings were folded into the plan: add separate `setupMode`
instead of reusing `resetMode`, clear `_APPROVED_SECRET_CACHE`, make reset busy
state global, name the concrete `voidware auth grants list|revoke|cleanup`
strategy, bump app config to version 2 for three credential slots, add ref-layer
bridge commands with safe fallback, enforce external credential mutation
server-side, scrub approval modal state on close/deny, add FastAPI reset tests,
and include dry-run grant cleanup preview.

---

## Entry 112 — 2026-06-09

**Agent:** Codex GPT-5 (Luma, UI polish)
**Cycle:** Desktop scale and color remediation
**Task:** Make the dashboard read properly on 1440p desktop displays

---

Fixed the desktop scale/color complaint across the static frontend without
changing the zero-build architecture. `web/style.css` now applies the larger
body scale only on desktop, bumps sidebar/nav sizing, restores the iridescent
page wash that had been overwritten by a later `body` rule, strengthens selected
row and score-chip color, flips iridescent primary/action text to white, centers
the single-model card under the leaderboard, and centers/widens Settings and
Stats work surfaces so they no longer feel pinned to the upper-left corner.

`web/app.js` bumps the UI prefs key to `llm-dash-ui-state-v5` so old persisted
zoom/column widths do not mask the new defaults, raises default table zoom to
112%, widens the score/provider columns, and requests larger provider logo sizes
in the table/filter/mobile/detail surfaces. Table score/rank numerals now use
the body/UI font with tabular numbers instead of the mono stack for better
readability. A follow-up low-zoom pass made provider logos/text readable at 70%
and every other table zoom, enlarged collapsed grade letters, removed the model
detail helper subtitle, centered the detail/comparison title over the displayed
card grid, and increased comparison-card grade-label contrast. Mobile
verification caught a collapsed subpage tab strip and a crowded filter row; both
were patched before handoff.

Verification: `node --check web/app.js`, `python3 -m py_compile server.py
scripts/*.py`, `git diff --check`, local `./run.sh --silent`, Agent Browser
headed smoke, and fixed-viewport Chrome screenshots saved under
`e2e/screenshots/desktop-scale/` at 2560x1440, 1440x900, 390x844, 70% table
zoom, and multi-card comparison mode. A pro nano-agent plan review flagged stale
prefs, double-scaling risk, mobile coverage, and ambiguous viewport targets; the
useful findings were applied.

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
