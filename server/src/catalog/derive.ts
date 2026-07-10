// Derivation rules: process answered questions in catalog order; a later
// question's `override` always wins over an earlier value; a `cap` never
// displaces an existing `override`.

import { CATALOG } from "./catalog.js";
import type { CvssVersion, EffectType } from "./types.js";

export interface Answer {
  questionId: string;
  optionId: string;
}

export interface DerivedMetric {
  cvssVersion: CvssVersion;
  metric: string;
  value: string;
  effect: EffectType;
  // The question/option that produced this metric's *current* (winning)
  // value — useful for building "why did this change" explanations. Not
  // persisted in environment_metrics; recomputed on demand.
  questionId: string;
  optionId: string;
}

export function deriveMetrics(answers: Answer[]): DerivedMetric[] {
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a.optionId]));
  const result = new Map<string, DerivedMetric>(); // key: `${version}:${metric}`

  for (const question of CATALOG) {
    const optionId = answerByQuestion.get(question.id);
    if (!optionId) continue;

    const option = question.options.find((o) => o.id === optionId);
    if (!option) continue; // unknown option id (e.g. stale answer after a catalog change) — ignore

    for (const effect of option.effects) {
      const key = `${effect.version}:${effect.metric}`;
      const existing = result.get(key);

      if (effect.effect === "override") {
        result.set(key, {
          cvssVersion: effect.version,
          metric: effect.metric,
          value: effect.value,
          effect: "override",
          questionId: question.id,
          optionId: option.id,
        });
        continue;
      }

      // effect.effect === "cap": never displace an existing override.
      if (existing?.effect === "override") continue;
      result.set(key, {
        cvssVersion: effect.version,
        metric: effect.metric,
        value: effect.value,
        effect: "cap",
        questionId: question.id,
        optionId: option.id,
      });
    }
  }

  return [...result.values()];
}
