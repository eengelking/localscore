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

  describe("quote stripping (docs/SPEC06.md §2.1)", () => {
    it("strips wrapping quotes from name and location on create", async () => {
      const res = await app.request("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: '"My Data Center"', location: "'us-east-1'" }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.name).toBe("My Data Center");
      expect(body.location).toBe("us-east-1");
    });

    it("strips wrapping quotes from name and location on update", async () => {
      const createRes = await app.request("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Plain Name" }),
      });
      const created = await createRes.json();

      const putRes = await app.request(`/api/environments/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "“Renamed Lab”", location: "‘Building 4, rack 12’" }),
      });
      expect(putRes.status).toBe(200);
      const body = await putRes.json();
      expect(body.name).toBe("Renamed Lab");
      expect(body.location).toBe("Building 4, rack 12");
    });

    it("fully strips nested matched quote pairs", async () => {
      const res = await app.request("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "\"'My Lab'\"" }),
      });
      const body = await res.json();
      expect(body.name).toBe("My Lab");
    });

    it("preserves interior/unmatched quotes", async () => {
      const res = await app.request("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Bob's Lab", location: 'say "hi"' }),
      });
      const body = await res.json();
      expect(body.name).toBe("Bob's Lab");
      expect(body.location).toBe('say "hi"');
    });

    it("400s when a name is only quotes (becomes empty after stripping)", async () => {
      const res = await app.request("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: '""' }),
      });
      expect(res.status).toBe(400);
    });

    it("does not strip quotes from description", async () => {
      const res = await app.request("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Quoted Desc", description: '"kept as-is"' }),
      });
      const body = await res.json();
      expect(body.description).toBe('"kept as-is"');
    });
  });

  // docs/SPEC05.md §3.2.1 (narrows docs/SPEC04.md §4.1) — the score-raising flag.
  describe("raisesScores (docs/SPEC05.md §3.2.1)", () => {
    async function createAndAnswer(name: string, answers: { questionId: string; optionId: string }[]) {
      const createRes = await app.request("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const created = await createRes.json();
      if (answers.length > 0) {
        await app.request(`/api/environments/${created.id}/answers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
      }
      return created.id as number;
    }

    it("flags both versions for a stepping-stone (Q8) profile", async () => {
      const id = await createAndAnswer("Stepping Stone", [
        { questionId: "blast_radius", optionId: "stepping_stone" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.raisesScores).toEqual({ "4.0": true, "3.1": true });
      expect(body.raisingAnswers).toEqual(
        expect.arrayContaining([{ questionId: "blast_radius", optionId: "stepping_stone" }]),
      );
      expect(body.raisingAnswers).toHaveLength(1);

      const listRes = await app.request("/api/environments");
      const list = await listRes.json();
      const listed = list.find((e: { id: number }) => e.id === id);
      expect(listed.raisesScores).toEqual({ "4.0": true, "3.1": true });
      expect(listed.raisingAnswers).toBeUndefined();
    });

    it("flags only 4.0 for a safety=yes (Q9) profile", async () => {
      const id = await createAndAnswer("Life Safety", [{ questionId: "safety", optionId: "yes" }]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.raisesScores).toEqual({ "4.0": true, "3.1": false });
      expect(body.raisingAnswers).toEqual([{ questionId: "safety", optionId: "yes" }]);
    });

    it("does NOT flag a Catastrophic-only (Q5/Q6/Q7) profile (SPEC05 §3.2.1 narrowing, the IL6 case)", async () => {
      const id = await createAndAnswer("Crown Jewels", [
        { questionId: "confidentiality", optionId: "catastrophic" },
        { questionId: "integrity", optionId: "catastrophic" },
        { questionId: "availability", optionId: "immediate" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.raisesScores).toEqual({ "4.0": false, "3.1": false });
      expect(body.raisingAnswers).toEqual([]);
    });

    it("does not flag an all-lowering profile (the worked-example Disposable Dev Lab answers)", async () => {
      const id = await createAndAnswer("Disposable Dev Lab", [
        { questionId: "reachability", optionId: "internal_only" },
        { questionId: "confidentiality", optionId: "nothing" },
        { questionId: "integrity", optionId: "nothing" },
        { questionId: "availability", optionId: "nobody" },
        { questionId: "blast_radius", optionId: "dead_end" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.raisesScores).toEqual({ "4.0": false, "3.1": false });
      expect(body.raisingAnswers).toEqual([]);
    });

    it("does not flag an empty environment", async () => {
      const id = await createAndAnswer("Blank", []);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.raisesScores).toEqual({ "4.0": false, "3.1": false });
      expect(body.raisingAnswers).toEqual([]);
    });

    it("does not flag supplemental-only answers (Q10-Q12)", async () => {
      const id = await createAndAnswer("Supplemental Only", [
        { questionId: "recovery", optionId: "automatic" },
        { questionId: "value_density", optionId: "concentrated" },
        { questionId: "patch_effort", optionId: "hard" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.raisesScores).toEqual({ "4.0": false, "3.1": false });
      expect(body.raisingAnswers).toEqual([]);
      expect(body.redFlags).toEqual([]);
    });
  });

  // docs/SPEC05.md §3.2.2 — configuration red flags.
  describe("redFlags (docs/SPEC05.md §3.2.2)", () => {
    async function createAndAnswer(name: string, answers: { questionId: string; optionId: string }[]) {
      const createRes = await app.request("/api/environments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const created = await createRes.json();
      if (answers.length > 0) {
        await app.request(`/api/environments/${created.id}/answers`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answers }),
        });
      }
      return created.id as number;
    }

    it("triggers uncertain_recovery on high stakes + uncertain recovery", async () => {
      const id = await createAndAnswer("Catastrophic But Improvised", [
        { questionId: "confidentiality", optionId: "catastrophic" },
        { questionId: "recovery", optionId: "uncertain" },
      ]);
      const listRes = await app.request("/api/environments");
      const list = await listRes.json();
      const listed = list.find((e: { id: number }) => e.id === id);
      expect(listed.redFlags).toEqual(["uncertain_recovery"]);

      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags).toHaveLength(1);
      expect(body.redFlags[0].id).toBe("uncertain_recovery");
      expect(body.redFlags[0].answers).toEqual(
        expect.arrayContaining([
          { questionId: "confidentiality", optionId: "catastrophic" },
          { questionId: "recovery", optionId: "uncertain" },
        ]),
      );
    });

    it("Q9 safety=yes also satisfies high stakes for uncertain_recovery", async () => {
      const id = await createAndAnswer("Life Safety Improvised", [
        { questionId: "safety", optionId: "yes" },
        { questionId: "recovery", optionId: "uncertain" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags.map((f: { id: string }) => f.id)).toEqual(["uncertain_recovery"]);
    });

    it("does not trigger uncertain_recovery on stakes alone", async () => {
      const id = await createAndAnswer("Catastrophic Only", [
        { questionId: "confidentiality", optionId: "catastrophic" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags).toEqual([]);
    });

    it("does not trigger uncertain_recovery on uncertain recovery alone", async () => {
      const id = await createAndAnswer("Just Uncertain", [{ questionId: "recovery", optionId: "uncertain" }]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags).toEqual([]);
    });

    it("triggers concentrated_availability on immediate availability + concentrated value density", async () => {
      const id = await createAndAnswer("Critical Hypervisor", [
        { questionId: "availability", optionId: "immediate" },
        { questionId: "value_density", optionId: "concentrated" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags.map((f: { id: string }) => f.id)).toEqual(["concentrated_availability"]);
    });

    it("triggers hard_to_patch on high stakes + hard patch effort", async () => {
      const id = await createAndAnswer("Regulated And Slow", [
        { questionId: "integrity", optionId: "catastrophic" },
        { questionId: "patch_effort", optionId: "hard" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags.map((f: { id: string }) => f.id)).toEqual(["hard_to_patch"]);
    });

    it("skipped questions never satisfy a condition", async () => {
      const id = await createAndAnswer("All Skipped", [
        { questionId: "confidentiality", optionId: "skip" },
        { questionId: "recovery", optionId: "skip" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags).toEqual([]);
    });

    it("yields [] for an empty environment", async () => {
      const id = await createAndAnswer("Blank", []);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags).toEqual([]);
    });

    it("can trigger multiple flags at once", async () => {
      const id = await createAndAnswer("Everything Wrong", [
        { questionId: "confidentiality", optionId: "catastrophic" },
        { questionId: "availability", optionId: "immediate" },
        { questionId: "recovery", optionId: "uncertain" },
        { questionId: "value_density", optionId: "concentrated" },
        { questionId: "patch_effort", optionId: "hard" },
      ]);
      const getRes = await app.request(`/api/environments/${id}`);
      const body = await getRes.json();
      expect(body.redFlags.map((f: { id: string }) => f.id).sort()).toEqual(
        ["concentrated_availability", "hard_to_patch", "uncertain_recovery"].sort(),
      );
    });
  });

  describe("catalog integrity for red flags (docs/SPEC05.md §3.2.2)", () => {
    it("every questionId/optionId referenced by the red-flags rule set exists in the shipped catalog", async () => {
      const { REFERENCED_ANSWERS } = await import("../src/scoring/redflags.js");
      const { CATALOG } = await import("../src/catalog/catalog.js");
      for (const { questionId, optionId } of REFERENCED_ANSWERS) {
        const question = CATALOG.find((q) => q.id === questionId);
        expect(question, `question ${questionId} should exist`).toBeDefined();
        const option = question?.options.find((o) => o.id === optionId);
        expect(option, `option ${questionId}/${optionId} should exist`).toBeDefined();
      }
    });
  });
});
