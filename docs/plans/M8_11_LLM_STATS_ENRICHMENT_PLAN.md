# Phase 8.11 — Optional LLM Stats Enrichment

**Goal:** Integrate [LLM Stats](https://llm-stats.com) as an optional data
enrichment source for update runs, keeping every score claim cited and
synthesized by the update agent.

## LLM Stats API Summary

- **Base URL:** `https://api.llm-stats.com/stats`
- **Auth:** Bearer token (`Authorization: Bearer <key>`). Keys prefixed `ze_`.
- **Endpoints used:**
  - `GET /v1/models` — catalog with metadata, pricing, and category scores
  - `GET /v1/updates` — recently added models (1–30 day lookback)
- **Rate limits:** 60–120 req/min per endpoint; `/v1/scores` is 30/min.

## Approach

Follow the existing Exa pattern exactly: env-first → broker → keyring/auth-file
fallback for credential storage; mirrored save/remove/test endpoints; matching
Settings UI and optional wizard step.

The update agent prompt gets enrichment context when LLM Stats is available, but
the agent remains responsible for synthesis. Every dashboard score still needs a
URL citation in the changelog.

## Files to Touch

| File | Change |
|---|---|
| `scripts/config.py` | Add LLM Stats key constants, `load_llmstats_api_key()`, `save_llmstats_api_key()`, `remove_llmstats_api_key()`, and include `llmstats_configured` in `public_provider_state()` |
| `scripts/voidware_auth.py` | Add `LLMSTATS_SECRET_NAME` constant |
| `server.py` | Add `POST/DELETE /api/llmstats`, `GET /api/llmstats/test-connection` endpoints |
| `scripts/run_update.py` | When key is available, fetch `/v1/updates` + `/v1/models` and inject enrichment context into the agent prompt. Log `llmstats_enriched` in notes. |
| `web/app.js` | Replace disabled placeholder with functional LLM Stats settings (Exa-mirrored pattern). Add optional wizard step. Add `llmstats_configured` to provider state. |
| `skill/SKILL.md` | Document optional LLM Stats enrichment context in Research section |

## Implementation Steps

### 1. Backend — Credential Layer (`scripts/voidware_auth.py`, `scripts/config.py`)

Add to `voidware_auth.py`:
```python
LLMSTATS_SECRET_NAME = "llmdash.llmstats.api_key"
```

Add to `config.py`:
```python
LLMSTATS_KEY_NAME = "LLM_STATS_API_KEY"
LLMSTATS_API_KEY_ENVS = ("LLM_STATS_API_KEY", "LLM_DASH_LLMSTATS_API_KEY")
LLMSTATS_BASE_URL = "https://api.llm-stats.com/stats/v1"
```

Functions (mirror Exa exactly):
- `load_llmstats_api_key() -> str`
- `save_llmstats_api_key(api_key: str) -> None`
- `remove_llmstats_api_key() -> None`

Update `public_provider_state()`:
- Add `"llmstats_configured": bool(load_llmstats_api_key())`
- Add `"llmstats"` to `auth` dict using `_credential_source()`

### 2. Backend — Server Endpoints (`server.py`)

```
POST   /api/llmstats              — save LLM Stats API key
DELETE /api/llmstats              — remove LLM Stats API key
GET    /api/llmstats/test-connection — bearer-auth test against /v1/models
```

Payload model: `LLMStatsPayload(api_key: str)`.

Test connection: `GET https://api.llm-stats.com/stats/v1/models?limit=1` with
`Authorization: Bearer <key>`. Return `{ok, status_code, models_count}`.

### 3. Backend — Update Enrichment (`scripts/run_update.py`)

In `generate_diff()`, after loading `exa_key`:
1. Load `llmstats_key = load_llmstats_api_key()`
2. If key exists, call `fetch_llmstats_enrichment(llmstats_key, since_date)`
3. Append enrichment JSON to the agent prompt as optional context
4. Record `llmstats_enriched=true` in `notes`

`fetch_llmstats_enrichment()`:
- `GET /v1/updates?days=<lookback>` with bearer auth
- `GET /v1/models?limit=50` for catalog snapshot
- Return combined JSON block; timeout 15s per request
- On failure: log warning, continue without enrichment

### 4. Frontend — Settings Research Page (`web/app.js`)

Replace `renderSettingsLLMStatsSection()` placeholder with functional section:

State additions to `state.settings`:
- `llmstatsSaving`, `llmstatsRemoving`, `llmstatsConfirmRemove`
- `draftLLMStatsKey`, `llmstatsStatus`, `llmstatsStatusTone`
- `showLLMStatsKey`, `llmstatsTesting`, `llmstatsTestResult`

Functions (mirror Exa pattern):
- `settingsSaveLLMStats()` — POST to `/api/llmstats`
- `settingsRemoveLLMStats()` — DELETE to `/api/llmstats`
- `settingsTestLLMStats()` — GET `/api/llmstats/test-connection`

UI: password input with show/hide toggle, Save/Remove/Test Connection buttons,
status chip, broker/credential status display. Match Exa section styling exactly.

### 5. Frontend — Wizard Step (`web/app.js`)

Add optional LLM Stats step between Exa (step 3) and Schedule (step 4):

- Add `"LLM Stats"` to `WIZARD_STEPS` array (becomes step 4)
- Add subtitle to `WIZARD_SUBTITLES`
- Schedule becomes step 5, Summary becomes step 6
- Wizard state: `llmstatsKey`, `llmstatsSkipped`, `llmstatsAlreadyConfigured`
- `renderWizardLLMStatsStep()` — mirrors `renderWizardExaStep()`
- `saveWizardLLMStats()` — mirrors `saveWizardExa()`
- Update step navigation (`wizardNext`, `wizardBack`, `wizardSkip`, `wizardCanNext`)
- Add LLM Stats row to summary step
- Skip logic: allow skipping (optional enrichment, not required)

### 6. SKILL.md Update

Add to Research section (§3):
```
If LLM Stats enrichment is available (key configured), use the provided
catalog/updates data as supplementary context. Prefer primary sources for
final scoring, but use LLM Stats for discovery, cross-referencing, and
metadata (pricing, parameter counts, release dates).
```

### 7. Provider State Shape Update

`public_provider_state()` returns:
```json
{
  "llmstats_configured": true,
  "auth": {
    "llmstats": { "configured": true, "source": "voidware-broker", ... }
  }
}
```

Frontend `state.provider` gains `llmstats_configured: false`.

## Verification

- `node --check web/app.js`
- `python3 -m compileall server.py scripts`
- `git diff --check`
- No `ze_` key values leak through `public_provider_state()`
- Test connection endpoint returns correct shape
- Wizard step count is correct (7 steps: Provider, Models, Test, Exa, LLM Stats, Schedule, Summary)
- Settings Research page renders both Exa and LLM Stats sections
- `run_update.py` gracefully handles missing/invalid LLM Stats key

### 8. Score-Range Schema Hardening (`scripts/schema.sql`, migration)

Add `CHECK` constraints to `model_scores` to enforce 0–10 range:

```sql
intelligence REAL CHECK (intelligence IS NULL OR (intelligence BETWEEN 0 AND 10)),
coding       REAL CHECK (coding IS NULL OR (coding BETWEEN 0 AND 10)),
agents       REAL CHECK (agents IS NULL OR (agents BETWEEN 0 AND 10)),
speed        REAL CHECK (speed IS NULL OR (speed BETWEEN 0 AND 10)),
cost         REAL CHECK (cost IS NULL OR (cost BETWEEN 0 AND 10)),
```

Implementation:
1. Update `scripts/schema.sql` DDL with CHECK constraints
2. Add `scripts/migrate_score_checks.py` that:
   - Validates existing rows (clamp or reject out-of-range)
   - Recreates `model_scores` with constraints (SQLite ALTER TABLE
     can't add CHECKs, so: create temp, copy, drop, rename)
   - Recreates indexes
   - Bumps `meta.schema_version` to `2`
3. Update fresh DB schema version to `2`; server startup and direct
   `scripts/run_update.py` runs apply the migration to existing DBs when
   `schema_version < 2`
4. Verify: insert a score of 11 and confirm it's rejected

## Risks

- LLM Stats API availability — all calls are optional with graceful fallback
- Wizard step index shift — must update all step references carefully
- Rate limits (60 req/min for `/v1/models`) — single call per update run, not a concern
- Schema migration — SQLite table rebuild is safe in a transaction but needs careful index recreation
