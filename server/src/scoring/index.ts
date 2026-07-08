// Scoring engine — not implemented yet.
//
// Before writing any code here, per SPEC.md §2.4:
//   1. Evaluate `ae-cvss-calculator` (or another maintained TS library
//      covering CVSS 3.1 and 4.0) against the reference test vectors in
//      SPEC.md §10, OR vendor FIRST's official reference implementations.
//   2. Hand-rolled scoring math without reference-validated test vectors
//      is explicitly not acceptable.
//
// Once a library is chosen, this module should expose something like:
//   parseVector(vector: string): ParsedVector
//   applyEnvironment(base: ParsedVector, metrics: DerivedMetric[]): ParsedVector
//   score(vector: ParsedVector): { score: number; severity: Severity }
export {};
