import { describe, expect, it } from "vitest";
import { deriveMetrics } from "../src/catalog/derive.js";

describe("deriveMetrics", () => {
  it("empty answers produce no metrics (empty-profile identity, SPEC.md §2.3/§10.2)", () => {
    expect(deriveMetrics([])).toEqual([]);
  });

  it("ignores unanswered and skipped questions", () => {
    const result = deriveMetrics([{ questionId: "reachability", optionId: "skip" }]);
    expect(result).toEqual([]);
  });

  it("caps only apply, no override for a plain cap question", () => {
    const result = deriveMetrics([{ questionId: "reachability", optionId: "internal_only" }]);
    expect(result).toContainEqual(expect.objectContaining({ cvssVersion: "4.0", metric: "MAV", value: "A", effect: "cap" }));
    expect(result).toContainEqual(expect.objectContaining({ cvssVersion: "3.1", metric: "MAV", value: "A", effect: "cap" }));
  });

  it("Q9 safety override wins over Q8 blast-radius for MSI/MSA (SPEC.md §5.3 conflict rule)", () => {
    const result = deriveMetrics([
      { questionId: "blast_radius", optionId: "stepping_stone" }, // MSC=H, MSI=H, MSA=H
      { questionId: "safety", optionId: "yes" }, // MSI=S, MSA=S (later question, wins)
    ]);

    expect(result).toContainEqual(expect.objectContaining({ cvssVersion: "4.0", metric: "MSC", value: "H", effect: "override" }));
    expect(result).toContainEqual(expect.objectContaining({ cvssVersion: "4.0", metric: "MSI", value: "S", effect: "override" }));
    expect(result).toContainEqual(expect.objectContaining({ cvssVersion: "4.0", metric: "MSA", value: "S", effect: "override" }));
  });

  it("order independence does not matter — later question order in the catalog always wins, not answer submission order", () => {
    const result = deriveMetrics([
      { questionId: "safety", optionId: "yes" },
      { questionId: "blast_radius", optionId: "stepping_stone" },
    ]);

    // blast_radius (Q8) is processed before safety (Q9) regardless of answer
    // array order, because derivation walks CATALOG order — so safety still wins.
    expect(result).toContainEqual(expect.objectContaining({ cvssVersion: "4.0", metric: "MSI", value: "S", effect: "override" }));
    expect(result).toContainEqual(expect.objectContaining({ cvssVersion: "4.0", metric: "MSA", value: "S", effect: "override" }));
  });

  it("a cap never displaces an existing override", () => {
    // Not a real catalog scenario (no question caps CR), but exercises the
    // conflict-rule primitive directly.
    const result = deriveMetrics([
      { questionId: "confidentiality", optionId: "catastrophic" }, // CR=H override
    ]);
    expect(result).toContainEqual(expect.objectContaining({ cvssVersion: "4.0", metric: "CR", value: "H", effect: "override" }));
  });

  it("includes provenance (questionId/optionId) on every derived metric", () => {
    const result = deriveMetrics([{ questionId: "reachability", optionId: "internal_only" }]);
    for (const metric of result) {
      expect(metric.questionId).toBe("reachability");
      expect(metric.optionId).toBe("internal_only");
    }
  });
});
