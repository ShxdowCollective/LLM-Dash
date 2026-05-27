# Phase 9.7 — Voidware 0.9.10 App-Owned Approval Integration

**Status:** Reviewed plan — 2026-05-26
**Agent:** GPT-5 Codex (lumenweld)
**Source:** Local `/home/phxntom/Repos/voidware`
**Target Voidware:** `@shxdowcollective/voidware` and `@shxdowcollective/voidware-cli` `0.9.10`

## Goal

Unblock the LLM-Dash first-run wizard and Settings provider flow for saved
Voidware credentials by upgrading from vendored Voidware `0.9.8` to `0.9.10`
and replacing the current "manager or foreground TTY broker required" path with
Voidware's app-owned broker approval contract.

Done means a browser + FastAPI LLM-Dash session can:

- discover reusable Voidware provider credentials without exposing secrets,
- request a `120d` `auth:secret:read:<credential>` grant from inside the
  LLM-Dash UI,
- show a real approval modal owned by LLM-Dash when a password is required,
- store opaque `vwgr_...` grant tokens only through Voidware's official OS
  keyring client cache,
- retry/renew cleanly on `grant_expired`, `grant_invalidated`,
  `renewal_needed`, and `durable_secret_unavailable`,
- keep env and legacy keyring fallback behavior only as migration/backstop
  paths, not as the primary saved-credential story.

## Validation

Local Voidware is suitable for this work.

- `/home/phxntom/Repos/voidware/package.json`: version `0.9.10`.
- `/home/phxntom/Repos/voidware/packages/cli/package.json`: version `0.9.10`.
- Git state: clean `main` at `a5c3aae` (`docs: record v0.9.10 site deploy`).
- Tags present: `v0.9.10`, `v0.9.9`, `v0.9.8`.
- `python3 ~/.codex/skills/voidware-spec/scripts/check_voidware_spec.py /home/phxntom/Repos/voidware` auto-synced the installed `voidware-spec` skill from `0.9.9` to `0.9.10`.
- `npm run verify:fast` passed in the Voidware repo:
  typecheck, UI contract check, core tests, CLI tests, core build, CLI build,
  Electron build.
- `npm run smoke:broker:ipc` passed in the Voidware repo with memory
  persistence on a temp IPC endpoint.

The features LLM-Dash needed are present:

- `v0.9.9` added `createAppOwnedAuthBroker()`, `ApprovalSurface`, app-owned
  broker status (`approvalSurface: "app"`, `canApprove: true`), and a
  non-Electron durable grant example for local-server apps.
- `v0.9.10` added Dev credential metadata, repo-bound read-only `dev-agent`
  grants, and `voidware auth dev-token create|validate|refresh|read|revoke`.
  This is not required to unblock the setup wizard, but it is relevant for
  future agent-run update credentials.
- `requestDurableVoidwareAuthGrant()` and `withStoredVoidwareAuthGrant()` use
  the sanctioned `voidware-client-grants` keyring cache instead of app-owned
  grant-token files or custom config storage.

## Current LLM-Dash State

- Frontend is static vanilla HTML/CSS/JS with no npm, no bundler, and committed
  vendor assets.
- `web/vendor/voidware/` is vendored from Voidware `0.9.8`.
- `scripts/voidware_auth.py` shells out to the `voidware` CLI and currently
  keeps its own grant-token cache under keyring service
  `llm-dash-voidware-grants`.
- `read_secret_with_grant()` now refuses to proceed without either a cached
  grant or an approval-capable broker. That made the wizard correct but still
  blocked because background brokers report `canApprove: false`.
- `TODO.md` still records the wizard walkthrough as blocked on upstream
  Voidware Milestone 8. Voidware `0.9.9` closes that upstream gap.

## Architecture Decision

Keep LLM-Dash no-build, but add a small Node broker bridge that imports the
already-built Voidware CLI service module. Python remains the app server and
owns the public HTTP API; the Node bridge owns the in-process
`createAppOwnedAuthBroker()` instance because that API is exported by
`@shxdowcollective/voidware-cli`.

The bridge should be optional at import time and resolved in this order:

1. `VOIDWARE_CLI_SERVICE_MODULE` pointing at a built
   `@shxdowcollective/voidware-cli` service entry.
2. Local dev source:
   `Path.home()/Repos/voidware/packages/cli/dist/service/index.js`.
3. A future installed package path if LLM-Dash later adds a pinned local
   dependency or packaged helper.

Do not add an app-wide npm install step for this phase. If the service module
cannot be resolved, LLM-Dash should keep the current deterministic error path
and show a clear "Voidware 0.9.10 CLI bridge unavailable" message.

