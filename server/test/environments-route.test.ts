import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.js";
import { createApp } from "../src/index.js";
import { CATALOG_VERSION } from "../src/catalog/index.js";

describe("environment CRUD, answers, and re-derivation", () => {
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

  it("lists no environments initially", async () => {
    const res = await app.request("/api/environments");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it("400s when name is missing", async () => {
    const res = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: "no name" }),
    });
    expect(res.status).toBe(400);
  });

  it("creates an environment with no interview completion and no answers", async () => {
    const res = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "My Data Center", description: "primary site" }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      name: "My Data Center",
      description: "primary site",
      catalogVersion: CATALOG_VERSION,
      interviewCompletion: { "4.0": false, "3.1": false },
    });

    const listRes = await app.request("/api/environments");
    expect(await listRes.json()).toHaveLength(1);
  });

  it("fetches an environment by id, incl. empty answers/metrics, and 404s for an unknown one", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Dev Lab" }),
    });
    const created = await createRes.json();

    const getRes = await app.request(`/api/environments/${created.id}`);
    expect(getRes.status).toBe(200);
    const body = await getRes.json();
    expect(body.id).toBe(created.id);
    expect(body.answers).toEqual([]);
    expect(body.metrics).toEqual([]);

    const missingRes = await app.request("/api/environments/999999");
    expect(missingRes.status).toBe(404);
  });

  it("renames and edits the description of an environment", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Old Name", description: "old desc" }),
    });
    const created = await createRes.json();

    const putRes = await app.request(`/api/environments/${created.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Name", description: "new desc" }),
    });
    expect(putRes.status).toBe(200);
    const body = await putRes.json();
    expect(body.name).toBe("New Name");
    expect(body.description).toBe("new desc");
  });

  it("deletes an environment", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Throwaway" }),
    });
    const created = await createRes.json();

    const deleteRes = await app.request(`/api/environments/${created.id}`, { method: "DELETE" });
    expect(deleteRes.status).toBe(204);

    const listRes = await app.request("/api/environments");
    expect(await listRes.json()).toEqual([]);
  });

  it("saves interview answers, deriving metrics, and marks the interview complete", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Disposable Dev Lab" }),
    });
    const created = await createRes.json();

    const answerRes = await app.request(`/api/environments/${created.id}/answers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [{ questionId: "reachability", optionId: "internal_only" }] }),
    });
    expect(answerRes.status).toBe(200);
    const answerBody = await answerRes.json();
    expect(answerBody.answers).toEqual([{ questionId: "reachability", optionId: "internal_only" }]);
    expect(answerBody.metrics).toEqual(
      expect.arrayContaining([
        { cvssVersion: "4.0", metric: "MAV", value: "A", effect: "cap" },
        { cvssVersion: "3.1", metric: "MAV", value: "A", effect: "cap" },
      ]),
    );

    const getRes = await app.request(`/api/environments/${created.id}`);
    const body = await getRes.json();
    expect(body.interviewCompletion).toEqual({ "4.0": true, "3.1": true });
  });

  it("resumes a partially-completed interview: a second partial save preserves earlier answers", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Retail Kiosks" }),
    });
    const created = await createRes.json();

    await app.request(`/api/environments/${created.id}/answers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [{ questionId: "reachability", optionId: "internal_only" }] }),
    });

    const secondRes = await app.request(`/api/environments/${created.id}/answers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [{ questionId: "human_use", optionId: "headless" }] }),
    });
    const secondBody = await secondRes.json();
    expect(secondBody.answers).toEqual(
      expect.arrayContaining([
        { questionId: "reachability", optionId: "internal_only" },
        { questionId: "human_use", optionId: "headless" },
      ]),
    );
    expect(secondBody.answers).toHaveLength(2);
  });

  it("re-saving an answer for the same question overwrites it, and metrics are re-derived rather than accumulated", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Reconsidered" }),
    });
    const created = await createRes.json();

    await app.request(`/api/environments/${created.id}/answers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [{ questionId: "reachability", optionId: "internal_only" }] }),
    });

    const overwriteRes = await app.request(`/api/environments/${created.id}/answers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers: [{ questionId: "reachability", optionId: "no_network" }] }),
    });
    const overwriteBody = await overwriteRes.json();

    expect(overwriteBody.answers).toEqual([{ questionId: "reachability", optionId: "no_network" }]);
    // Metrics are cleared and re-derived from scratch on every save, not appended to —
    // so only the current answer's effects should be present, never both internal_only's
    // and no_network's MAV values at once.
    const mavMetrics = overwriteBody.metrics.filter((m: { metric: string }) => m.metric === "MAV");
    expect(mavMetrics).toEqual(
      expect.arrayContaining([
        { cvssVersion: "4.0", metric: "MAV", value: "P", effect: "cap" },
        { cvssVersion: "3.1", metric: "MAV", value: "P", effect: "cap" },
      ]),
    );
    expect(mavMetrics).toHaveLength(2);
  });

  it("an environment with zero answers has empty metrics (base score reproduced exactly, §2.3)", async () => {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Untouched" }),
    });
    const created = await createRes.json();

    const getRes = await app.request(`/api/environments/${created.id}`);
    const body = await getRes.json();
    expect(body.metrics).toEqual([]);
  });
});
