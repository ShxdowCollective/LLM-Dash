-- LLM-Dash schema. Source of truth for data/dash.sqlite.
-- Architecture and migration contract: docs/ARCHITECTURE.md#data-model.

PRAGMA foreign_keys = ON;

CREATE TABLE models (
    id              INTEGER PRIMARY KEY,
    name            TEXT NOT NULL UNIQUE,
    vendor          TEXT NOT NULL,
    color           TEXT NOT NULL,
    released        TEXT,
    params          TEXT,
    pricing         TEXT,
    notes           TEXT,
    card_url        TEXT,
    input_capabilities TEXT NOT NULL DEFAULT '["text"]',
    deprecated_on   TEXT,
    first_seen      TEXT NOT NULL,
    last_seen       TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'active'
        CHECK (status IN ('active','superseded','deprecated'))
);
CREATE INDEX idx_models_vendor ON models(vendor);

CREATE TABLE model_scores (
    id              INTEGER PRIMARY KEY,
    model_id        INTEGER NOT NULL REFERENCES models(id) ON DELETE CASCADE,
    as_of           TEXT NOT NULL,
    intelligence    REAL CHECK (intelligence IS NULL OR (intelligence BETWEEN 0 AND 10)),
    coding          REAL CHECK (coding IS NULL OR (coding BETWEEN 0 AND 10)),
    agents          REAL CHECK (agents IS NULL OR (agents BETWEEN 0 AND 10)),
    speed           REAL CHECK (speed IS NULL OR (speed BETWEEN 0 AND 10)),
    cost            REAL CHECK (cost IS NULL OR (cost BETWEEN 0 AND 10)),
    source_notes    TEXT,
    UNIQUE (model_id, as_of)
);
CREATE INDEX idx_scores_model_date ON model_scores(model_id, as_of DESC);

CREATE TABLE changelogs (
    id              INTEGER PRIMARY KEY,
    date            TEXT NOT NULL UNIQUE,
    title           TEXT NOT NULL,
    path            TEXT NOT NULL,
    summary         TEXT,
    new_models_json TEXT,
    changed_json    TEXT
);

CREATE TABLE run_metrics (
    id              INTEGER PRIMARY KEY,
    changelog_date  TEXT NOT NULL UNIQUE REFERENCES changelogs(date),
    started_at      TEXT NOT NULL,
    completed_at    TEXT NOT NULL,
    duration_sec    REAL NOT NULL,
    agent_name      TEXT,
    agent_runtime   TEXT,
    tokens_input    INTEGER,
    tokens_output   INTEGER,
    tokens_cached   INTEGER,
    cost_usd        REAL,
    exa_searches    INTEGER DEFAULT 0,
    exa_fetches     INTEGER DEFAULT 0,
    word_count      INTEGER,
    notes           TEXT
);

CREATE TABLE meta (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL
);

-- Latest score per model. Tiebreaker on id to make same-day upserts deterministic.
CREATE VIEW v_models_latest AS
SELECT m.*,
       s.as_of AS scores_as_of,
       s.intelligence, s.coding, s.agents, s.speed, s.cost
FROM models m
LEFT JOIN model_scores s ON s.id = (
    SELECT id FROM model_scores
    WHERE model_id = m.id
    ORDER BY as_of DESC, id DESC
    LIMIT 1
);
