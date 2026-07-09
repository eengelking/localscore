import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb } from "../src/db/index.js";
import { createApp } from "../src/index.js";
import { __resetNvdThrottleForTests } from "../src/lib/nvd.js";

function cveEntry(id: string, score: number, published: string, version: "3.1" | "4.0" = "3.1") {
  const key = version === "4.0" ? "cvssMetricV40" : "cvssMetricV31";
  return {
    cve: {
      id,
      published,
      metrics: {
        [key]: [
          {
            source: "nvd@nist.gov",
            type: "Primary",
            cvssData: {
              version,
              vectorString: `CVSS:${version}/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`,
              baseScore: score,
              baseSeverity: "CRITICAL",
            },
          },
        ],
      },
    },
  };
}

describe("GET /api/major-cves", () => {
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
    vi.unstubAllGlobals();
  });

  it("fetches, merges v3/v4 critical results, dedupes, and returns top 10 by score", async () => {
    const capturedUrls: string[] = [];
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      capturedUrls.push(url);
      if (url.includes("cvssV3Severity")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              vulnerabilities: [
                cveEntry("CVE-2026-0001", 9.8, "2026-07-01T00:00:00.000Z"),
                cveEntry("CVE-2026-0002", 9.1, "2026-07-02T00:00:00.000Z"),
                cveEntry("CVE-2026-SHARED", 9.0, "2026-07-03T00:00:00.000Z"),
              ],
            }),
            { status: 200 },
          ),
        );
      }
      return Promise.resolve(
        new Response(
          JSON.stringify({
            vulnerabilities: [
              cveEntry("CVE-2026-SHARED", 9.0, "2026-07-03T00:00:00.000Z", "4.0"),
              cveEntry("CVE-2026-0003", 10, "2026-07-04T00:00:00.000Z", "4.0"),
            ],
          }),
          { status: 200 },
        ),
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.request("/api/major-cves");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.cves).toHaveLength(4); // 5 total, 1 shared CVE deduped
    expect(body.cves[0]).toMatchObject({ cveId: "CVE-2026-0003", baseScore: 10 });
    expect(body.cves.map((c: { cveId: string }) => c.cveId)).not.toContain(undefined);
    // The shared CVE should appear exactly once, using its v4.0 entry.
    const shared = body.cves.filter((c: { cveId: string }) => c.cveId === "CVE-2026-SHARED");
    expect(shared).toHaveLength(1);
    expect(shared[0].version).toBe("4.0");

    // Scores should be non-increasing.
    const scores = body.cves.map((c: { baseScore: number }) => c.baseScore);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);

    expect(capturedUrls.some((u) => u.includes("cvssV3Severity=CRITICAL"))).toBe(true);
    expect(capturedUrls.some((u) => u.includes("cvssV4Severity=CRITICAL"))).toBe(true);
    expect(capturedUrls.every((u) => u.includes("pubStartDate=") && u.includes("pubEndDate="))).toBe(true);
  });

  it("clamps to the top 10 when more than 10 unique CVEs are returned", async () => {
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            vulnerabilities: Array.from({ length: 15 }, (_, i) =>
              cveEntry(`CVE-2026-${1000 + i}`, 7 + i * 0.1, "2026-07-01T00:00:00.000Z"),
            ),
          }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.request("/api/major-cves");
    const body = await res.json();
    expect(body.cves).toHaveLength(10);
  });

  it("serves the cache without a network call when fresh (< 24h)", async () => {
    db.prepare("INSERT INTO major_cves_cache (id, payload, fetched_at) VALUES (1, ?, ?)").run(
      JSON.stringify([{ cveId: "CVE-2026-CACHED", baseScore: 9.9 }]),
      new Date().toISOString(),
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.request("/api/major-cves");
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.cves).toEqual([{ cveId: "CVE-2026-CACHED", baseScore: 9.9 }]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes when the cache is stale (>= 24h)", async () => {
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO major_cves_cache (id, payload, fetched_at) VALUES (1, ?, ?)").run(
      JSON.stringify([{ cveId: "CVE-2026-OLD", baseScore: 5 }]),
      staleTime,
    );
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({ vulnerabilities: [cveEntry("CVE-2026-FRESH", 9.9, "2026-07-05T00:00:00.000Z")] }),
          { status: 200 },
        ),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.request("/api/major-cves");
    const body = await res.json();
    expect(body.cached).toBe(false);
    expect(body.cves[0].cveId).toBe("CVE-2026-FRESH");
    expect(fetchMock).toHaveBeenCalled();

    const row = db.prepare("SELECT * FROM major_cves_cache WHERE id = 1").get() as { payload: string };
    expect(JSON.parse(row.payload)[0].cveId).toBe("CVE-2026-FRESH");
  });

  it("falls back to the stale cache, with its fetched_at disclosed, when refresh fails", async () => {
    const staleTime = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    db.prepare("INSERT INTO major_cves_cache (id, payload, fetched_at) VALUES (1, ?, ?)").run(
      JSON.stringify([{ cveId: "CVE-2026-OLD", baseScore: 5 }]),
      staleTime,
    );
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.request("/api/major-cves");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.cached).toBe(true);
    expect(body.fetchedAt).toBe(staleTime);
    expect(body.cves[0].cveId).toBe("CVE-2026-OLD");
  });

  it("errors when refresh fails and there's no cache at all", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await app.request("/api/major-cves");
    expect(res.status).toBe(502);
  });
});
