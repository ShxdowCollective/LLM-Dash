# Phase 9.6 — Voidware 0.9.8 Upgrade Plan

## Goal

Upgrade LLM-Dash from vendored Voidware `0.8.4` to the current Voidware
`0.9.8` contract, refresh any out-of-date workspace Voidware skills, and close
the work with screenshot and code review gates.

Verified current version sources:

- `/home/phxntom/Repos/voidware/package.json` reports `0.9.8`.
- `npm view @shxdowcollective/voidware version --json` reports `0.9.8`.
- `/home/phxntom/Repos/voidware/skills/voidware-spec/spec.json` reports
  `specVersion: 0.9.8`.

## Current State

- LLM-Dash vendors Voidware CSS from `/home/phxntom/Repos/voidware/src/css` under
  `web/vendor/voidware/`.
- A direct source/vendor diff shows the 0.9.8 CSS payload is already identical
  except `web/vendor/voidware/buttons.css`; the package added explicit
  `.vw-btn-compact` dimensions (`min-height: 32px`, `padding: 0 12px`).
- `web/vendor/voidware/VERSION.md`, `README.md`, `docs/ARCHITECTURE.md`,
  `docs/DEVELOPMENT.md`, and app CSS comments still reference Voidware `0.8.4`.
- The installed Codex `voidware-spec` skill is at `0.9.0`.
- The shxdowSkills master `voidware-spec` skill is at `0.8.4`.
- LLM-Dash has one repo-local update skill at `skill/SKILL.md`; it is not a
  Voidware spec skill, but should be checked for stale version or workflow
  references.

## Change Scope

### In Scope

- Replace the vendored Voidware CSS files with the `0.9.8` release source.
- Update Voidware version/provenance documentation in README, architecture,
  development docs, and vendor metadata.
- Refresh installed workspace `voidware-spec` skills from the local Voidware
  `0.9.8` source where they are out of date.
- Inspect and update repo-local skills only if they contain stale Voidware
  version or workflow expectations.
- Apply small LLM-Dash CSS/JS/markup fixes needed by the `0.9.8` contract,
  especially:
  - `.vw-sidebar.open` / `data-vw-open="true"` mobile drawer state mirroring
  - horizontal overflow cues on dense tables
  - compact product dashboard expectations
  - no debug copy, decorative chips, or clipped navigation labels
- Capture headed screenshots at `1280x800`, `768x600`, and `1280x640`; include
  drawer/mobile evidence if the shell supports it.
- Update `TODO.md` and `LOGBOOK.md`.

### Out of Scope

- Dashboard benchmark data changes.
- Rewriting old `changelogs/*.md`.
- Reworking credential semantics or adding new secret write paths.
- Turning this into a product feature phase beyond upgrade-driven polish.

## Implementation Steps

1. **Plan review**
   - Done: read-only pro nano-agent review completed after plan creation.
   - Folded actionable findings into this revision before implementation.

2. **TODO setup**
   - Add Phase 9.6 under `TODO.md` as the active milestone with this plan path.

3. **Skill refresh**
   - Verify the Voidware source skill at
     `/home/phxntom/Repos/voidware/skills/voidware-spec` is the committed
     `0.9.8` source before syncing it outward.
   - Sync `voidware-spec` from `/home/phxntom/Repos/voidware/skills/voidware-spec`
     into stale local workspace skill copies:
     - `/home/phxntom/.claude/skills/voidware-spec`
     - Windows mirrors under `/mnt/c/Users/halor/.codex/skills/voidware-spec`
       and `/mnt/c/Users/halor/.claude/skills/voidware-spec`
     - `/home/phxntom/Repos/shxdowSkills/skills/voidware-spec`
   - `/home/phxntom/.codex/skills/voidware-spec` is already at `0.9.8`; use it
     as a post-sync validation path rather than overwriting it.
   - Check whether remote workspace copies are reachable and stale. Sync them
     if safe in this session; otherwise document the exact skipped target and
     reason.
   - Re-run `scripts/check_voidware_spec.py` from each synced skill copy when
     practical, then run the current Codex copy as the final validation.

