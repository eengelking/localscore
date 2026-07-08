import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { openDb } from "../src/db/index.js";
import { createApp } from "../src/index.js";

describe("POST /api/score", () => {
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

  async function createEnvironment(name: string, answers: { questionId: string; optionId: string }[]) {
    const createRes = await app.request("/api/environments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const env = await createRes.json();
    await app.request(`/api/environments/${env.id}/answers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
    });
    return env.id;
  }

  it("400s with a friendly error when vector is missing", async () => {
    const res = await app.request("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/vector is required/i);
  });

  it("400s with a friendly error for a malformed vector", async () => {
    const res = await app.request("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: "not a vector" }),
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/Unrecognized CVSS vector format/i);
  });

  it("scores the base vector with no environments defined", async () => {
    const res = await app.request("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.base.score).toBe(9.8);
    expect(body.base.severity).toBe("Critical");
    expect(body.environments).toEqual([]);
  });

  it("reproduces the SPEC.md §6 worked example end-to-end through the API", async () => {
    await createEnvironment("Disposable Dev Lab", [
      { questionId: "reachability", optionId: "internal_only" },
      { questionId: "confidentiality", optionId: "nothing" },
      { questionId: "integrity", optionId: "nothing" },
      { questionId: "availability", optionId: "nobody" },
      { questionId: "blast_radius", optionId: "dead_end" },
    ]);

    const res = await app.request("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }),
    });
    const body = await res.json();
    expect(body.base.score).toBe(9.8);
    expect(body.environments).toHaveLength(1);
    expect(body.environments[0]).toMatchObject({
      name: "Disposable Dev Lab",
      hasProfile: true,
      score: 0.0,
      severity: "None",
      delta: -9.8,
    });
    expect(body.environments[0].changes.length).toBeGreaterThan(0);
  });

  it("marks environments with no profile for the vector's version, without a fake score", async () => {
    // Only answers a v4-only question (safety) — no v3.1 effects at all.
    await createEnvironment("Safety Only", [{ questionId: "safety", optionId: "yes" }]);

    const res = await app.request("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }),
    });
    const body = await res.json();
    expect(body.environments).toEqual([{ id: expect.any(Number), name: "Safety Only", hasProfile: false }]);
  });

  it("explains answered questions that produced no visible change", async () => {
    // Mirrors a real report: every answer here is either the worst-case
    // option (no effect), a cap no less severe than the base vector's own
    // value (dropped), or a v4.0-only question against a v3.1 vector.
    await createEnvironment("Eddard", [
      { questionId: "reachability", optionId: "internet" },
      { questionId: "network_protections", optionId: "basic" },
      { questionId: "accounts", optionId: "user_required" },
      { questionId: "human_use", optionId: "interactive" },
      { questionId: "confidentiality", optionId: "painful" },
      { questionId: "safety", optionId: "no" },
    ]);

    const res = await app.request("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: "CVSS:3.1/AV:N/AC:L/PR:L/UI:N/S:U/C:H/I:H/A:H" }),
    });
    const body = await res.json();
    const env = body.environments[0];

    const byQuestion = Object.fromEntries(
      env.notes.map((n: { questionId: string; status: string }) => [n.questionId, n.status]),
    );
    expect(byQuestion).toMatchObject({
      reachability: "no-effect",
      network_protections: "no-effect",
      accounts: "capped-by-base",
      human_use: "no-effect",
      safety: "not-applicable-to-version",
    });
    // The one answer that actually changed something isn't repeated in notes.
    expect(byQuestion.confidentiality).toBeUndefined();
    expect(env.changes.some((c: { questionId: string }) => c.questionId === "confidentiality")).toBe(true);
  });

  it("sorts scored environments by score descending", async () => {
    await createEnvironment("Low Risk", [
      { questionId: "reachability", optionId: "internal_only" },
      { questionId: "confidentiality", optionId: "nothing" },
      { questionId: "integrity", optionId: "nothing" },
      { questionId: "availability", optionId: "nobody" },
    ]);
    await createEnvironment("High Risk", [{ questionId: "confidentiality", optionId: "catastrophic" }]);

    const res = await app.request("/api/score", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vector: "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H" }),
    });
    const body = await res.json();
    const names = body.environments.map((e: { name: string }) => e.name);
    expect(names).toEqual(["High Risk", "Low Risk"]);
  });
});
