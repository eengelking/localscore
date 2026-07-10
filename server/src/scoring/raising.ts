// Which derived overrides can push a modified score above its base score.
// `cap` effects never raise severity by definition, so only `override`
// effects are ever checked here; encode the rule as metric+value pairs, not
// question IDs, so catalog evolution keeps working without touching this
// file.
//
// An earlier version of this rule also flagged CR/IR/AR = H (Q5/Q6/Q7
// "Catastrophic") as raising, but that over-triggered: an environment that
// legitimately has a lot to lose (e.g. a government IL6 system) got flagged
// permanently, which makes the flag meaningless exactly where stakes are
// highest. CR/IR/AR were dropped from the trigger set (with explicit
// maintainer sign-off) — the remaining set is exactly the structural facts
// (blast radius, safety) that represent a deliberate above-base exception,
// i.e. something about the environment's *position*, not merely its
// stakes. Note the accepted trade-off: a CR/IR/AR-only profile can still
// produce `delta > 0` on the scoring page without carrying this flag;
// that's intentional (stakes are not a misconfiguration) and is what the
// redflags.ts module exists to catch instead, in combination with
// readiness answers.
import type { CvssVersion } from "../catalog/types.js";
import type { DerivedMetric } from "../catalog/derive.js";

const RAISING_VALUES: Record<CvssVersion, Record<string, Set<string>>> = {
  "4.0": {
    MSC: new Set(["H"]),
    MSI: new Set(["H", "S"]),
    MSA: new Set(["H", "S"]),
  },
  "3.1": {
    MS: new Set(["C"]),
  },
};

function isRaisingEffect(metric: DerivedMetric): boolean {
  if (metric.effect !== "override") return false;
  return RAISING_VALUES[metric.cvssVersion][metric.metric]?.has(metric.value) ?? false;
}

export interface RaisingAnswer {
  questionId: string;
  optionId: string;
}

export interface RaisesScores {
  "4.0": boolean;
  "3.1": boolean;
}

export function computeRaisesScores(derived: DerivedMetric[]): RaisesScores {
  const raising = derived.filter(isRaisingEffect);
  return {
    "4.0": raising.some((m) => m.cvssVersion === "4.0"),
    "3.1": raising.some((m) => m.cvssVersion === "3.1"),
  };
}

// Deduplicated by questionId+optionId — a single answer (e.g. Q8's stepping
// stone option) can produce multiple raising metrics at once (MSC/MSI/MSA),
// but should only be listed once.
export function computeRaisingAnswers(derived: DerivedMetric[]): RaisingAnswer[] {
  const raising = derived.filter(isRaisingEffect);
  const seen = new Set<string>();
  const result: RaisingAnswer[] = [];
  for (const m of raising) {
    const key = `${m.questionId}:${m.optionId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ questionId: m.questionId, optionId: m.optionId });
  }
  return result;
}
