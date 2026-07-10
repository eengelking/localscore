import { Hono } from "hono";
import type Database from "better-sqlite3";
import { CATALOG_VERSION } from "../catalog/index.js";
import { deriveMetrics } from "../catalog/derive.js";
import { computeRaisesScores, computeRaisingAnswers } from "../scoring/raising.js";
import { computeRedFlags } from "../scoring/redflags.js";
import { HttpError } from "../lib/errors.js";
import { stripWrappingQuotes } from "../lib/strings.js";

interface EnvironmentRow {
  id: number;
  name: string;
  description: string;
  location: string;
  catalog_version: string;
  created_at: string;
  updated_at: string;
}

interface AnswerRow {
  environment_id: number;
  question_id: string;
  option_id: string;
}

interface MetricRow {
  environment_id: number;
  cvss_version: "4.0" | "3.1";
  metric: string;
  value: string;
  effect: "override" | "cap";
}

function getEnvironmentOr404(db: Database.Database, id: number): EnvironmentRow {
  const row = db.prepare("SELECT * FROM environments WHERE id = ?").get(id) as EnvironmentRow | undefined;
  if (!row) throw new HttpError(404, `No environment with id ${id}`);
  return row;
}

function completionStatus(metrics: MetricRow[], answers: AnswerRow[]) {
  const hasAnswers = answers.length > 0;
  const versions = new Set(metrics.map((m) => m.cvss_version));
  return {
    "4.0": hasAnswers && versions.has("4.0"),
    "3.1": hasAnswers,
  };
}

// Every environment response (list, detail, create, rename) shares this
// camelCase shape so the frontend has one consistent contract. `raisesScores`
// is re-derived from `environment_answers` via deriveMetrics() at request
// time rather than read from the persisted `environment_metrics` cache,
// because DerivedMetric carries the questionId/optionId provenance the
// edit view needs and the cache doesn't. `redFlags` is computed straight
// from the raw answers, not derived metrics, since its conditions reference
// supplemental questions (Q10-Q12) that never produce a metric at all.
function serializeEnvironment(env: EnvironmentRow, answers: AnswerRow[], metrics: MetricRow[]) {
  const answerPairs = answers.map((a) => ({ questionId: a.question_id, optionId: a.option_id }));
  const derived = deriveMetrics(answerPairs);
  return {
    id: env.id,
    name: env.name,
    description: env.description,
    location: env.location,
    catalogVersion: env.catalog_version,
    createdAt: env.created_at,
    updatedAt: env.updated_at,
    interviewCompletion: completionStatus(metrics, answers),
    raisesScores: computeRaisesScores(derived),
    redFlags: computeRedFlags(answerPairs).map((f) => f.id),
  };
}

