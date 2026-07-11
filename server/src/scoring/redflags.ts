// Configuration "red flags": correlate stakes answers (Q5/Q6/Q7/Q9) with
// operational-readiness answers (Q10-Q12) to call out environments whose
// configuration doesn't match what they claim to protect. Unlike
// raising.ts (deliberately metric-level, so catalog
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
  {
    id: "exposed_high_stakes",
    condition: (m) =>
      matchingHighStakes(m).length > 0 &&
      m.get("reachability") === "internet" &&
      m.get("network_protections") === "basic",
    provenance: (m) => [
      ...matchingHighStakes(m),
      { questionId: "reachability", optionId: "internet" },
      { questionId: "network_protections", optionId: "basic" },
    ],
  },
  {
    id: "open_access_high_stakes",
    // Air-gapped locations are exempted: "anyone can log in, no account
    // needed" is a meaningfully different risk when there's no network path
    // for an outsider to reach that login in the first place, versus the
    // same open-access posture on a reachable system.
    condition: (m) =>
      matchingHighStakes(m).length > 0 &&
      m.get("accounts") === "anyone" &&
      m.get("reachability") !== "no_network",
    provenance: (m) => [...matchingHighStakes(m), { questionId: "accounts", optionId: "anyone" }],
  },
];

// Candidates considered and rejected during the Q1-12 audit, kept here so the
// reasoning isn't re-litigated on the next pass:
//
// - "interactive human use + safety-critical" (human_use=interactive +
//   safety=yes): rejected. Interactivity is an attack-surface fact (a human
//   is present to click something), not a readiness/exposure gap the way
//   "basic protections" or "no account required" are. Pairing it with
//   safety stakes would flag plenty of properly-secured, actively-staffed
//   safety-critical sites for no operational reason, closer to flagging on
//   stakes alone than the existing rules.
// - "concentrated value density + uncertain recovery" (value_density=
//   concentrated + recovery=uncertain): rejected. Value density is a v4
//   supplemental/display-only signal, not one of the HIGH_STAKES_ANSWERS
//   magnitudes (CR/IR/AR/safety), so this combination could fire for an
//   environment with low confidentiality/integrity/availability stakes
//   just because one box happens to be a hypervisor with a shaky recovery
//   story. That's the same over-triggering failure mode CR/IR/AR=H hit in
//   raising.ts, so it's left out.

// Every questionId/optionId pair referenced anywhere in RULES/HIGH_STAKES_ANSWERS,
// for the catalog-integrity test.
export const REFERENCED_ANSWERS: RedFlagAnswer[] = [
  ...HIGH_STAKES_ANSWERS,
  { questionId: "recovery", optionId: "uncertain" },
  { questionId: "availability", optionId: "immediate" },
  { questionId: "value_density", optionId: "concentrated" },
  { questionId: "patch_effort", optionId: "hard" },
  { questionId: "reachability", optionId: "internet" },
  { questionId: "reachability", optionId: "no_network" },
  { questionId: "network_protections", optionId: "basic" },
  { questionId: "accounts", optionId: "anyone" },
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
