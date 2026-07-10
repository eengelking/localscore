import { describe, expect, it } from "vitest";
import { CATALOG, CATALOG_VERSION } from "../src/catalog/index.js";

// Catalog integrity:
//  - every option's effects reference valid metrics for the declared version
//  - every scoring-relevant metric is touched by at least one option,
//    or is documented as intentionally uncollected
//  - supplemental effects (S, R, V, RE) never alter a computed score — this
//    test can only assert they're *modeled* as supplemental; the scoring
//    engine (not yet implemented) is what must actually honor that.

const SUPPLEMENTAL_METRICS = new Set(["S", "R", "V", "RE"]);

const VALID_METRICS: Record<"4.0" | "3.1", Set<string>> = {
  "4.0": new Set([
    "MAV",
    "MAT",
    "MPR",
    "MUI",
    "MVC",
    "MVI",
    "MVA",
    "MSC",
    "MSI",
    "MSA",
    "CR",
    "IR",
    "AR",
    ...SUPPLEMENTAL_METRICS,
  ]),
  "3.1": new Set(["MAV", "MAC", "MPR", "MUI", "MC", "MI", "MA", "MS", "CR", "IR", "AR"]),
};

describe("interview catalog", () => {
  it("has a version", () => {
    expect(CATALOG_VERSION).toBeTruthy();
  });

  it("has unique question ids, in ascending order", () => {
    const ids = CATALOG.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
    const orders = CATALOG.map((q) => q.order);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("every question ends with the implicit skip option", () => {
    for (const question of CATALOG) {
      const last = question.options.at(-1);
      expect(last?.id, `${question.id} should end with a skip option`).toBe("skip");
      expect(last?.effects).toEqual([]);
    }
  });

  it("every option has unique ids within its question", () => {
    for (const question of CATALOG) {
      const ids = question.options.map((o) => o.id);
      expect(new Set(ids).size, `duplicate option id in ${question.id}`).toBe(ids.length);
    }
  });

  it("every effect references a valid metric for its declared version", () => {
    for (const question of CATALOG) {
      for (const option of question.options) {
        for (const effect of option.effects) {
          expect(
            VALID_METRICS[effect.version].has(effect.metric),
            `${question.id}/${option.id}: ${effect.metric} is not a valid ${effect.version} metric`,
          ).toBe(true);
        }
      }
    }
  });

  it("touches every scoring-relevant metric at least once, per version", () => {
    const touched: Record<"4.0" | "3.1", Set<string>> = { "4.0": new Set(), "3.1": new Set() };
    for (const question of CATALOG) {
      for (const option of question.options) {
        for (const effect of option.effects) {
          touched[effect.version].add(effect.metric);
        }
      }
    }

    const expected4 = new Set([
      "MAV",
      "MAT",
      "MPR",
      "MUI",
      "MVC",
      "MVI",
      "MVA",
      "MSC",
      "MSI",
      "MSA",
      "CR",
      "IR",
      "AR",
      "S",
      "R",
      "V",
      "RE",
    ]);
    const expected31 = new Set(["MAV", "MAC", "MPR", "MUI", "MC", "MI", "MA", "MS", "CR", "IR", "AR"]);

    expect(touched["4.0"]).toEqual(expected4);
    expect(touched["3.1"]).toEqual(expected31);
  });

  it("supplemental metrics are declared as override (display-only by scoring engine contract)", () => {
    for (const question of CATALOG) {
      for (const option of question.options) {
        for (const effect of option.effects) {
          if (SUPPLEMENTAL_METRICS.has(effect.metric)) {
            expect(effect.effect).toBe("override");
          }
        }
      }
    }
  });

  it("every question has non-empty helpDetail", () => {
    for (const question of CATALOG) {
      expect(question.helpDetail?.length, `${question.id} is missing helpDetail`).toBeGreaterThan(0);
    }
  });

  // No em-dashes anywhere user-facing, per the app's copy conventions.
  it("has no em-dashes in any user-facing string", () => {
    for (const question of CATALOG) {
      const fields = [question.question, question.whyWeAsk, question.finePrint, ...(question.helpDetail ?? [])];
      for (const option of question.options) {
        fields.push(option.label, option.description);
      }
      for (const field of fields.filter((f): f is string => Boolean(f))) {
        expect(field, `${question.id} has an em-dash`).not.toMatch(/—/);
      }
    }
  });
});
