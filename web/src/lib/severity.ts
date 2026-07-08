import type { Severity } from "../types.js";

const KNOWN_SEVERITIES: Record<string, Severity> = {
  NONE: "None",
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

function severityFromScore(baseScore: number): Severity {
  if (baseScore <= 0) return "None";
  if (baseScore < 4.0) return "Low";
  if (baseScore < 7.0) return "Medium";
  if (baseScore < 9.0) return "High";
  return "Critical";
}

export function nvdSeverityToAppSeverity(raw: string, baseScore: number): Severity {
  return KNOWN_SEVERITIES[raw.toUpperCase()] ?? severityFromScore(baseScore);
}
