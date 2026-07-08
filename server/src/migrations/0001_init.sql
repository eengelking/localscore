-- Initial schema. See SPEC.md §4 (data model) and §5.1 (catalog shape).

CREATE TABLE environments (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  description     TEXT NOT NULL DEFAULT '',
  catalog_version TEXT NOT NULL,
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

-- Raw interview answers: source of truth. Metrics are re-derived from these,
-- so the catalog can evolve and environments can be re-opened and edited.
CREATE TABLE environment_answers (
  environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  question_id     TEXT NOT NULL,
  option_id       TEXT NOT NULL,
  PRIMARY KEY (environment_id, question_id)
);

-- Derived metric effects, materialized on save for fast scoring.
CREATE TABLE environment_metrics (
  environment_id INTEGER NOT NULL REFERENCES environments(id) ON DELETE CASCADE,
  cvss_version    TEXT NOT NULL CHECK (cvss_version IN ('4.0', '3.1')),
  metric          TEXT NOT NULL,
  value           TEXT NOT NULL,
  effect          TEXT NOT NULL CHECK (effect IN ('override', 'cap')),
  PRIMARY KEY (environment_id, cvss_version, metric)
);

-- Saved vulnerabilities and the NVD cache.
CREATE TABLE vulnerabilities (
  id           INTEGER PRIMARY KEY,
  label        TEXT NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('vector', 'nvd')),
  cve_id       TEXT,
  vector       TEXT NOT NULL,
  cvss_version TEXT NOT NULL,
  base_score   REAL NOT NULL,
  nvd_json     TEXT,
  fetched_at   TEXT,
  created_at   TEXT NOT NULL
);
