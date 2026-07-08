// Scoring engine. Wraps `ae-cvss-calculator` (evaluated against SPEC.md §10
// reference vectors before adoption — see server/test/scoring.test.ts) to
// implement the environmental-scoring rules in SPEC.md §2 and §6.

import { CATALOG } from "../catalog/catalog.js";
import type { Answer, DerivedMetric } from "../catalog/derive.js";
import type { CvssVersion } from "../catalog/types.js";
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

export interface AnsweredQuestionNote {
  questionId: string;
  question: string;
  optionId: string;
  optionLabel: string;
  status: "no-effect" | "capped-by-base" | "not-applicable-to-version";
  reason: string;
}

// Explains every answered (non-"skip") question that did *not* produce a
// visible change in `changes`, so the why-panel can account for the full
// interview instead of silently dropping answers that turned out to be
// no-ops. Re-parses `rawVector` fresh so base-metric lookups reflect the
// unmodified vector even though `changes` were applied in place elsewhere.
export function explainUnappliedAnswers(
  rawVector: string,
  version: CvssVersion,
  answers: Answer[],
  changes: AppliedChange[],
): AnsweredQuestionNote[] {
  const base = parseBaseVector(rawVector).instance;
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a.optionId]));
  const applied = new Set(changes.map((c) => `${c.questionId}:${c.optionId}`));
  const notes: AnsweredQuestionNote[] = [];

  for (const question of CATALOG) {
    const optionId = answerByQuestion.get(question.id);
    if (!optionId || optionId === "skip") continue;

    const option = question.options.find((o) => o.id === optionId);
    if (!option) continue;
    if (applied.has(`${question.id}:${optionId}`)) continue;

    const questionAppliesToVersion = question.options.some((o) => o.effects.some((e) => e.version === version));
    if (!questionAppliesToVersion) {
      notes.push({
        questionId: question.id,
        question: question.question,
        optionId,
        optionLabel: option.label,
        status: "not-applicable-to-version",
        reason: `This question doesn't affect CVSS v${version} scoring — it has no effect on this vector.`,
      });
      continue;
    }

    const versionEffect = option.effects.find((e) => e.version === version);
    if (!versionEffect) {
      notes.push({
        questionId: question.id,
        question: question.question,
        optionId,
        optionLabel: option.label,
        status: "no-effect",
        reason: "This is already the least-restrictive case for this question, so it didn't change the score.",
      });
      continue;
    }

    // A `cap` that wasn't less severe than the base vector's own value —
    // applyEnvironment dropped it silently, so explain why here.
    const baseMetric = baseCounterpartMetric(versionEffect.metric);
    const metricName = baseMetric ? componentName(base, baseMetric) : versionEffect.metric;
    const baseValue = baseMetric ? base.getComponentByString(baseMetric).shortName : undefined;
    const baseValueName = baseMetric && baseValue ? valueName(base, baseMetric, baseValue) : undefined;
    notes.push({
      questionId: question.id,
      question: question.question,
      optionId,
      optionLabel: option.label,
      status: "capped-by-base",
      reason: baseValueName
        ? `The pasted vector's ${metricName} is already ${baseValueName}, which is at least as severe — this answer had nothing to loosen.`
        : `The pasted vector's ${metricName} was already at least as severe — this answer had nothing to loosen.`,
    });
  }

  return notes;
}

// Scores `rawVector` against one environment's derived metrics. Re-parses
// the base vector fresh so each environment gets an independent instance.
export function scoreForEnvironment(
  rawVector: string,
  metrics: DerivedMetric[],
  answers: Answer[] = [],
): { result: ScoreResult; changes: AppliedChange[]; notes: AnsweredQuestionNote[] } {
  const parsed = parseBaseVector(rawVector);
  const changes = applyEnvironment(parsed, metrics);
  const notes = explainUnappliedAnswers(rawVector, parsed.version, answers, changes);
  return { result: computeScore(parsed.instance), changes, notes };
}
