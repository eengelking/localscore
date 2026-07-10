import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "..", "src", "migrations");

describe("migration 0002 (docs/SPEC02.md §7.1/§7.2)", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "localscore-test-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("applies cleanly on a v1 database, and pre-existing rows come out saved = 1", () => {
    // Simulate a database that only ever saw migration 0001 — insert a
    // pre-existing vulnerability row the way v1 code would have.
    const dbPath = path.join(dataDir, "localscore.db");
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    raw.exec(readFileSync(path.join(migrationsDir, "0001_init.sql"), "utf8"));
    raw.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
      "0001_init.sql",
      new Date().toISOString(),
    );
    raw
      .prepare(
        "INSERT INTO vulnerabilities (label, source, cve_id, vector, cvss_version, base_score, created_at) VALUES (?, 'vector', NULL, ?, '3.1', 9.8, ?)",
      )
      .run("Pre-existing entry", "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", new Date().toISOString());
    raw.close();

    // openDb() re-runs migrations against the same file, applying 0002.
    const db = openDb(dataDir);
    const row = db.prepare("SELECT * FROM vulnerabilities WHERE label = ?").get("Pre-existing entry") as {
      saved: number;
      description: string;
    };
    expect(row.saved).toBe(1);
    expect(row.description).toBe("");
    db.close();
  });
});

describe("migration 0004 (docs/SPEC05.md §3.1)", () => {
  let dataDir: string;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "localscore-test-"));
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("applies cleanly on a pre-0004 database, and pre-existing rows come out location = ''", () => {
    const dbPath = path.join(dataDir, "localscore.db");
    const raw = new Database(dbPath);
    raw.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version    TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
    `);
    for (const file of ["0001_init.sql", "0002_vulnerabilities_saved_flag.sql", "0003_major_cves_cache.sql"]) {
      raw.exec(readFileSync(path.join(migrationsDir, file), "utf8"));
      raw.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)").run(
        file,
        new Date().toISOString(),
      );
    }
    const now = new Date().toISOString();
    raw
      .prepare(
        "INSERT INTO environments (name, description, catalog_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("Pre-existing environment", "", "1.0", now, now);
    raw.close();

    const db = openDb(dataDir);
    const row = db.prepare("SELECT * FROM environments WHERE name = ?").get("Pre-existing environment") as {
      location: string;
    };
    expect(row.location).toBe("");
    db.close();
  });
});
