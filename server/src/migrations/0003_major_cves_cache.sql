-- Single-row daily cache for the "Major CVEs" feed — top-10 critical CVEs
-- published in the last 30 days, refreshed lazily on access rather than by
-- a background scheduler.
CREATE TABLE major_cves_cache (
  id         INTEGER PRIMARY KEY CHECK (id = 1),
  payload    TEXT NOT NULL,
  fetched_at TEXT NOT NULL
);
