// Severity bands (both CVSS versions share these bands).

export type Severity = "None" | "Low" | "Medium" | "High" | "Critical";

export function severityFromScore(score: number): Severity {
  if (score <= 0) return "None";
  if (score < 4.0) return "Low";
  if (score < 7.0) return "Medium";
  if (score < 9.0) return "High";
  return "Critical";
}
