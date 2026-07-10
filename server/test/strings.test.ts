import { describe, expect, it } from "vitest";
import { stripWrappingQuotes } from "../src/lib/strings.js";

describe("stripWrappingQuotes (docs/SPEC06.md §2.1)", () => {
  it("strips straight double quotes", () => {
    expect(stripWrappingQuotes('"My Data Center"')).toBe("My Data Center");
  });

  it("strips straight single quotes", () => {
    expect(stripWrappingQuotes("'My Data Center'")).toBe("My Data Center");
  });

  it("strips curly double quotes", () => {
    expect(stripWrappingQuotes("“My Data Center”")).toBe("My Data Center");
  });

  it("strips curly single quotes", () => {
    expect(stripWrappingQuotes("‘My Data Center’")).toBe("My Data Center");
  });

  it("strips nested matched pairs entirely", () => {
    expect(stripWrappingQuotes("\"'My Lab'\"")).toBe("My Lab");
  });

  it("trims whitespace inside the quotes after stripping", () => {
    expect(stripWrappingQuotes('" My Lab "')).toBe("My Lab");
  });

  it("leaves an apostrophe inside a word untouched", () => {
    expect(stripWrappingQuotes("Bob's Lab")).toBe("Bob's Lab");
  });

  it("leaves interior/unmatched quotes untouched", () => {
    expect(stripWrappingQuotes('"quoted" prefix')).toBe('"quoted" prefix');
    expect(stripWrappingQuotes('say "hi"')).toBe('say "hi"');
  });

  it("reduces a name that is only quotes to empty", () => {
    expect(stripWrappingQuotes('""')).toBe("");
  });
});
