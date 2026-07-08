import { describe, expect, it } from "vitest";
import { isLessSevere, severityDirection } from "../src/scoring/orderings.js";

describe("isLessSevere", () => {
  it("still resolves the original cap-eligible metrics unaffected by the ordering extension", () => {
    expect(isLessSevere("3.1", "AV", "A", "N")).toBe(true);
    expect(isLessSevere("3.1", "AV", "N", "A")).toBe(false);
  });
});

// SPEC.md §2.2/Appendix A orderings, extended beyond the cap-only subset so
// every metric an AppliedChange can carry has a usable direction.
describe("severityDirection", () => {
  it("exploitability metrics: less severe -> better, more severe -> worse", () => {
    expect(severityDirection("3.1", "AV", "N", "A")).toBe("better");
    expect(severityDirection("3.1", "AV", "A", "N")).toBe("worse");
    expect(severityDirection("3.1", "AV", "N", "N")).toBe("neutral");
  });

  it("v3.1 impact metrics (C/I/A): H > L > N", () => {
    expect(severityDirection("3.1", "C", "H", "N")).toBe("better");
    expect(severityDirection("3.1", "C", "N", "H")).toBe("worse");
  });

  it("v4.0 vulnerable-system impact metrics (VC/VI/VA): H > L > N", () => {
    expect(severityDirection("4.0", "VC", "H", "L")).toBe("better");
    expect(severityDirection("4.0", "VA", "N", "H")).toBe("worse");
  });

  it("v4.0 subsequent-system impact metrics (SI/SA) reach Safety beyond High: S > H > L > N", () => {
    expect(severityDirection("4.0", "SI", "H", "S")).toBe("worse");
    expect(severityDirection("4.0", "SA", "S", "L")).toBe("better");
  });

  it("v3.1 Scope (S): C > U", () => {
    expect(severityDirection("3.1", "S", "U", "C")).toBe("worse");
    expect(severityDirection("3.1", "S", "C", "U")).toBe("better");
  });

  it("CR/IR/AR: H > M > L, with Not Defined (X) treated as High per CVSS's ND-defaults-to-High rule", () => {
    expect(severityDirection("3.1", "CR", "X", "H")).toBe("neutral"); // ND already scores as High
    expect(severityDirection("3.1", "CR", "X", "M")).toBe("better"); // less than the ND-as-High default
    expect(severityDirection("3.1", "CR", "X", "L")).toBe("better");
    expect(severityDirection("4.0", "IR", "X", "M")).toBe("better");
    expect(severityDirection("4.0", "AR", "X", "H")).toBe("neutral");
  });

  it("v4.0 supplemental metrics (S, R, V, RE) have no ordering and always resolve neutral", () => {
    expect(severityDirection("4.0", "S", "X", "N")).toBe("neutral");
    expect(severityDirection("4.0", "R", "X", "A")).toBe("neutral");
    expect(severityDirection("4.0", "V", "X", "D")).toBe("neutral");
    expect(severityDirection("4.0", "RE", "X", "L")).toBe("neutral");
  });

  it("unknown values on a known metric resolve neutral rather than throwing", () => {
    expect(severityDirection("3.1", "AV", "N", "not-a-real-value")).toBe("neutral");
  });
});
