import { describe, expect, it } from "vitest";
import type { DerivedMetric } from "../src/catalog/derive.js";
import { deriveMetrics } from "../src/catalog/derive.js";
import { applyEnvironment, computeScore, parseBaseVector, scoreForEnvironment } from "../src/scoring/index.js";
import { severityFromScore } from "../src/scoring/severity.js";

// SPEC.md §10.1: reference score parity against FIRST's calculators.
describe("reference score parity", () => {
  const v31BaseVectors: [string, number][] = [
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", 9.8], // Critical
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:H/A:H", 10.0], // Critical, scope changed
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:N/A:N", 7.5], // High
    ["CVSS:3.1/AV:A/AC:L/PR:L/UI:R/S:U/C:L/I:L/A:N", 4.1], // Medium
    ["CVSS:3.1/AV:P/AC:H/PR:H/UI:R/S:U/C:L/I:N/A:N", 1.6], // Low
    ["CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:N", 0.0], // None
  ];

  it.each(v31BaseVectors)("v3.1 base %s -> %s", (vector, expected) => {
    const parsed = parseBaseVector(vector);
    expect(computeScore(parsed.instance).score).toBe(expected);
  });

  const v40BaseVectors: [string, number][] = [
    ["CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:H/SI:H/SA:H", 10.0], // Critical
    ["CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N", 9.3], // Critical
    ["CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:N/VI:N/VA:N/SC:N/SI:N/SA:N", 0.0], // None
  ];

  it.each(v40BaseVectors)("v4.0 base %s -> %s", (vector, expected) => {
    const parsed = parseBaseVector(vector);
    expect(computeScore(parsed.instance).score).toBe(expected);
  });

  it("severity bands match SPEC.md §2.4 for both versions", () => {
    expect(severityFromScore(0.0)).toBe("None");
    expect(severityFromScore(0.1)).toBe("Low");
    expect(severityFromScore(3.9)).toBe("Low");
    expect(severityFromScore(4.0)).toBe("Medium");
    expect(severityFromScore(6.9)).toBe("Medium");
    expect(severityFromScore(7.0)).toBe("High");
    expect(severityFromScore(8.9)).toBe("High");
    expect(severityFromScore(9.0)).toBe("Critical");
    expect(severityFromScore(10.0)).toBe("Critical");
  });

  // The worked example from SPEC.md §6, required to match exactly.
  it("worked example: 9.8 base -> 0.0 for the Disposable Dev Lab profile", () => {
    const parsed = parseBaseVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
    expect(computeScore(parsed.instance).score).toBe(9.8);

    const metrics: DerivedMetric[] = [
      { cvssVersion: "3.1", metric: "MAV", value: "A", effect: "cap", questionId: "reachability", optionId: "internal_only" },
      { cvssVersion: "3.1", metric: "CR", value: "L", effect: "override", questionId: "confidentiality", optionId: "nothing" },
      { cvssVersion: "3.1", metric: "MC", value: "N", effect: "override", questionId: "confidentiality", optionId: "nothing" },
      { cvssVersion: "3.1", metric: "IR", value: "L", effect: "override", questionId: "integrity", optionId: "nothing" },
      { cvssVersion: "3.1", metric: "MI", value: "N", effect: "override", questionId: "integrity", optionId: "nothing" },
      { cvssVersion: "3.1", metric: "AR", value: "L", effect: "override", questionId: "availability", optionId: "nobody" },
      { cvssVersion: "3.1", metric: "MA", value: "N", effect: "override", questionId: "availability", optionId: "nobody" },
      { cvssVersion: "3.1", metric: "MS", value: "U", effect: "override", questionId: "blast_radius", optionId: "dead_end" },
    ];

    const { result } = scoreForEnvironment("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", metrics);
    expect(result.score).toBe(0.0);
    expect(result.severity).toBe("None");
  });

  it("worked example reproduced end-to-end via the real catalog derivation", () => {
    const metrics = deriveMetrics([
      { questionId: "reachability", optionId: "internal_only" },
      { questionId: "confidentiality", optionId: "nothing" },
      { questionId: "integrity", optionId: "nothing" },
      { questionId: "availability", optionId: "nobody" },
      { questionId: "blast_radius", optionId: "dead_end" },
    ]);
    const { result } = scoreForEnvironment("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", metrics);
    expect(result.score).toBe(0.0);
  });
});

