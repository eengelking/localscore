// docs/SPEC04.md §4.1: which derived overrides can push a modified score
// above its base score. `cap` effects never raise severity by definition
// (SPEC01 §2.2), so only `override` effects are ever checked here; encode
// the rule as metric+value pairs, not question IDs, so catalog evolution
// keeps working without touching this file.
import type { CvssVersion } from "../catalog/types.js";
import type { DerivedMetric } from "../catalog/derive.js";

const RAISING_VALUES: Record<CvssVersion, Record<string, Set<string>>> = {
  "4.0": {
    CR: new Set(["H"]),
    IR: new Set(["H"]),
    AR: new Set(["H"]),
    MSC: new Set(["H"]),
    MSI: new Set(["H", "S"]),
    MSA: new Set(["H", "S"]),
  },
  "3.1": {
    CR: new Set(["H"]),
    IR: new Set(["H"]),
    AR: new Set(["H"]),
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
