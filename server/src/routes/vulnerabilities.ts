import { Hono } from "hono";
import type Database from "better-sqlite3";
import { HttpError } from "../lib/errors.js";
import { extractVectorOptions } from "../lib/nvd.js";
import { computeScore, parseBaseVector } from "../scoring/index.js";

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

function serializeVulnerability(row: VulnerabilityRow) {
  return {
    id: row.id,
    label: row.label,
    source: row.source,
    cveId: row.cve_id,
    vector: row.vector,
    cvssVersion: row.cvss_version,
    baseScore: row.base_score,
    fetchedAt: row.fetched_at,
    createdAt: row.created_at,
  };
}

function getVulnerabilityOr404(db: Database.Database, id: number): VulnerabilityRow {
  const row = db.prepare("SELECT * FROM vulnerabilities WHERE id = ?").get(id) as VulnerabilityRow | undefined;
  if (!row) throw new HttpError(404, `No saved vulnerability with id ${id}`);
  return row;
}

// Saved-vulnerability CRUD per SPEC.md §8. A save happens from a scored
// result (§6.4) — the vector is always re-parsed/re-scored server-side
// rather than trusting a client-supplied score.
export function vulnerabilityRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/vulnerabilities", (c) => {
    const rows = db.prepare("SELECT * FROM vulnerabilities ORDER BY created_at DESC").all() as VulnerabilityRow[];
    return c.json(rows.map(serializeVulnerability));
  });

  app.post("/vulnerabilities", async (c) => {
    const body = await c.req
      .json<{ vector?: string; label?: string; cveId?: string; nvdJson?: unknown }>()
      .catch(() => ({}) as { vector?: string; label?: string; cveId?: string; nvdJson?: unknown });

    if (!body.vector || !body.vector.trim()) {
      throw new HttpError(400, "vector is required");
    }

    const parsed = parseBaseVector(body.vector);
    const { score, vector } = computeScore(parsed.instance);
    const label = body.label?.trim() || body.cveId || vector;
    const source = body.cveId ? "nvd" : "vector";
    const now = new Date().toISOString();
    const nvdJsonText = body.nvdJson ? JSON.stringify(body.nvdJson) : null;

    const info = db
      .prepare(
        "INSERT INTO vulnerabilities (label, source, cve_id, vector, cvss_version, base_score, nvd_json, fetched_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .run(label, source, body.cveId ?? null, vector, parsed.version, score, nvdJsonText, nvdJsonText ? now : null, now);

    const row = getVulnerabilityOr404(db, Number(info.lastInsertRowid));
    return c.json(serializeVulnerability(row), 201);
  });

  app.get("/vulnerabilities/:id", (c) => {
    const id = Number(c.req.param("id"));
    const row = getVulnerabilityOr404(db, id);
    return c.json({
      ...serializeVulnerability(row),
      vectors: row.nvd_json ? extractVectorOptions(JSON.parse(row.nvd_json)) : [],
    });
  });

  app.delete("/vulnerabilities/:id", (c) => {
    const id = Number(c.req.param("id"));
    getVulnerabilityOr404(db, id);
    db.prepare("DELETE FROM vulnerabilities WHERE id = ?").run(id);
    return c.body(null, 204);
  });

  return app;
}
