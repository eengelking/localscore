import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db/index.js";
import { createApp } from "../src/index.js";

const VECTOR = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";

describe("saved-vulnerability CRUD", () => {
  let dataDir: string;
  let db: ReturnType<typeof openDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "localscore-test-"));
    db = openDb(dataDir);
    app = createApp(db);
  });

  afterEach(() => {
    db.close();
    rmSync(dataDir, { recursive: true, force: true });
  });

  it("lists no vulnerabilities initially", async () => {
    const res = await app.request("/api/vulnerabilities");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("400s when vector is missing", async () => {
    const res = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: "no vector" }),
    });
    expect(res.status).toBe(400);
  });

  it("saves a pasted vector, computing the score server-side", async () => {
    const res = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: VECTOR, label: "My CVE" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      label: "My CVE",
      source: "vector",
      cveId: null,
      baseScore: 9.8,
      cvssVersion: "3.1",
    });

    const listRes = await app.request("/api/vulnerabilities");
    expect(await listRes.json()).toHaveLength(1);
  });

  it("defaults the label to the cveId when saving an NVD-sourced vector", async () => {
    const res = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: VECTOR, cveId: "CVE-2026-55200" }),
    });
    const body = await res.json();
    expect(body).toMatchObject({ label: "CVE-2026-55200", source: "nvd", cveId: "CVE-2026-55200" });
  });

  it("ignores a client-supplied score and recomputes it from the vector", async () => {
    const res = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: VECTOR, baseScore: 0.1 }),
    });
    const body = await res.json();
    expect(body.baseScore).toBe(9.8);
  });

  it("fetches a saved vulnerability by id and 404s for an unknown one", async () => {
    const createRes = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: VECTOR }),
    });
    const created = await createRes.json();

    const getRes = await app.request(`/api/vulnerabilities/${created.id}`);
    expect(getRes.status).toBe(200);
    expect((await getRes.json()).id).toBe(created.id);

    const missingRes = await app.request("/api/vulnerabilities/999999");
    expect(missingRes.status).toBe(404);
  });

  it("deletes a saved vulnerability", async () => {
    const createRes = await app.request("/api/vulnerabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: VECTOR }),
    });
    const created = await createRes.json();

    const deleteRes = await app.request(`/api/vulnerabilities/${created.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(204);

    const listRes = await app.request("/api/vulnerabilities");
    expect(await listRes.json()).toEqual([]);
  });

  describe("saved-vs-cache separation (docs/SPEC02.md §7.1)", () => {
    const CVE_ID = "CVE-2026-55200";

    it("a lookup-cache row (saved = 0) doesn't show up in the saved list", () => {
      db.prepare(
        "INSERT INTO vulnerabilities (label, source, cve_id, vector, cvss_version, base_score, created_at, saved) VALUES (?, 'nvd', ?, ?, '3.1', 9.8, ?, 0)",
      ).run(CVE_ID, CVE_ID, VECTOR, new Date().toISOString());

      return app.request("/api/vulnerabilities").then(async (res) => {
        expect(await res.json()).toEqual([]);
      });
    });

    it("saving over an existing cache row reuses it (no duplicate) and marks it saved", async () => {
      const now = new Date().toISOString();
      const info = db
        .prepare(
          "INSERT INTO vulnerabilities (label, source, cve_id, vector, cvss_version, base_score, created_at, saved) VALUES (?, 'nvd', ?, ?, '3.1', 9.8, ?, 0)",
        )
        .run(CVE_ID, CVE_ID, VECTOR, now);

      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID }),
      });
      expect(saveRes.status).toBe(201);
      const saved = await saveRes.json();
      expect(saved.id).toBe(Number(info.lastInsertRowid));
      expect(saved.overwritten).toBe(false);

      const listRes = await app.request("/api/vulnerabilities");
      expect(await listRes.json()).toHaveLength(1);

      const rowCount = db.prepare("SELECT COUNT(*) AS n FROM vulnerabilities").get() as { n: number };
      expect(rowCount.n).toBe(1);
    });

    it("re-saving the same CVE updates the existing entry instead of inserting a duplicate", async () => {
      const first = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID, label: "First label" }),
      });
      const firstBody = await first.json();
      expect(firstBody.overwritten).toBe(false);

      const second = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID, label: "Updated label" }),
      });
      expect(second.status).toBe(200);
      const secondBody = await second.json();
      expect(secondBody.overwritten).toBe(true);
      expect(secondBody.id).toBe(firstBody.id);
      expect(secondBody.label).toBe("Updated label");

      const listRes = await app.request("/api/vulnerabilities");
      expect(await listRes.json()).toHaveLength(1);
    });

    it("re-saving the same pasted vector updates the existing entry instead of inserting a duplicate", async () => {
      const first = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, label: "First label" }),
      });
      const firstBody = await first.json();

      const second = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, label: "Updated label" }),
      });
      expect(second.status).toBe(200);
      const secondBody = await second.json();
      expect(secondBody.overwritten).toBe(true);
      expect(secondBody.id).toBe(firstBody.id);

      const listRes = await app.request("/api/vulnerabilities");
      expect(await listRes.json()).toHaveLength(1);
    });

    it("looking up a CVE then saving it yields exactly one saved entry, and re-lookup still works", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: CVE_ID,
                  metrics: {
                    cvssMetricV31: [
                      {
                        source: "nvd@nist.gov",
                        type: "Primary",
                        cvssData: { version: "3.1", vectorString: VECTOR, baseScore: 9.8, baseSeverity: "CRITICAL" },
                      },
                    ],
                  },
                },
              },
            ],
          }),
          { status: 200 },
        ),
      );
      vi.stubGlobal("fetch", fetchMock);

      const lookupRes = await app.request(`/api/cve/${CVE_ID}`);
      expect(lookupRes.status).toBe(200);

      const afterLookup = await app.request("/api/vulnerabilities");
      expect(await afterLookup.json()).toEqual([]);

      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID }),
      });
      expect(saveRes.status).toBe(201);

      const afterSave = await app.request("/api/vulnerabilities");
      expect(await afterSave.json()).toHaveLength(1);

      const relookupRes = await app.request(`/api/cve/${CVE_ID}`);
      expect(relookupRes.status).toBe(200);
      expect((await relookupRes.json()).cached).toBe(true);

      vi.unstubAllGlobals();
    });
  });
});
