# Phase 8.12 — Docs and Agent Contract Pass (Nanoagent Plan)

**Author:** wxlf (Claude Opus 4.7), 2026-05-08
**Mode:** shxdow-flow with native subagent exploration/review and pro nano-agents for execution
**Goal:** bring every Markdown surface in the repo back in sync after Phase 8.10.1
(Voidware app shell), Phase 8.10 (in-app Settings), and Phase 8.11 (optional LLM
Stats enrichment + score-range schema hardening) landed. Condense `TODO.md` so
the backlog reads as a forward roadmap, not a graveyard. Log an entry when done.

## 1. Scope

In scope (every Markdown surface that documents *behavior or contracts*):

- `README.md`
- `CLAUDE.md`
- `AGENTS.md`
- `TODO.md`
- `LOGBOOK.md`
- `skill/SKILL.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `docs/scheduling.md`
- `docs/update_dashboard.md`
- `.github/ISSUE_TEMPLATE/bug_report.md`
- `.github/ISSUE_TEMPLATE/feature_request.md`

Out of scope:

- `docs/plans/*.md` historical phase plans — they are an audit trail and stay
  frozen.
- `docs/logbooks/LOGBOOK_1.md` — archive, frozen.
- `changelogs/*.md` — append-only history.
- This plan file itself once written.

## 2. Verified Doc Drift (already audited)

Cross-checked against actual code at HEAD before planning. Findings below are
real, with file:line refs for both sides.

### A. Schema versioning under-documented

- Code reality: `scripts/init_db.py:27` sets `SCHEMA_VERSION = "2"`;
  `scripts/migrate_score_checks.py` rebuilds `model_scores` with
  `CHECK (col BETWEEN 0 AND 10)` constraints; auto-migration is wired into
  `server.py:396` startup and `scripts/run_update.py:799`.
- Doc claim gap: `docs/ARCHITECTURE.md:118-119` lists `meta.schema_version`
  as a key with no semantics; `docs/DEVELOPMENT.md:159-165` describes generic
  schema-change steps with no pointer to the existing migration.

### B. Project structure tables missing modules

- Real files: `scripts/voidware_auth.py`, `scripts/migrate_score_checks.py`.
- Doc gap: neither appears in `README.md` Project Layout (lines 161-202) or
  `docs/DEVELOPMENT.md` Backend table (lines 73-83).

### C. Scheduling doc still describes Phase 7 as forthcoming

- `docs/scheduling.md:67` says "prefer the Phase 7 OS-level scheduled job once
  it lands". Phase 7 has shipped (per `TODO.md:138`). The OS-level scheduled
  job is now the supported first-party path, not a future option.

### D. Score-range guarantee absent from agent contracts

- `skill/SKILL.md:132` says "All five scores ∈ [0.0, 10.0]" but doesn't note
  that the database now enforces this with CHECK constraints (so a write
  outside the range fails the transaction, not just the contract).

### E. TODO.md is bloated with completed checkpoint history

- `TODO.md:9-104` carries 60+ done checkmarks for Phase 8.10.1 stages plus
  Phase 8.11 detail. Keep the *result*; archive the per-checkpoint detail.
- Nice-to-haves at `TODO.md:111-119` are a flat backlog with no grouping or
  next-step framing — should become Phase 9.x milestones.

### F. Settings/wizard structure mismatch in old prose

- `web/app.js:75-84` defines four Settings subpages (Provider, Models,
  Research, Schedule). The TODO Phase 8.10.1 done line at `TODO.md:48-49`
  still names "Agent Provider, Models, Exa, Schedule, Manual Update" — it's
  in the *done checkpoints* section so it isn't lying about current state,
  but it will read as drift after condensing.

### G. CLAUDE.md and AGENTS.md

- Both are clean and current. Entrypoint tables match the actual files. No
  edits required beyond confirming the link sanity pass passes.

### H. Issue templates

- Both clean. Drop `Python version: (e.g., 3.13)` example to match the 3.10+
  prerequisite without locking onto a specific minor.

### I. Settings terminology audit

- The three credential terms across all in-scope docs are consistent enough:
  "Provider API key", "Exa API key", "LLM Stats API key". The only outlier
  is `docs/ARCHITECTURE.md:286-289` which uses "API keys" (plural) loosely
  in the Credential storage table. Tighten that row.

## 3. Approach

Six nano-agent passes (pro model `opencode-go/deepseek-v4-pro`), each scoped
to a tight set of files. Main agent reviews every diff before integration.
TODO.md and LOGBOOK.md are written by the main agent (project-state writes,
high-context).

| Pass | Files | Scope |
|---|---|---|
| 1 | `docs/ARCHITECTURE.md` | Add Schema Versioning subsection (v2 + CHECK constraints + migration pointer). Tighten Credential storage row at line 286-289. Fix Settings view row at line 153 to include `/api/llmstats` and match real subpages (Provider, Models, Research, Schedule). Update Key Design Decisions credential store row at line 340 to reflect the env → Voidware broker → keyring → auth-file precedence, not "keyring + JSON fallback". |
| 2 | `docs/DEVELOPMENT.md` | Add `scripts/voidware_auth.py` and `scripts/migrate_score_checks.py` to backend table. In Schema Changes, name `scripts/migrate_score_checks.py` as the concrete example of a migration module that ships in this repo. |
| 3 | `README.md` | Add `voidware_auth.py` and `migrate_score_checks.py` to the Project Layout `scripts/` block. |
| 4 | `skill/SKILL.md` | Note that score range is CHECK-enforced (one line in step 4 rules). Update the architecture reference at line 22 from `../docs/plans/IMPLEMENTATION_PLAN.md` to `../docs/ARCHITECTURE.md`. |
| 5 | `docs/scheduling.md` | Replace "Phase 7 OS-level scheduled job once it lands" framing with the current reality: Phase 7 has shipped and the OS-level scheduled job is now the supported first-party path. |
| 6 | `docs/update_dashboard.md` | Add a brief note that the runner injects optional LLM Stats enrichment context when a key is configured, with a pointer to verify it ran via `run_metrics.notes` (`llmstats_enriched=true`). |

Main-agent-only work:

- `TODO.md` rewrite: Active Roadmap = Phase 8.12 only; collapse both Phase
  8.10.1 done checkpoints **and** the inline Phase 8.11 done list into
  one-line completion entries under Completed History; promote nice-to-haves
  to Phase 9.1 / 9.2 / 9.3 milestones (data exploration, keyboard polish,
  Stats enrichment).
- `LOGBOOK.md`: Entry 060 for Phase 8.12.
- `.github/ISSUE_TEMPLATE/bug_report.md`: drop the Python 3.13 example so the
  field reads as a generic prompt.
- `CLAUDE.md`, `AGENTS.md`, `.github/ISSUE_TEMPLATE/feature_request.md`:
  confirm clean during link pass, no edits.

## 4. Iteration count and stop conditions

Five nano-agent passes total, all bounded to a single file each. Stop
conditions:

- Each nano-agent returns a clean diff that passes main-agent review.
- If a nano-agent returns drift (touches a file outside its scope, hallucinates
  unrelated change, or misses the requested edit), retry once with the same
  pro model and a tightened prompt. If retry still fails, the main agent
  performs the edit directly.

## 5. Permissions

All nano-agents run with file-write permission scoped to a single file.
Non-doc files are off-limits. No commits, no pushes. The main agent owns
final integration.

## 6. Verification

After all edits:

- `node --check web/app.js` — sanity check JS still parses (no JS edits, but
  catches accidental cross-file damage).
- `python3 -m py_compile server.py scripts/config.py scripts/run_update.py
  scripts/migrate_score_checks.py scripts/init_db.py scripts/voidware_auth.py`
  — same reasoning.
- Markdown link sanity: walk every internal link in the in-scope docs and
  confirm the target path exists.
- `git diff --check` — whitespace.

## 7. Final review

- Codex full-tree review against this plan + the user's request. Findings
  must cite file:line refs.
- Main-agent diff review of the working tree before summary.

## 8. Risks

- **Nano-agent drift:** mitigated by single-file scope, tight prompts that
  quote exact insertion points, and main-agent diff review every pass.
- **Terminology over-correction:** the docs are *mostly* consistent already.
  Don't rewrite for taste — only fix actual contradictions.
- **TODO condensation losing audit trail:** keep one short summary line per
  closed phase under Completed History; the per-checkpoint detail lives in
  LOGBOOK and the per-phase plan files anyway.
- **Plan-file historical drift:** `docs/plans/IMPLEMENTATION_PLAN.md` is
  v1-scope (status: draft v2, 2026-04-20). Per scope, do not rewrite — it's
  audit trail.

## 9. Owner

Main agent (wxlf, Claude Opus 4.7) owns correctness end-to-end. Nano-agents
execute bounded edits. Codex performs final review sweep. User commits.
