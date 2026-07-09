import type { Severity } from "../types.js";

const SOLID_CLASS_BY_SEVERITY: Record<Severity, string> = {
  None: "pill pill-none",
  Low: "pill pill-low",
  Medium: "pill pill-medium",
  High: "pill pill-high",
  Critical: "pill pill-critical",
};

const OUTLINE_CLASS_BY_SEVERITY: Record<Severity, string> = {
  None: "badge-severity badge-severity-none",
  Low: "badge-severity badge-severity-low",
  Medium: "badge-severity badge-severity-medium",
  High: "badge-severity badge-severity-high",
  Critical: "badge-severity badge-severity-critical",
};

export function SeverityPill({
  severity,
  variant = "solid",
}: {
  severity: Severity;
  variant?: "solid" | "outline";
}) {
  const className = variant === "outline" ? OUTLINE_CLASS_BY_SEVERITY[severity] : SOLID_CLASS_BY_SEVERITY[severity];
  return <span className={className}>{severity}</span>;
}