export function environmentRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/environments", (c) => {
    const envs = db.prepare("SELECT * FROM environments ORDER BY name").all() as EnvironmentRow[];
    const result = envs.map((env) => {
      const answers = db
        .prepare("SELECT * FROM environment_answers WHERE environment_id = ?")
        .all(env.id) as AnswerRow[];
      const metrics = db
        .prepare("SELECT * FROM environment_metrics WHERE environment_id = ?")
        .all(env.id) as MetricRow[];
      return serializeEnvironment(env, answers, metrics);
    });
    return c.json(result);
  });

  app.post("/environments", async (c) => {
    const body = await c.req.json<{ name?: string; description?: string; location?: string }>();
    const name = stripWrappingQuotes(body.name ?? "");
    if (!name) {
      throw new HttpError(400, "name is required");
    }
    const location = stripWrappingQuotes(body.location ?? "");
    const now = new Date().toISOString();
    const info = db
      .prepare(
        "INSERT INTO environments (name, description, location, catalog_version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
      )
      .run(name, body.description ?? "", location, CATALOG_VERSION, now, now);
    const env = getEnvironmentOr404(db, Number(info.lastInsertRowid));
    return c.json(serializeEnvironment(env, [], []), 201);
  });

  app.get("/environments/:id", (c) => {
    const id = Number(c.req.param("id"));
    const env = getEnvironmentOr404(db, id);
    const answers = db.prepare("SELECT * FROM environment_answers WHERE environment_id = ?").all(id) as AnswerRow[];
    const metrics = db.prepare("SELECT * FROM environment_metrics WHERE environment_id = ?").all(id) as MetricRow[];
    const answerPairs = answers.map((a) => ({ questionId: a.question_id, optionId: a.option_id }));
    const derived = deriveMetrics(answerPairs);
    return c.json({
      ...serializeEnvironment(env, answers, metrics),
      raisingAnswers: computeRaisingAnswers(derived),
      redFlags: computeRedFlags(answerPairs),
      answers: answerPairs,
      metrics: metrics.map((m) => ({
        cvssVersion: m.cvss_version,
        metric: m.metric,
        value: m.value,
        effect: m.effect,
      })),
    });
  });

  app.put("/environments/:id", async (c) => {
    const id = Number(c.req.param("id"));
    getEnvironmentOr404(db, id);
    const body = await c.req.json<{ name?: string; description?: string; location?: string }>();
    const now = new Date().toISOString();
    const current = getEnvironmentOr404(db, id);
    const strippedName = body.name !== undefined ? stripWrappingQuotes(body.name) : "";
    const strippedLocation = body.location !== undefined ? stripWrappingQuotes(body.location) : undefined;
    db.prepare("UPDATE environments SET name = ?, description = ?, location = ?, updated_at = ? WHERE id = ?").run(
      strippedName || current.name,
      body.description ?? current.description,
      strippedLocation !== undefined ? strippedLocation : current.location,
      now,
      id,
    );
    const env = getEnvironmentOr404(db, id);
    const answers = db.prepare("SELECT * FROM environment_answers WHERE environment_id = ?").all(id) as AnswerRow[];
    const metrics = db.prepare("SELECT * FROM environment_metrics WHERE environment_id = ?").all(id) as MetricRow[];
    return c.json(serializeEnvironment(env, answers, metrics));
  });

  app.put("/environments/:id/answers", async (c) => {
    const id = Number(c.req.param("id"));
    getEnvironmentOr404(db, id);
    const body = await c.req.json<{ answers?: { questionId: string; optionId: string }[] }>();
    const incoming = body.answers ?? [];

    const saveAndDerive = db.transaction(() => {
      const upsert = db.prepare(
        "INSERT INTO environment_answers (environment_id, question_id, option_id) VALUES (?, ?, ?) " +
          "ON CONFLICT(environment_id, question_id) DO UPDATE SET option_id = excluded.option_id",
      );
      for (const a of incoming) {
        upsert.run(id, a.questionId, a.optionId);
      }

      const allAnswers = db
        .prepare("SELECT * FROM environment_answers WHERE environment_id = ?")
        .all(id) as AnswerRow[];

      const derived = deriveMetrics(allAnswers.map((a) => ({ questionId: a.question_id, optionId: a.option_id })));

      db.prepare("DELETE FROM environment_metrics WHERE environment_id = ?").run(id);
      const insertMetric = db.prepare(
        "INSERT INTO environment_metrics (environment_id, cvss_version, metric, value, effect) VALUES (?, ?, ?, ?, ?)",
      );
      for (const m of derived) {
        insertMetric.run(id, m.cvssVersion, m.metric, m.value, m.effect);
      }

      db.prepare("UPDATE environments SET catalog_version = ?, updated_at = ? WHERE id = ?").run(
        CATALOG_VERSION,
        new Date().toISOString(),
        id,
      );
    });
    saveAndDerive();

    const env = getEnvironmentOr404(db, id);
    const answers = db.prepare("SELECT * FROM environment_answers WHERE environment_id = ?").all(id) as AnswerRow[];
    const metrics = db.prepare("SELECT * FROM environment_metrics WHERE environment_id = ?").all(id) as MetricRow[];
    return c.json({
      id: env.id,
      answers: answers.map((a) => ({ questionId: a.question_id, optionId: a.option_id })),
      metrics: metrics.map((m) => ({
        cvssVersion: m.cvss_version,
        metric: m.metric,
        value: m.value,
        effect: m.effect,
      })),
    });
  });

  app.delete("/environments/:id", (c) => {
    const id = Number(c.req.param("id"));
    getEnvironmentOr404(db, id);
    db.prepare("DELETE FROM environments WHERE id = ?").run(id);
    return c.body(null, 204);
  });

  return app;
}
