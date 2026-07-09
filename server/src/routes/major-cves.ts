import { Hono } from "hono";
import type Database from "better-sqlite3";
import { config } from "../env.js";
import { fetchMajorCves } from "../lib/nvd.js";

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface CacheRow {
  payload: string;
  fetched_at: string;
}

function getCache(db: Database.Database): CacheRow | undefined {
  return db.prepare("SELECT payload, fetched_at FROM major_cves_cache WHERE id = 1").get() as CacheRow | undefined;
}

function writeCache(db: Database.Database, payload: unknown, fetchedAt: string) {
  db.prepare(
    "INSERT INTO major_cves_cache (id, payload, fetched_at) VALUES (1, ?, ?) " +
      "ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, fetched_at = excluded.fetched_at",
  ).run(JSON.stringify(payload), fetchedAt);
}

// Top-10 critical CVEs from the last 30 days, per docs/SPEC02.md §6.5. A
// distinct path from /api/cve/:cveId — this is a separate daily-cached
// aggregate, not a per-CVE lookup. Lazy refresh on access, no scheduler.
export function majorCvesRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/major-cves", async (c) => {
    const cached = getCache(db);
    const isFresh = cached ? Date.now() - new Date(cached.fetched_at).getTime() < CACHE_TTL_MS : false;

    if (cached && isFresh) {
      return c.json({ cached: true, fetchedAt: cached.fetched_at, cves: JSON.parse(cached.payload) });
    }

    try {
      const cves = await fetchMajorCves(config.nvdApiKey);
      const now = new Date().toISOString();
      writeCache(db, cves, now);
      return c.json({ cached: false, fetchedAt: now, cves });
    } catch (err) {
      // Stale-cache fallback per the same offline philosophy as CVE lookup (§7).
      if (cached) {
        return c.json({ cached: true, fetchedAt: cached.fetched_at, cves: JSON.parse(cached.payload) });
      }
      throw err;
    }
  });

  return app;
}
