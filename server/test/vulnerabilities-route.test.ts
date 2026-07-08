import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
});
