import type { Severity } from "./types.js";

// Mirrors server/src/scoring/severity.ts (SPEC.md §2.4 bands, shared by both
// CVSS versions). Duplicated here only for the results animation's
// in-transit color — the authoritative severity always comes from the API.
export function severityFromScore(score: number): Severity {
  if (score <= 0) return "None";
  if (score < 4.0) return "Low";
  if (score < 7.0) return "Medium";
  if (score < 9.0) return "High";
  return "Critical";
}