// SPEC.md §10.2: an environment with zero answers reproduces the base score
// bit-for-bit, for both versions.
describe("empty-profile identity", () => {
  it("v3.1: no derived metrics leaves the base score unchanged", () => {
    const { result } = scoreForEnvironment("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", []);
    expect(result.score).toBe(9.8);
  });

  it("v4.0: no derived metrics leaves the base score unchanged", () => {
    const { result } = scoreForEnvironment(
      "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N",
      [],
    );
    expect(result.score).toBe(9.3);
  });
});

// SPEC.md §10.3 and §2.2: cap only applies if it's strictly less severe than
// the base value; override always wins; Q9 safety beats Q8 blast-radius.
describe("cap/override behavior", () => {
  it("cap applies: AV:N base + internal-only (MAV:A cap) downgrades effective AV", () => {
    const metrics: DerivedMetric[] = [
      { cvssVersion: "3.1", metric: "MAV", value: "A", effect: "cap", questionId: "reachability", optionId: "internal_only" },
    ];
    const base = parseBaseVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
    const noCap = computeScore(base.instance).score;
    const { result } = scoreForEnvironment("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", metrics);
    expect(result.score).toBeLessThan(noCap);
    expect(result.vector).toContain("MAV:A");
  });

  it("cap does not apply: AV:L base MUST NOT be raised by a MAV:A cap (SPEC.md §2.2 worked example)", () => {
    const metrics: DerivedMetric[] = [
      { cvssVersion: "3.1", metric: "MAV", value: "A", effect: "cap", questionId: "reachability", optionId: "internal_only" },
    ];
    const { result } = scoreForEnvironment("CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", metrics);
    // "A" (adjacent) is more severe than "L" (local) per the AV ordering
    // N > A > L > P, so the cap must be skipped and MAV must not appear.
    expect(result.vector).not.toContain("MAV:A");
  });

  it("cap applies in the other direction too: AV:L base + no-network (MAV:P cap) downgrades further", () => {
    const metrics: DerivedMetric[] = [
      { cvssVersion: "3.1", metric: "MAV", value: "P", effect: "cap", questionId: "reachability", optionId: "no_network" },
    ];
    const { result } = scoreForEnvironment("CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", metrics);
    // "P" (physical) is less severe than "L" (local), so the cap applies.
    expect(result.vector).toContain("MAV:P");
  });

  it("override always applies regardless of base value", () => {
    const metrics: DerivedMetric[] = [
      { cvssVersion: "3.1", metric: "CR", value: "H", effect: "override", questionId: "confidentiality", optionId: "catastrophic" },
    ];
    const { result } = scoreForEnvironment("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H", metrics);
    expect(result.vector).toContain("CR:H");
  });

  it("Q9 safety override wins over Q8 blast-radius for MSI/MSA (conflict rule, SPEC.md §5.3)", () => {
    const metrics = deriveMetrics([
      { questionId: "blast_radius", optionId: "stepping_stone" },
      { questionId: "safety", optionId: "yes" },
    ]);
    const { result } = scoreForEnvironment(
      "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N",
      metrics,
    );
    expect(result.vector).toContain("MSI:S");
    expect(result.vector).toContain("MSA:S");
  });

  it("blast-radius can legitimately raise a score above base (SPEC.md §2.2 exception)", () => {
    const base = parseBaseVector("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:L/VA:L/SC:N/SI:N/SA:N");
    const baseScore = computeScore(base.instance).score;

    const metrics = deriveMetrics([{ questionId: "blast_radius", optionId: "stepping_stone" }]);
    const { result } = scoreForEnvironment(
      "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:L/VI:L/VA:L/SC:N/SI:N/SA:N",
      metrics,
    );
    expect(result.score).toBeGreaterThan(baseScore);
  });

  it("supplemental metrics (S, R, V, RE) never change the v4.0 score (display-only)", () => {
    const metrics = deriveMetrics([
      { questionId: "safety", optionId: "yes" },
      { questionId: "recovery", optionId: "manual" },
      { questionId: "value_density", optionId: "concentrated" },
      { questionId: "patch_effort", optionId: "hard" },
    ]);
    const withoutSupplemental = metrics.filter((m) => !["S", "R", "V", "RE"].includes(m.metric));

    const base = "CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N";
    const { result: full } = scoreForEnvironment(base, metrics);
    const { result: partial } = scoreForEnvironment(base, withoutSupplemental);
    // "safety" also emits a real scoring effect (MSI/MSA:S) so scores should
    // match between the two runs — S itself must not move the number.
    expect(full.score).toBe(partial.score);
  });
});

