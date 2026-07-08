import { Hono } from "hono";
import type Database from "better-sqlite3";
import { config } from "../env.js";
import { HttpError } from "../lib/errors.js";
import { CVE_ID_PATTERN, extractVectorOptions, fetchNvdCve, pickPrimaryVector } from "../lib/nvd.js";

interface VulnerabilityRow {
  id: number;
  label: string;
  source: "vector" | "nvd";
  cve_id: string | null;
  vector: string;
  cvss_version: string;
  base_score: number;
  nvd_json: string | null;
  fetched_at: string | null;
  created_at: string;
}

function serializeCveResponse(cveId: string, row: VulnerabilityRow, cached: boolean) {
  const vectors = row.nvd_json ? extractVectorOptions(JSON.parse(row.nvd_json)) : [];
  return {
    cveId,
    cached,
    fetchedAt: row.fetched_at,
    primaryVector: row.vector,
    primaryVersion: row.cvss_version,
    vectors,
  };
}

// NVD lookup per SPEC.md §7. Cache-first: a cached CVE is served from
// `vulnerabilities` without a network call unless ?refresh=1 is passed.
export function cveRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/cve/:cveId", async (c) => {
    const cveId = c.req.param("cveId").toUpperCase();
    if (!CVE_ID_PATTERN.test(cveId)) {
      throw new HttpError(400, `"${cveId}" doesn't look like a CVE ID — expected the form CVE-YYYY-NNNNN.`);
    }

    const refresh = c.req.query("refresh") === "1";
    const cached = db
      .prepare("SELECT * FROM vulnerabilities WHERE cve_id = ? AND source = 'nvd' ORDER BY fetched_at DESC LIMIT 1")
      .get(cveId) as VulnerabilityRow | undefined;

    if (cached && !refresh) {
      return c.json(serializeCveResponse(cveId, cached, true));
    }

    let nvdJson: unknown;
    try {
      nvdJson = await fetchNvdCve(cveId, config.nvdApiKey);
    } catch (err) {
      // Offline/failure fallback per §7: if we have a stale cache, prefer
      // serving that over a hard failure.
      if (cached) return c.json(serializeCveResponse(cveId, cached, true));
      throw err;
    }

    const options = extractVectorOptions(nvdJson);
    const primary = pickPrimaryVector(options);
    if (!primary) {
      throw new HttpError(422, `${cveId} has no published CVSS v3.x/v4.0 data yet.`);
    }

    const now = new Date().toISOString();
    const nvdJsonText = JSON.stringify(nvdJson);

    if (cached) {
      db.prepare(
        "UPDATE vulnerabilities SET vector = ?, cvss_version = ?, base_score = ?, nvd_json = ?, fetched_at = ? WHERE id = ?",
      ).run(primary.vector, primary.version, primary.baseScore, nvdJsonText, now, cached.id);
    } else {
      db.prepare(
        "INSERT INTO vulnerabilities (label, source, cve_id, vector, cvss_version, base_score, nvd_json, fetched_at, created_at) VALUES (?, 'nvd', ?, ?, ?, ?, ?, ?, ?)",
      ).run(cveId, cveId, primary.vector, primary.version, primary.baseScore, nvdJsonText, now, now);
    }

    const row: VulnerabilityRow = {
      id: cached?.id ?? 0,
      label: cached?.label ?? cveId,
      source: "nvd",
      cve_id: cveId,
      vector: primary.vector,
      cvss_version: primary.version,
      base_score: primary.baseScore,
      nvd_json: nvdJsonText,
      fetched_at: now,
      created_at: cached?.created_at ?? now,
    };

    return c.json(serializeCveResponse(cveId, row, false));
  });

  return app;
}
