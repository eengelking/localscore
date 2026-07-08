// Scoring engine. Wraps `ae-cvss-calculator` (evaluated against SPEC.md §10
// reference vectors before adoption — see server/test/scoring.test.ts) to
// implement the environmental-scoring rules in SPEC.md §2 and §6.

import type { DerivedMetric } from "../catalog/derive.js";
import { baseCounterpartMetric, isLessSevere } from "./orderings.js";
import type { CvssInstance, ParsedVector } from "./parse.js";
import { parseBaseVector } from "./parse.js";
import type { Severity } from "./severity.js";
import { severityFromScore } from "./severity.js";

export { parseBaseVector } from "./parse.js";
export type { CvssInstance, ParsedVector } from "./parse.js";
export type { Severity } from "./severity.js";
export { severityFromScore } from "./severity.js";

export interface ScoreResult {
  score: number;
  severity: Severity;
  vector: string;
}

export interface AppliedChange {
  metric: string;
  metricName: string;
  fromValue: string;
  fromValueName: string;
  toValue: string;
  toValueName: string;
  effect: "override" | "cap";
  questionId: string;
  optionId: string;
}

export function computeScore(instance: CvssInstance): ScoreResult {
  const scores = instance.calculateScores();
  const score = scores.overall ?? 0;
  return { score, severity: severityFromScore(score), vector: instance.toString() };
}

function componentName(instance: CvssInstance, metric: string): string {
  return instance.findComponent(metric)?.name ?? metric;
}

function valueName(instance: CvssInstance, metric: string, shortName: string): string {
  const values = instance.findComponent(metric)?.values ?? [];
  return values.find((v) => v.shortName === shortName)?.name ?? shortName;
}

function buildChange(instance: CvssInstance, m: DerivedMetric, fromValue: string): AppliedChange {
  return {
    metric: m.metric,
    metricName: componentName(instance, m.metric),
    fromValue,
    fromValueName: valueName(instance, m.metric, fromValue),
    toValue: m.value,
    toValueName: valueName(instance, m.metric, m.value),
    effect: m.effect,
    questionId: m.questionId,
    optionId: m.optionId,
  };
}

// Mutates `parsed.instance` in place, applying the environment's derived
// metrics per SPEC.md §2.2/§6.2: `override` always wins; `cap` only applies
// if it's less severe than the base vector's corresponding metric. Returns
// the list of changes that were actually applied (skipped caps are omitted).
export function applyEnvironment(parsed: ParsedVector, metrics: DerivedMetric[]): AppliedChange[] {
  const relevant = metrics.filter((m) => m.cvssVersion === parsed.version);
  const changes: AppliedChange[] = [];

  for (const m of relevant) {
    const baseMetric = baseCounterpartMetric(m.metric);

    if (m.effect === "override") {
      const fromValue = baseMetric ? parsed.instance.getComponentByString(baseMetric).shortName : "X";
      parsed.instance.applyComponentString(m.metric, m.value);
      changes.push(buildChange(parsed.instance, m, fromValue));
      continue;
    }

    // effect === "cap" — always has a base counterpart in the v1 catalog.
    if (!baseMetric) continue;
    const baseValue = parsed.instance.getComponentByString(baseMetric).shortName;
    if (isLessSevere(parsed.version, baseMetric, m.value, baseValue)) {
      parsed.instance.applyComponentString(m.metric, m.value);
      changes.push(buildChange(parsed.instance, m, baseValue));
    }
  }

  return changes;
}

// Scores `rawVector` against one environment's derived metrics. Re-parses
// the base vector fresh so each environment gets an independent instance.
export function scoreForEnvironment(
  rawVector: string,
  metrics: DerivedMetric[],
): { result: ScoreResult; changes: AppliedChange[] } {
  const parsed = parseBaseVector(rawVector);
  const changes = applyEnvironment(parsed, metrics);
  return { result: computeScore(parsed.instance), changes };
}
