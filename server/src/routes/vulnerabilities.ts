import { Hono } from "hono";
import type Database from "better-sqlite3";
import { HttpError } from "../lib/errors.js";
import { extractCveDetails, extractVectorOptions } from "../lib/nvd.js";
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
  saved: number;
  description: string;
}

function serializeVulnerability(row: VulnerabilityRow) {
  return {
    id: row.id,
    label: row.label,
    description: row.description,
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

// Saved-vulnerability CRUD. A save happens from a scored result — the
// vector is always re-parsed/re-scored server-side rather than trusting a
// client-supplied score.
//
// The `vulnerabilities` table doubles as the NVD lookup cache (saved = 0
// rows written by cve.ts) and the saved list (saved = 1). The list route
// only returns saved = 1 rows, and saving upserts onto any existing row
// for the same identity (cve_id, or vector for pasted-vector saves)
// instead of inserting a duplicate.
export function vulnerabilityRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/vulnerabilities", (c) => {
    const q = c.req.query("q")?.trim();
    if (!q) {
      const rows = db
        .prepare("SELECT * FROM vulnerabilities WHERE saved = 1 ORDER BY created_at DESC")
        .all() as VulnerabilityRow[];
      return c.json(rows.map(serializeVulnerability));
    }

    // Full-content search over label, CVE ID, vector, description, and the
    // cached raw NVD JSON text (the latter is what makes
    // the NVD description, affected products/CPEs, and reference URLs/tags
    // searchable with no new columns or extraction pass). SQLite's LIKE is
    // only ASCII-case-insensitive by default; LOWER() on both sides is
    // sufficient for this personal-scale list, no FTS5 needed. `%`/`_` in the
    // query are escaped so they match literally rather than as wildcards.
    const escaped = q.replace(/[%_\\]/g, (ch) => `\\${ch}`);
    const like = `%${escaped.toLowerCase()}%`;
    const rows = db
      .prepare(
        `SELECT * FROM vulnerabilities
         WHERE saved = 1
           AND (
             LOWER(label) LIKE ? ESCAPE '\\'
             OR LOWER(COALESCE(cve_id, '')) LIKE ? ESCAPE '\\'
             OR LOWER(vector) LIKE ? ESCAPE '\\'
             OR LOWER(description) LIKE ? ESCAPE '\\'
             OR LOWER(COALESCE(nvd_json, '')) LIKE ? ESCAPE '\\'
           )
         ORDER BY created_at DESC`,
      )
      .all(like, like, like, like, like) as VulnerabilityRow[];
    return c.json(rows.map(serializeVulnerability));
  });

  app.post("/vulnerabilities", async (c) => {
    const body = await c.req
      .json<{ vector?: string; label?: string; description?: string; cveId?: string; nvdJson?: unknown }>()
      .catch(
        () => ({}) as { vector?: string; label?: string; description?: string; cveId?: string; nvdJson?: unknown },
      );

    if (!body.vector || !body.vector.trim()) {
      throw new HttpError(400, "vector is required");
    }

    const parsed = parseBaseVector(body.vector);
    const { score, vector } = computeScore(parsed.instance);
    const cveId = body.cveId?.trim().toUpperCase() || null;
    const label = body.label?.trim() || cveId || vector;
    const source = cveId ? "nvd" : "vector";
    const now = new Date().toISOString();
    const nvdJsonText = body.nvdJson ? JSON.stringify(body.nvdJson) : null;
    // A non-empty client-supplied description wins over whatever the
    // matched row had (and over the NVD prefill below, since that only
    // fires when the description is still empty afterward). Empty or
    // absent changes nothing about the existing behavior.
    const clientDescription = body.description && body.description.trim() ? body.description : undefined;

    // Identity for upsert: same CVE ID for NVD-sourced saves (this also
    // reuses a saved = 0 cache row left by a prior lookup), same normalized
    // vector for pasted-vector saves.
    const existing = cveId
      ? (db.prepare("SELECT * FROM vulnerabilities WHERE cve_id = ?").get(cveId) as VulnerabilityRow | undefined)
      : (db
          .prepare("SELECT * FROM vulnerabilities WHERE cve_id IS NULL AND vector = ?")
          .get(vector) as VulnerabilityRow | undefined);

    const overwritten = existing?.saved === 1;

    let id: number;
    if (existing) {
      db.prepare(
        "UPDATE vulnerabilities SET label = ?, description = COALESCE(?, description), source = ?, cve_id = ?, vector = ?, cvss_version = ?, base_score = ?, nvd_json = COALESCE(?, nvd_json), fetched_at = COALESCE(?, fetched_at), saved = 1 WHERE id = ?",
      ).run(
        label,
        clientDescription ?? null,
        source,
        cveId,
        vector,
        parsed.version,
        score,
        nvdJsonText,
        nvdJsonText ? now : null,
        existing.id,
      );
      id = existing.id;
    } else {
      const info = db
        .prepare(
          "INSERT INTO vulnerabilities (label, description, source, cve_id, vector, cvss_version, base_score, nvd_json, fetched_at, created_at, saved) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        )
        .run(
          label,
          clientDescription ?? "",
          source,
          cveId,
          vector,
          parsed.version,
          score,
          nvdJsonText,
          nvdJsonText ? now : null,
          now,
        );
      id = Number(info.lastInsertRowid);
    }

    // An NVD-sourced save (cveId set) with an otherwise-empty description
    // gets prefilled from the cached NVD English description, using the
    // row's effective nvd_json (after the COALESCE
    // carry-through above, which the normal lookup-then-save path always
    // has populated). Never overwrites a non-empty description — a re-save
    // of an already-saved, user-edited CVE leaves it alone.
    let row = getVulnerabilityOr404(db, id);
    if (cveId && !row.description.trim() && row.nvd_json) {
      const details = extractCveDetails(JSON.parse(row.nvd_json));
      if (details.description) {
        db.prepare("UPDATE vulnerabilities SET description = ? WHERE id = ?").run(details.description, id);
        row = getVulnerabilityOr404(db, id);
      }
    }
    return c.json({ ...serializeVulnerability(row), overwritten }, overwritten ? 200 : 201);
  });

  app.get("/vulnerabilities/:id", (c) => {
    const id = Number(c.req.param("id"));
    const row = getVulnerabilityOr404(db, id);
    const parsedNvdJson = row.nvd_json ? JSON.parse(row.nvd_json) : null;
    return c.json({
      ...serializeVulnerability(row),
      vectors: parsedNvdJson ? extractVectorOptions(parsedNvdJson) : [],
      details: parsedNvdJson ? extractCveDetails(parsedNvdJson) : null,
    });
  });

  // Editable fields — label and description only. Score/vector/cve_id
  // identity is fixed at save time and never touched here.
  app.put("/vulnerabilities/:id", async (c) => {
    const id = Number(c.req.param("id"));
    const current = getVulnerabilityOr404(db, id);
    const body = await c.req
      .json<{ label?: string; description?: string }>()
      .catch(() => ({}) as { label?: string; description?: string });
    db.prepare("UPDATE vulnerabilities SET label = ?, description = ? WHERE id = ?").run(
      body.label?.trim() || current.label,
      body.description ?? current.description,
      id,
    );
    const row = getVulnerabilityOr404(db, id);
    return c.json(serializeVulnerability(row));
  });

  app.delete("/vulnerabilities/:id", (c) => {
    const id = Number(c.req.param("id"));
    getVulnerabilityOr404(db, id);
    db.prepare("DELETE FROM vulnerabilities WHERE id = ?").run(id);
    return c.body(null, 204);
  });

  return app;
}