// SPEC.md §10.5: parsing.
describe("vector parsing", () => {
  it("parses a valid v4.0 vector", () => {
    const parsed = parseBaseVector("CVSS:4.0/AV:N/AC:L/AT:N/PR:N/UI:N/VC:H/VI:H/VA:H/SC:N/SI:N/SA:N");
    expect(parsed.version).toBe("4.0");
  });

  it("parses a valid v3.1 vector", () => {
    const parsed = parseBaseVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
    expect(parsed.version).toBe("3.1");
  });

  it("scores v3.0 vectors using v3.1 equations, with a disclosed note (SPEC.md §2.5)", () => {
    const parsed = parseBaseVector("CVSS:3.0/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
    expect(parsed.version).toBe("3.1");
    expect(parsed.note).toMatch(/v3\.1 equations/i);
  });

  it("rejects CVSS:2.0/ vectors with a friendly message, not a stack trace", () => {
    expect(() => parseBaseVector("CVSS:2.0/AV:N/AC:L/Au:N/C:C/I:C/A:C")).toThrowError(/v2\.0 isn't supported/i);
  });

  it("rejects bare (unprefixed) v2 vectors", () => {
    expect(() => parseBaseVector("AV:N/AC:L/Au:N/C:C/I:C/A:C")).toThrowError(/v2\.0 isn't supported/i);
  });

  it("rejects an unrecognized format with a friendly message", () => {
    expect(() => parseBaseVector("not a vector")).toThrowError(/Unrecognized CVSS vector format/i);
  });

  it("rejects an invalid metric value with a specific, friendly message", () => {
    // "Z" isn't a value AV recognizes at all (unlike "X", which is the
    // legitimate "Not Defined" enum member — see the next test).
    expect(() => parseBaseVector("CVSS:3.1/AV:Z/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toThrowError(/AV:Z/);
  });

  it("rejects a vector missing required base metrics", () => {
    expect(() => parseBaseVector("CVSS:3.1/AV:N/AC:L")).toThrowError(/required base metrics/i);
  });

  it("treats AV:X (Not Defined) as an incomplete base vector, not a silent no-op", () => {
    // "X" is a real enum member (shortName for "Not Defined"), so the
    // library accepts it without erroring — but a base metric left "Not
    // Defined" means the base vector isn't actually complete.
    expect(() => parseBaseVector("CVSS:3.1/AV:X/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H")).toThrowError(/required base metrics/i);
  });

  it("§2.5 precedence: environment values win over a pasted vector's own environmental metrics, vector fills the rest", () => {
    // Vector already carries MAV:A and MPR:H manually.
    const raw = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H/MAV:A/MPR:H";
    const base = parseBaseVector(raw);
    expect(base.instance.isAnyEnvironmentalDefined()).toBe(true);

    // Environment defines MAV (should override the pasted MAV:A -> stays not
    // more severe, but here we assert the environment's own cap logic runs
    // against the *base* AV, not the pasted MAV) and leaves MPR untouched.
    const metrics: DerivedMetric[] = [
      { cvssVersion: "3.1", metric: "MAV", value: "P", effect: "cap", questionId: "reachability", optionId: "no_network" },
    ];
    const { result } = scoreForEnvironment(raw, metrics);
    expect(result.vector).toContain("MAV:P"); // environment's value wins
    expect(result.vector).toContain("MPR:H"); // untouched pasted value survives
  });
});

// SPEC.md §10.6 (API shape, exercised more fully in score-route.test.ts).
describe("applyEnvironment change reporting", () => {
  it("reports applied changes with human-readable names and provenance", () => {
    const base = parseBaseVector("CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
    const metrics: DerivedMetric[] = [
      { cvssVersion: "3.1", metric: "MAV", value: "A", effect: "cap", questionId: "reachability", optionId: "internal_only" },
    ];
    const changes = applyEnvironment(base, metrics);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      metric: "MAV",
      fromValue: "N",
      toValue: "A",
      questionId: "reachability",
      optionId: "internal_only",
    });
    expect(changes[0].metricName.length).toBeGreaterThan(0);
    expect(changes[0].toValueName.length).toBeGreaterThan(0);
  });

  it("skipped caps produce no change entry", () => {
    const base = parseBaseVector("CVSS:3.1/AV:L/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H");
    const metrics: DerivedMetric[] = [
      { cvssVersion: "3.1", metric: "MAV", value: "A", effect: "cap", questionId: "reachability", optionId: "internal_only" },
    ];
    expect(applyEnvironment(base, metrics)).toHaveLength(0);
  });
});
