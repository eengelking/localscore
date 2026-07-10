import { Hono } from "hono";
import type Database from "better-sqlite3";
import { deriveMetrics } from "../catalog/derive.js";
import { HttpError } from "../lib/errors.js";
import { computeScore, parseBaseVector, scoreForEnvironment } from "../scoring/index.js";
import type { AnsweredQuestionNote } from "../scoring/index.js";

interface EnvironmentRow {
  id: number;
  name: string;
}

interface AnswerRow {
  question_id: string;
  option_id: string;
}

// POST /api/score — scores a pasted vector against the base metrics, then
// against every saved environment's derived metrics.
export function scoreRoutes(db: Database.Database) {
  const app = new Hono();

  app.post("/score", async (c) => {
    const body = await c.req.json<{ vector?: string }>().catch(() => ({}) as { vector?: string });
    if (!body.vector || !body.vector.trim()) {
      throw new HttpError(400, "vector is required");
    }

    const base = parseBaseVector(body.vector);
    const baseResult = computeScore(base.instance);

    const envs = db.prepare("SELECT id, name FROM environments ORDER BY name").all() as EnvironmentRow[];

    const scored: {
      id: number;
      name: string;
      hasProfile: true;
      score: number;
      severity: string;
      vector: string;
      delta: number;
      changes: ReturnType<typeof scoreForEnvironment>["changes"];
      notes: AnsweredQuestionNote[];
    }[] = [];
    const unscored: { id: number; name: string; hasProfile: false }[] = [];

    for (const env of envs) {
      const answers = db
        .prepare("SELECT question_id, option_id FROM environment_answers WHERE environment_id = ?")
        .all(env.id) as AnswerRow[];

      const derived = deriveMetrics(answers.map((a) => ({ questionId: a.question_id, optionId: a.option_id })));
      const hasProfile = derived.some((m) => m.cvssVersion === base.version);

      if (!hasProfile) {
        unscored.push({ id: env.id, name: env.name, hasProfile: false });
        continue;
      }

      const { result, changes, notes } = scoreForEnvironment(
        body.vector,
        derived,
        answers.map((a) => ({ questionId: a.question_id, optionId: a.option_id })),
      );
      scored.push({
        id: env.id,
        name: env.name,
        hasProfile: true,
        score: result.score,
        severity: result.severity,
        vector: result.vector,
        delta: Math.round((result.score - baseResult.score) * 10) / 10,
        changes,
        notes,
      });
    }

    scored.sort((a, b) => b.score - a.score);

    return c.json({
      base: {
        version: base.version,
        vector: baseResult.vector,
        score: baseResult.score,
        severity: baseResult.severity,
        note: base.note,
        // The UI should warn when the pasted vector already carried
        // environmental metrics, since environment profiles take
        // precedence over them for any metric the profile defines.
        pastedVectorHasEnvironmentalMetrics: base.instance.isAnyEnvironmentalDefined(),
      },
      environments: [...scored, ...unscored],
    });
  });

  return app;
}