4. **Vendor CSS upgrade**
   - Copy the canonical CSS files from `/home/phxntom/Repos/voidware/src/css`
     to `web/vendor/voidware/`.
   - Keep `theme-template.css` excluded unless LLM-Dash needs theme authoring.
   - Update `web/vendor/voidware/VERSION.md` with version `0.9.8`, source
     commit, copy date, license, and file list.
   - Explicitly compare `web/vendor/voidware/VERSION.md` against
     `/home/phxntom/Repos/voidware/package.json`; the spec checker finds nearby
     source repos and does not prove the vendored metadata is current.

5. **App compatibility and polish**
   - Compare new package CSS against LLM-Dash overrides.
   - Treat the package copy as a narrow `buttons.css` bump; any app changes are
     spec-guidance alignment, not broad CSS compatibility repair.
   - Patch `web/index.html`, `web/app.js`, and `web/style.css` only where the
     `0.9.8` spec creates confirmed drift.
   - Verify existing sidebar `.open` / `data-vw-open="true"` mirroring and add
     matching package state to the backdrop if missing.
   - Prioritize route-nav semantics, focus/keyboard behavior, overflow
     affordances, responsive shell behavior, and dense data panel polish.

6. **Docs**
   - Update visible Voidware version references in README, architecture, and
     development docs.
   - Update any repo-local skill docs only when they contain stale Voidware
     expectations.

7. **Verification**
   - Run focused static checks:
     - `node --check web/app.js`
     - `python3 -m unittest discover -v`
     - `python3 -m py_compile server.py scripts/*.py tests/*.py`
     - `git diff --check`
   - Run the Voidware spec checker against LLM-Dash and synced skill copies.
   - Run browser console/page error probes as the CSS load/cascade sanity check.
   - Launch the app on an isolated local port and capture headed screenshots at
     the required viewports.
   - Use browser probes for console errors, page errors, body horizontal
     overflow, drawer state, and dense panel scroll behavior.

8. **Visual review**
   - Dispatch a visual nano-agent (`--type image`) against the final screenshot
     set with the Voidware `0.9.8` spec expectations.
   - Fix confirmed P0/P1 findings and recapture affected surfaces.

9. **Final review**
   - Dispatch a read-only pro nano-agent final diff review.
   - If it stalls after the required patience/retry path, use a native reviewer.
   - Fix critical or major findings, rerun focused checks, then do a main-agent
     diff review.

10. **Closeout**
    - Move Phase 9.6 from active to completed in `TODO.md`.
    - Add a newest-first `LOGBOOK.md` entry under this session handle.
    - Summarize changed files, checks, screenshots, helper-review status, and
      any residual risks.

## Native Subagent Work

Native explorers are assigned to:

- Map LLM-Dash Voidware usage, docs references, and verification commands.
- Map local Voidware `0.9.8` CSS/spec source and migration notes.
- Map workspace skill drift and likely update targets.

Implementation sidecars, if needed after plan review, will use disjoint write
scopes:

- **Vendor/docs worker:** `web/vendor/voidware/`, README, docs version refs.
- **Frontend compatibility worker:** `web/index.html`, `web/app.js`,
  `web/style.css`.
- **Skill sync worker:** local skill mirrors only, no app files.

The main agent owns integration, verification, screenshot review, and final
diff review.

## Risks

- `web/style.css` may rely on `0.8.4` package internals that changed in `0.9.8`.
- Skill sync touches global/workspace state outside this repo; stale remote
  targets must be verified rather than assumed.
- Screenshot review may reveal layout issues unrelated to the vendor CSS copy;
  fixes should stay scoped to Voidware 0.9.8 compatibility.
- Existing dirty changes in `/home/phxntom/Repos/voidware` are user-owned and
  must not be reverted.
