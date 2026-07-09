// Severity orderings for cap comparisons, most -> least severe.
// docs/SPEC01.md §2.2. Only exploitability metrics ever carry a `cap` effect in the
// v1 catalog (MAV, MAC/MAT, MPR, MUI) — CR/IR/AR, impact M-metrics, MS/MSC/MSI/MSA,
// and supplemental metrics are always `override`.

export const ORDERINGS: Record<"4.0" | "3.1", Record<string, string[]>> = {
  "4.0": {
    AV: ["N", "A", "L", "P"],
    AC: ["L", "H"],
    AT: ["N", "P"],
    PR: ["N", "L", "H"],
    UI: ["N", "P", "A"],
  },
  "3.1": {
    AV: ["N", "A", "L", "P"],
    AC: ["L", "H"],
    PR: ["N", "L", "H"],
    UI: ["N", "R"],
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
// version/metric, per the docs/SPEC01.md §2.2 ordering (most severe first — a
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
