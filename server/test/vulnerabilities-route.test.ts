import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db/index.js";
import { createApp } from "../src/index.js";
import { __resetNvdThrottleForTests } from "../src/lib/nvd.js";

const VECTOR = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";

describe("saved-vulnerability CRUD", () => {
  let dataDir: string;
  let db: ReturnType<typeof openDb>;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(tmpdir(), "localscore-test-"));
    db = openDb(dataDir);
    app = createApp(db);
    __resetNvdThrottleForTests();
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

  describe("saved-vs-cache separation", () => {
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

  describe("PUT /vulnerabilities/:id", () => {
    it("edits label and description in place", async () => {
      const createRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, label: "Original label" }),
      });
      const created = await createRes.json();
      expect(created.description).toBe("");

      const putRes = await app.request(`/api/vulnerabilities/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "Renamed", description: "Some *markdown* notes" }),
      });
      expect(putRes.status).toBe(200);
      const updated = await putRes.json();
      expect(updated).toMatchObject({
        id: created.id,
        label: "Renamed",
        description: "Some *markdown* notes",
        vector: VECTOR,
        baseScore: created.baseScore,
      });

      const getRes = await app.request(`/api/vulnerabilities/${created.id}`);
      expect(await getRes.json()).toMatchObject({ label: "Renamed", description: "Some *markdown* notes" });
    });

    it("does not allow editing vector, score, or cveId", async () => {
      const createRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: "CVE-2026-55200" }),
      });
      const created = await createRes.json();

      const putRes = await app.request(`/api/vulnerabilities/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: "Renamed",
          vector: "CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:N/I:N/A:N",
          baseScore: 0.1,
          cveId: "CVE-9999-99999",
        }),
      });
      const updated = await putRes.json();
      expect(updated).toMatchObject({
        vector: VECTOR,
        baseScore: created.baseScore,
        cveId: "CVE-2026-55200",
      });
    });

    it("404s when editing an unknown id", async () => {
      const res = await app.request("/api/vulnerabilities/999999", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: "x" }),
      });
      expect(res.status).toBe(404);
    });
  });

  describe("NVD data carries through on save", () => {
    const CVE_ID = "CVE-2026-55200";

    it("a CVE saved without an explicit nvdJson still serves multiple vectors on its detail view", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: CVE_ID,
                  descriptions: [{ lang: "en", value: "A saved CVE's description." }],
                  metrics: {
                    cvssMetricV31: [
                      {
                        source: "nvd@nist.gov",
                        type: "Primary",
                        cvssData: { version: "3.1", vectorString: VECTOR, baseScore: 9.8, baseSeverity: "CRITICAL" },
                      },
                      {
                        source: "some-other-source",
                        type: "Secondary",
                        cvssData: {
                          version: "3.1",
                          vectorString: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:L",
                          baseScore: 9.3,
                          baseSeverity: "CRITICAL",
                        },
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

      await app.request(`/api/cve/${CVE_ID}`);

      // Client saves without sending nvdJson — the server must carry the
      // cache row's nvd_json forward onto the saved row.
      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID }),
      });
      const saved = await saveRes.json();

      const detailRes = await app.request(`/api/vulnerabilities/${saved.id}`);
      const detail = await detailRes.json();
      expect(detail.vectors).toHaveLength(2);
      expect(detail.details.description).toBe("A saved CVE's description.");

      vi.unstubAllGlobals();
    });

    it("a pasted-vector save (no nvd_json) returns details: null", async () => {
      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR }),
      });
      const saved = await saveRes.json();

      const detailRes = await app.request(`/api/vulnerabilities/${saved.id}`);
      const detail = await detailRes.json();
      expect(detail.details).toBeNull();
    });
  });

  describe("NVD-description prefill", () => {
    const CVE_ID = "CVE-2026-55200";

    function stubNvdFetch(description: string | null) {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: CVE_ID,
                  descriptions: description ? [{ lang: "en", value: description }] : [],
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
    }

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it("lookup-then-save populates description with the NVD English description", async () => {
      stubNvdFetch("A prefillable description.");
      await app.request(`/api/cve/${CVE_ID}`);

      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID }),
      });
      const saved = await saveRes.json();
      expect(saved.description).toBe("A prefillable description.");
    });

    it("does not clobber a description the user edited after the initial save", async () => {
      stubNvdFetch("The original NVD description.");
      await app.request(`/api/cve/${CVE_ID}`);

      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID }),
      });
      const saved = await saveRes.json();

      await app.request(`/api/vulnerabilities/${saved.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: saved.label, description: "My own notes." }),
      });

      // Re-saving the same CVE (e.g. scoring it again and saving) must not
      // overwrite the user's edited description.
      const resaveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID }),
      });
      const resaved = await resaveRes.json();
      expect(resaved.description).toBe("My own notes.");
    });

    it("leaves a pasted-vector save's description empty", async () => {
      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR }),
      });
      const saved = await saveRes.json();
      expect(saved.description).toBe("");
    });

    it("saves cleanly with an empty description when NVD has no English description (never a 500)", async () => {
      stubNvdFetch(null);
      await app.request(`/api/cve/${CVE_ID}`);

      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: CVE_ID }),
      });
      expect(saveRes.status).toBe(201);
      const saved = await saveRes.json();
      expect(saved.description).toBe("");
    });

    it("saves cleanly with an empty description for a CVE cache row with no nvd_json (never a 500)", async () => {
      // A cveId with no prior lookup means the upsert finds no existing cache
      // row and nvd_json stays null for the new row.
      const saveRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, cveId: "CVE-2026-99999" }),
      });
      expect(saveRes.status).toBe(201);
      const saved = await saveRes.json();
      expect(saved.description).toBe("");
    });
  });

  describe("save-time description", () => {
    it("stores a client-supplied description on the insert path", async () => {
      const res = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, description: "Notes from the save form." }),
      });
      const saved = await res.json();
      expect(saved.description).toBe("Notes from the save form.");
    });

    it("overwrites an existing saved row's description on the update path", async () => {
      const firstRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, description: "Original notes." }),
      });
      const first = await firstRes.json();

      const secondRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, description: "Updated notes." }),
      });
      const second = await secondRes.json();
      expect(second.id).toBe(first.id);
      expect(second.description).toBe("Updated notes.");
    });

    it("a client-supplied description beats the NVD prefill", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: "CVE-2026-55201",
                  descriptions: [{ lang: "en", value: "The NVD description." }],
                  metrics: {
                    cvssMetricV31: [
                      {
                        source: "nvd@nist.gov",
                        type: "Primary",
                        cvssData: {
                          version: "3.1",
                          vectorString: VECTOR,
                          baseScore: 9.8,
                          baseSeverity: "CRITICAL",
                        },
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
      try {
        await app.request("/api/cve/CVE-2026-55201");

        const res = await app.request("/api/vulnerabilities", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ vector: VECTOR, cveId: "CVE-2026-55201", description: "My own summary." }),
        });
        const saved = await res.json();
        expect(saved.description).toBe("My own summary.");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("an absent description keeps every existing behavior (update preserves, pasted-vector stays empty)", async () => {
      const firstRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR, description: "Kept as-is." }),
      });
      const first = await firstRes.json();

      const secondRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: VECTOR }),
      });
      const second = await secondRes.json();
      expect(second.id).toBe(first.id);
      expect(second.description).toBe("Kept as-is.");

      const freshRes = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vector: "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }),
      });
      const fresh = await freshRes.json();
      expect(fresh.description).toBe("");
    });
  });

  describe("search", () => {
    const VECTOR_A = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
    const VECTOR_B = "CVSS:3.1/AV:A/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:N";

    async function saveOne(body: Record<string, unknown>) {
      const res = await app.request("/api/vulnerabilities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      return res.json();
    }

    it("matches a query against the label", async () => {
      await saveOne({ vector: VECTOR_A, label: "Log4Shell in prod" });
      await saveOne({ vector: VECTOR_B, label: "Unrelated finding" });
      const res = await app.request("/api/vulnerabilities?q=log4shell");
      const results = await res.json();
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe("Log4Shell in prod");
    });

    it("matches a query against the CVE ID", async () => {
      await saveOne({ vector: VECTOR_A, cveId: "CVE-2021-44228" });
      await saveOne({ vector: VECTOR_B, cveId: "CVE-2020-00001" });
      const res = await app.request("/api/vulnerabilities?q=2021-44228");
      const results = await res.json();
      expect(results).toHaveLength(1);
      expect(results[0].cveId).toBe("CVE-2021-44228");
    });

    it("matches a query against the vector", async () => {
      await saveOne({ vector: VECTOR_A });
      await saveOne({ vector: VECTOR_B });
      const res = await app.request(`/api/vulnerabilities?q=${encodeURIComponent("AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")}`);
      const results = await res.json();
      expect(results).toHaveLength(1);
      expect(results[0].vector).toBe(VECTOR_A);
    });

    it("matches a query against the description", async () => {
      await saveOne({ vector: VECTOR_A, description: "Affects the checkout service." });
      await saveOne({ vector: VECTOR_B, description: "Affects the billing service." });
      const res = await app.request("/api/vulnerabilities?q=checkout");
      const results = await res.json();
      expect(results).toHaveLength(1);
      expect(results[0].vector).toBe(VECTOR_A);
    });

    it("matches a query against the cached NVD JSON (e.g. an affected-product string)", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: "CVE-2026-77000",
                  descriptions: [{ lang: "en", value: "A vulnerability in Apache Struts." }],
                  configurations: [
                    {
                      nodes: [
                        {
                          cpeMatch: [{ vulnerable: true, criteria: "cpe:2.3:a:apache:struts:2.5.30:*:*:*:*:*:*:*" }],
                        },
                      ],
                    },
                  ],
                  metrics: {
                    cvssMetricV31: [
                      {
                        source: "nvd@nist.gov",
                        type: "Primary",
                        cvssData: {
                          version: "3.1",
                          vectorString: VECTOR_A,
                          baseScore: 9.8,
                          baseSeverity: "CRITICAL",
                        },
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
      try {
        await app.request("/api/cve/CVE-2026-77000");
        await saveOne({ vector: VECTOR_A, cveId: "CVE-2026-77000" });
        await saveOne({ vector: VECTOR_B, label: "Unrelated" });

        const res = await app.request("/api/vulnerabilities?q=struts");
        const results = await res.json();
        expect(results).toHaveLength(1);
        expect(results[0].cveId).toBe("CVE-2026-77000");
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it("matching is case-insensitive", async () => {
      await saveOne({ vector: VECTOR_A, label: "Mixed Case Label" });
      const res = await app.request("/api/vulnerabilities?q=MIXED case");
      expect(await res.json()).toHaveLength(1);
    });

    it("escapes % and _ so they match literally rather than as LIKE wildcards", async () => {
      // "off_special" (real underscore) vs "offXspecial" (no underscore at
      // all): if the query's underscore were left unescaped, SQLite's LIKE
      // treats it as "any single character" and would wrongly match both.
      await saveOne({ vector: VECTOR_A, label: "off_special" });
      await saveOne({ vector: VECTOR_B, label: "offXspecial" });

      const res = await app.request("/api/vulnerabilities?q=off_special");
      const results = await res.json();
      expect(results).toHaveLength(1);
      expect(results[0].label).toBe("off_special");
    });

    it("returns all saved rows when q is blank or absent", async () => {
      await saveOne({ vector: VECTOR_A });
      await saveOne({ vector: VECTOR_B });
      const blank = await app.request("/api/vulnerabilities?q=");
      expect(await blank.json()).toHaveLength(2);
      const absent = await app.request("/api/vulnerabilities");
      expect(await absent.json()).toHaveLength(2);
    });

    it("never surfaces saved = 0 cache rows regardless of match", async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            vulnerabilities: [
              {
                cve: {
                  id: "CVE-2026-88000",
                  descriptions: [{ lang: "en", value: "A cache-only lookup, never saved." }],
                  metrics: {
                    cvssMetricV31: [
                      {
                        source: "nvd@nist.gov",
                        type: "Primary",
                        cvssData: {
                          version: "3.1",
                          vectorString: VECTOR_A,
                          baseScore: 9.8,
                          baseSeverity: "CRITICAL",
                        },
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
      try {
        await app.request("/api/cve/CVE-2026-88000");
        const res = await app.request("/api/vulnerabilities?q=cache-only");
        expect(await res.json()).toHaveLength(0);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });
});
