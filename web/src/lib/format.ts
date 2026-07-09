// Shared "+1.0" / "-0.9" / "±0.0" formatting for any signed CVSS score delta
// — used for both the row-level environment delta and the per-line change
// impact in the "why" panel, so the two always read consistently.
export function formatSignedScore(n: number): string {
  if (n === 0) return "±0.0";
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
}
