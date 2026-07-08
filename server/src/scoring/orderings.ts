// Severity orderings, most -> least severe, per SPEC.md §2.2/Appendix A.
// The AV/AC/AT/PR/UI rows are the ones that ever carry a `cap` effect in the
// v1 catalog (used by `isLessSevere` below); the rest (impact metrics,
// CR/IR/AR, v3.1 Scope) are always `override` and are only consulted by
// `severityDirection` to tell the UI whether a change made a vulnerability
// look more or less severe than the base vector.

export const ORDERINGS: Record<"4.0" | "3.1", Record<string, string[]>> = {
  "4.0": {
    AV: ["N", "A", "L", "P"],
    AC: ["L", "H"],
    AT: ["N", "P"],
    PR: ["N", "L", "H"],
    UI: ["N", "P", "A"],
    VC: ["H", "L", "N"],
    VI: ["H", "L", "N"],
    VA: ["H", "L", "N"],
    SC: ["H", "L", "N"],
    SI: ["S", "H", "L", "N"],
    SA: ["S", "H", "L", "N"],
    CR: ["H", "M", "L"],
    IR: ["H", "M", "L"],
    AR: ["H", "M", "L"],
  },
  "3.1": {
    AV: ["N", "A", "L", "P"],
    AC: ["L", "H"],
    PR: ["N", "L", "H"],
    UI: ["N", "R"],
    C: ["H", "L", "N"],
    I: ["H", "L", "N"],
    A: ["H", "L", "N"],
    S: ["C", "U"],
    CR: ["H", "M", "L"],
    IR: ["H", "M", "L"],
    AR: ["H", "M", "L"],
  },
};

// Every M-prefixed (or Modified-*) metric in the catalog corresponds to its
// base-vector counterpart by stripping the leading "M" — true uniformly for
// cap metrics (MAV->AV, MAT->AT, ...) and override metrics with a base
// counterpart (MVC->VC, MSI->SI, MS->S, ...). CR/IR/AR and the v4
// supplemental metrics (S, R, V, RE) don't start with "M" and have no base
// counterpart — they're always "Not Defined" in the base vector.
export function baseCounterpartMetric(metric: string): string | undefined {
  return metric.startsWith("M") ? metric.slice(1) : undefined;
}

// True if `capValue` is strictly less severe than `baseValue` for the given
// version/metric, per the SPEC.md §2.2 ordering (most severe first — a
// later index is less severe).
export function isLessSevere(version: "4.0" | "3.1", metric: string, capValue: string, baseValue: string): boolean {
  const ordering = ORDERINGS[version][metric];
  if (!ordering) throw new Error(`No severity ordering defined for ${version} ${metric}`);
  const capIndex = ordering.indexOf(capValue);
  const baseIndex = ordering.indexOf(baseValue);
  if (capIndex === -1) throw new Error(`Unknown value ${capValue} for ${version} ${metric}`);
  if (baseIndex === -1) throw new Error(`Unknown value ${baseValue} for ${version} ${metric}`);
  return capIndex > baseIndex;
}

// Whether changing `metric` from `fromValue` to `toValue` made the
// vulnerability look more severe ("worse"), less severe ("better"), or had
// no directional signal ("neutral") — used to render a per-line indicator
// in the UI's "why" panel. Falls back to "neutral" for any metric with no
// defined ordering (the v4.0 supplemental metrics S/R/V/RE are collected
// but never affect score, per SPEC.md §2.1, so they intentionally have no
// entry in ORDERINGS and always resolve here rather than throwing).
export function severityDirection(
  version: "4.0" | "3.1",
  metric: string,
  fromValue: string,
  toValue: string,
): "worse" | "better" | "neutral" {
  const ordering = ORDERINGS[version][metric];
  if (!ordering) return "neutral";

  // CR/IR/AR have no base-vector counterpart, so `fromValue` is always the
  // "X" (Not Defined) sentinel — but CVSS scores an unspecified Security
  // Requirement as equivalent to High, so treat "X" as "H" for these three
  // metrics specifically rather than as an unorderable value.
  const effectiveFrom = fromValue === "X" && (metric === "CR" || metric === "IR" || metric === "AR") ? "H" : fromValue;

  const fromIndex = ordering.indexOf(effectiveFrom);
  const toIndex = ordering.indexOf(toValue);
  if (fromIndex === -1 || toIndex === -1) return "neutral";
  if (toIndex < fromIndex) return "worse";
  if (toIndex > fromIndex) return "better";
  return "neutral";
}
