import type { Severity } from "../types.js";

const CLASS_BY_SEVERITY: Record<Severity, string> = {
  None: "pill pill-none",
  Low: "pill pill-low",
  Medium: "pill pill-medium",
  High: "pill pill-high",
  Critical: "pill pill-critical",
};

export function SeverityPill({ severity }: { severity: Severity }) {
  return <span className={CLASS_BY_SEVERITY[severity]}>{severity}</span>;
}