Runtime prerequisite: Node `>=20` and a built Voidware CLI service module. For
the local source path, run `npm run build:cli --workspace
@shxdowcollective/voidware-cli` or `npm run verify:fast` in the Voidware repo
before testing LLM-Dash. The bridge should detect stale/missing `dist/` output
and return an actionable error instead of failing with a raw import stack.

## Files To Touch

- `scripts/voidware_auth.py`
- `scripts/voidware_app_broker.mjs` (new)
- `server.py`
- `web/app.js`
- `web/style.css`
- `web/vendor/voidware/*.css`
- `web/vendor/voidware/VERSION.md`
- `tests/test_voidware_auth.py`
- optional focused tests under `tests/` for the broker bridge
- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DEVELOPMENT.md`
- `TODO.md`
- `LOGBOOK.md`

## Implementation Steps

### 1. Vendor Voidware 0.9.10 CSS

- Copy the release CSS chain from `/home/phxntom/Repos/voidware/src/css/` into
  `web/vendor/voidware/`, excluding `theme-template.css`.
- Update `web/vendor/voidware/VERSION.md` with version `0.9.10`, source commit
  `a5c3aae`, copy date, license, and file list.
- Update visible docs references from `0.9.8` to `0.9.10` in README,
  architecture, and development docs.
- Review app overrides for the 0.9.10 CSS changes:
  - Inter replaces Roboto/SUSE as the default body/display stack.
  - active status/button rings moved to shared outline variables and no longer
    use local duplicated status-chip pseudo-elements.
  - `vw-status-chip`, `vw-summary-chip`, and `vw-select` gained sizing fixes.
  - `vw-tooltip-hint` and `vw-tooltip-info` are now distinct public classes.
  - `vw-project-nav` was added for public pages but should not affect the app
    shell unless selectors collide.
- Remove or narrow any LLM-Dash-owned `.vw-*` fallback selectors that now fight
  package CSS. Keep app-specific selectors under app namespaces where possible.

### 2. Add The App-Owned Broker Bridge

- Add `scripts/voidware_app_broker.mjs` as a line-delimited JSON worker.
- The worker imports:
  - `createAppOwnedAuthBroker`
  - `detectLocalAuthBroker`
  - `createLocalAuthBrokerClient`
  - `requestDurableVoidwareAuthGrant`
  - `BrokerRequestError`
- Use `voidware/examples/auth-broker/programmatic-approval-surface.mjs` as the
  canonical pattern and extend it with a JSON worker protocol instead of
  re-deriving broker behavior.
- The worker starts an app-owned broker only when no broker is already running.
  If an existing broker reports `approvalSurface: "electron"` or `"tty"` and
  `canApprove: true`, the worker may use that existing approval surface as a
  fallback and must report that approval is not owned by LLM-Dash. If an
  existing broker reports `canApprove: false`, return a deterministic
  `broker_conflict` / `approval_required` error and do not stop someone else's
  broker.
- Every bridge call must use one shared Voidware `ServiceContext` that matches
  Python's current CLI flags:
  - `appName: "llm-dash"`
  - `repoPath: ROOT`
  - `shxdowDir: LLM_DASH_SHXDOW_ROOT` when that env var is set
  - `authOverridePath` only for explicit test overrides
  - `skipKeyring` only for deterministic temp-store tests
  This context must be used for broker status, socket resolution, provider
  discovery, grant requests, and secret operations. A mismatch can put the
  app-owned broker on a different IPC socket or auth store than the Python
  wrapper expects.
- The worker exposes commands over stdin/stdout:
  - `status`
  - `start`
  - `stop`
  - `pendingApproval`
  - `approve`
  - `deny`
  - `discoverProviders`
  - `readSecretGrant`
  - `writeSecret`
  - `deleteSecret`
- `ApprovalSurface.requestApproval()` stores a pending approval object in
  memory, redacts sensitive fields, and waits for `approve` or `deny`.
- The worker must keep reading stdin commands while an approval is pending.
  `readSecretGrant` must not deadlock the protocol. Use this split:
  - start the broker request in worker-managed async state,
  - when `requestApproval()` fires, expose `{ ok: false,
    code: "approval_pending", requestId, approval }` through
    `pendingApproval`,
  - `approve` or `deny` resolves the pending approval promise,
  - a separate `grantResult` or request completion response returns the final
    metadata-only outcome,
  - timeouts call the approval surface `cancelPending` hook and return a
    recoverable `approval_timeout`.
- Approval payloads must include app name, repo path, operation, target, scopes,
  TTL, whether secret output is allowed, and whether password or new secret
  input is required.
- Passwords, provider secrets, and grant tokens must never be written to URLs,
  logs, localStorage, config files, or docs.

### 3. Replace The Custom Grant Cache

- Stop using `CLIENT_GRANT_SERVICE_NAME = "llm-dash-voidware-grants"` for new
  grants.
- Route saved-credential reads through the Node bridge using
  `requestDurableVoidwareAuthGrant()` so `vwgr_...` tokens land in Voidware's
  `voidware-client-grants` keyring namespace.
- Keep a cleanup-only compatibility path for old `llm-dash-voidware-grants`
  entries: ignore them for new reads, and optionally clear them when a fresh
  official grant succeeds.
- Preserve the non-secret grant renewal metadata currently surfaced in Settings.

### 4. Update Python Broker Control

- Add a tiny controller in `scripts/voidware_auth.py` that owns a single bridge
  process per FastAPI server process.
- Add request/response IDs, timeouts, stderr redaction, crash recovery, and
  process cleanup.
- Start the bridge lazily on first bridge-backed broker status or grant
  request, then reuse it. `GET /api/voidware/broker` may start the bridge only
  to report accurate app-owned availability; it must not request grants or
  secrets.
- Add FastAPI shutdown cleanup so the bridge subprocess stops and the worker
  calls `broker.stop()` before process exit. Do not leave orphaned IPC sockets
  after server reloads.
- Keep all redaction paths for `vwgr_...`, provider API keys, Exa keys, and LLM
  Stats keys.
- Preserve CLI fallback for metadata-only provider discovery when the bridge is
  unavailable, but saved secret reads should prefer the bridge because only the
  bridge can own LLM-Dash approval.
- After bridge integration, `broker_status()` should prefer bridge status when
  available and report `approval_surface: "app"` / `can_approve: true` for the
  app-owned path. It must not surface `broker:start-background` as though a
  hidden detached broker can approve first-time saved-key grants.

### 5. Add Backend APIs

- Extend `GET /api/voidware/broker` to include:
  - bridge availability,
  - service module path or redacted reason unavailable,
  - `approval_surface`,
  - `can_approve`,
  - grant TTL,
  - durable grant and durable secret support.
- Keep `POST /api/voidware/broker/grant`, but route it through the bridge and
  allow it to return `approval_pending` with a request ID when the bridge needs
  browser input.
- Add:
  - `GET /api/voidware/broker/approval`
  - `POST /api/voidware/broker/approval`
  - `POST /api/voidware/broker/approval/deny`
- Add a metadata-only completion endpoint or response shape so the UI can tell
  the difference between `approval_pending`, `approval_denied`,
  `approval_timeout`, `broker_conflict`, and grant success without exposing the
  secret.
- Do not return secrets or grant tokens from these approval endpoints.
- Prefer returning `ok: true` plus grant metadata when approval completes.
  Avoid using `ok: bool(secret)` as the public success signal.
- Continue returning only redacted provider credential metadata from
  `/api/provider/credentials`.

### 6. Build The Browser Approval UX

- In the first-run wizard and Settings > Provider, replace the current
  "Approve in manager or broker terminal" copy with an LLM-Dash-owned approval
  modal.
- The modal should show:
  - app: `llm-dash`,
  - repo path,
  - credential name,
  - requested scope,
  - TTL (`120d`),
  - secret-output warning,
  - password field only when `passwordRequired` is true.
- Keep buttons clearly hierarchical:
  - primary `Approve Access`,
  - secondary `Deny`,
  - no extra filled CTAs in the same cluster.
- Add `aria-live="polite"` status for pending approval, success, denial, and
  retry states.
- Make denial and timeout recoverable without losing the wizard form state.
- If a detached/background broker already owns the endpoint with
  `canApprove: false`, show a distinct recovery state:
  - explain that a background Voidware broker can reuse existing grants but
    cannot approve new saved-key access,
  - offer a copyable `voidware auth broker stop` / manager restart hint,
  - do not automatically stop the external broker.
- If an Electron manager or foreground TTY broker already owns approval, make
  the UI say where approval will appear instead of showing the LLM-Dash
  password modal.
- Use Voidware `vw-modal` / `vw-modal-backdrop` patterns already used by the
  app's help modal, not legacy modal card classes.
- Keep the modal out of screenshots unless using fake/temp credentials.

### 7. Extend Writes After Reads Are Stable

The first implementation pass should unblock saved provider reads. Until
writes/deletes are migrated, manual provider, Exa, and LLM Stats key saves may
still hit the current CLI write path and remain approval-blocked without an
external approval surface. Make that limitation explicit in TODO and UI copy.
After reads are stable, wire app-owned approval for writes/deletes:

- provider API key save/remove,
- Exa key save/remove,
- LLM Stats key save/remove.

Secret values may travel from browser to FastAPI because they already do in the
manual-key flow, but they must still be excluded from logs, config JSON, API
responses, browser state, screenshots, and docs.

### 8. Tests

Add or update tests for:

- service module resolution and bridge-unavailable errors,
- Node version/build prerequisite errors,
- broker bridge JSON protocol redaction,
- pending approval lifecycle: pending -> approve -> grant success,
- denial and timeout paths,
- existing broker with `canApprove: false` returning `broker_conflict`,
- existing Electron/TTY approval broker fallback copy,
- shared `ServiceContext` and `LLM_DASH_SHXDOW_ROOT` socket/auth-store
  isolation,
- official grant cache replacing the old LLM-Dash cache,
- no `grantToken` or provider secret in API responses,
- no approval password in bridge stdout, stderr, server logs, or response JSON,
- provider discovery keeps filtering and redaction,
- v3 encrypted auth files still use broker reads and never plaintext fallback.
- Replace or retire `test_broker_grant_cache_preserves_renewal_state`, because
  new grants should be cached by Voidware's `voidware-client-grants` helper
  rather than LLM-Dash's old custom keyring namespace.

Keep current focused checks:

```bash
python3 -m unittest tests.test_voidware_auth
python3 -m unittest discover -v
python3 -m py_compile server.py scripts/*.py tests/*.py
node --check scripts/voidware_app_broker.mjs
node --check web/app.js
git diff --check
python3 ~/.codex/skills/voidware-spec/scripts/check_voidware_spec.py /home/phxntom/Repos/voidware
```

Add an integration smoke using a temp `LLM_DASH_SHXDOW_ROOT` and fake
credentials before any real saved-key walkthrough.

### 9. Browser Verification

Use one headed `agent-browser` session and verify:

- first-run wizard saved-key path at `1280x800`, `768x600`, and `1280x640`,
- approval modal at desktop and narrow widths with fake/temp credentials,
- Settings > Provider saved credential selection and grant renewal display,
- denial, timeout, broker unavailable, and existing non-approval broker states,
- no page errors, no console errors, no body horizontal overflow,
- no secret or grant token in visible UI, network JSON, logs, or screenshots.

### 10. Documentation And Closeout

- Move the TODO blocker from "upstream blocked" to "implementation planned".
- Document that Voidware `0.9.10` is the required local source for saved-key
  approval in README, architecture, and development docs.
- Update the README badge from `v0.9.8` to `v0.9.10`.
- Replace `docs/ARCHITECTURE.md` references to keyring service
  `llm-dash-voidware-grants` with Voidware's `voidware-client-grants` cache
  plus the Node bridge runtime.
- Add a logbook entry with:
  - Voidware validation commands,
  - broker feature verdict,
  - plan path,
  - nano-agent review status,
  - remaining implementation risks.

## Risks

- The app-owned broker API is Node-only today; the bridge must be small,
  observable, and easy to kill/restart from Python.
- An existing detached broker with `canApprove: false` can still block in-app
  approval because it owns the endpoint. LLM-Dash should not silently stop it.
- The current app has many local `.vw-*` selectors. A CSS update could create
  subtle visual drift even if static checks pass.
- Real keyring-backed durable grant rehydration needs human approval and a
  working OS keyring; use temp/memory smoke tests first, then one real-machine
  walkthrough.
- `requestDurableVoidwareAuthGrant()` can return both `grantToken` metadata and
  operation data for secret reads. The bridge must parse any nested secret only
  internally, cache via Voidware, and return metadata-only results to FastAPI.
- Dev-agent tokens are powerful enough for update agents but not a substitute
  for user-facing app approvals. Keep them out of the wizard implementation
  unless a later agent-access task asks for them.

## Out Of Scope

- Dashboard benchmark data updates.
- Rewriting old `changelogs/*.md`.
- Adding npm as a required LLM-Dash runtime install step.
- Shipping agent Dev-token UX in the first wizard unblock pass.
- Broad dashboard redesign beyond CSS compatibility and approval UI polish.

## Review Notes

- Pro nano-agent plan review completed after the first draft.
- Findings folded into this revision:
  - async approval protocol must not block stdin command handling,
  - bridge calls must share Python's `ServiceContext`,
  - detached non-approval broker conflicts need explicit recovery UX,
  - bridge status must replace stale CLI `ensure`/background-broker hints,
  - Node/build prerequisites, shutdown cleanup, test coverage, docs drift, and
    write/delete limitations are now explicit.
