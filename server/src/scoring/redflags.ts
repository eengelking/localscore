// docs/SPEC05.md §3.2.2 — configuration "red flags": correlate stakes
// answers (Q5/Q6/Q7/Q9) with operational-readiness answers (Q10-Q12) to
// call out environments whose configuration doesn't match what they claim
// to protect. Unlike raising.ts (deliberately metric-level, so catalog
// evolution keeps working automatically), this module is catalog-coupled by
// design: these are human configuration judgments that only exist at the
// answer level, defended instead by a catalog-integrity test
// (server/test/environments-route.test.ts) asserting every questionId/
// optionId referenced below still exists in the shipped catalog.
//
// Deliberately: red flags never fire on stakes alone ("we don't want to
// flag the system JUST BECAUSE it has sensitive data") — every rule pairs a
// stakes condition with a readiness gap. Skipped/unanswered questions never
// satisfy a condition.
import type { Answer } from "../catalog/derive.js";

export interface RedFlagAnswer {
  questionId: string;
  optionId: string;
}

export interface RedFlag {
  id: string;
  answers: RedFlagAnswer[];
}

// Any of these being the environment's answer counts as "high stakes":
// Q5/Q6/Q7 "Catastrophic" or Q9 safety "yes".
const HIGH_STAKES_ANSWERS: RedFlagAnswer[] = [
  { questionId: "confidentiality", optionId: "catastrophic" },
  { questionId: "integrity", optionId: "catastrophic" },
  { questionId: "availability", optionId: "immediate" },
  { questionId: "safety", optionId: "yes" },
];

function matchingHighStakes(answerByQuestion: Map<string, string>): RedFlagAnswer[] {
  return HIGH_STAKES_ANSWERS.filter((a) => answerByQuestion.get(a.questionId) === a.optionId);
}

interface RedFlagRule {
  id: string;
  condition: (answerByQuestion: Map<string, string>) => boolean;
  provenance: (answerByQuestion: Map<string, string>) => RedFlagAnswer[];
}

const RULES: RedFlagRule[] = [
  {
    id: "uncertain_recovery",
    condition: (m) => matchingHighStakes(m).length > 0 && m.get("recovery") === "uncertain",
    provenance: (m) => [...matchingHighStakes(m), { questionId: "recovery", optionId: "uncertain" }],
  },
  {
    id: "concentrated_availability",
    condition: (m) => m.get("availability") === "immediate" && m.get("value_density") === "concentrated",
    provenance: () => [
      { questionId: "availability", optionId: "immediate" },
      { questionId: "value_density", optionId: "concentrated" },
    ],
  },
  {
    id: "hard_to_patch",
    condition: (m) => matchingHighStakes(m).length > 0 && m.get("patch_effort") === "hard",
    provenance: (m) => [...matchingHighStakes(m), { questionId: "patch_effort", optionId: "hard" }],
  },
];

// Every questionId/optionId pair referenced anywhere in RULES/HIGH_STAKES_ANSWERS,
// for the catalog-integrity test.
export const REFERENCED_ANSWERS: RedFlagAnswer[] = [
  ...HIGH_STAKES_ANSWERS,
  { questionId: "recovery", optionId: "uncertain" },
  { questionId: "availability", optionId: "immediate" },
  { questionId: "value_density", optionId: "concentrated" },
  { questionId: "patch_effort", optionId: "hard" },
];

export function computeRedFlags(answers: Answer[]): RedFlag[] {
  const answerByQuestion = new Map(answers.map((a) => [a.questionId, a.optionId]));
  const result: RedFlag[] = [];
  for (const rule of RULES) {
    if (!rule.condition(answerByQuestion)) continue;
    result.push({ id: rule.id, answers: rule.provenance(answerByQuestion) });
  }
  return result;
}
