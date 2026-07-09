import { describe, expect, it } from "vitest";
import { extractCveDetails } from "../src/lib/nvd.js";

function nvdPayload(cve: Record<string, unknown>) {
  return { vulnerabilities: [{ cve }] };
}

describe("extractCveDetails", () => {
  it("picks the English description, falling back to the first entry if no lang: en", () => {
    const withEnglish = extractCveDetails(
      nvdPayload({
        descriptions: [
          { lang: "es", value: "Descripcion" },
          { lang: "en", value: "English description" },
        ],
      }),
    );
    expect(withEnglish.description).toBe("English description");

    const withoutEnglish = extractCveDetails(
      nvdPayload({ descriptions: [{ lang: "fr", value: "Description francaise" }] }),
    );
    expect(withoutEnglish.description).toBe("Description francaise");
  });

  it("extracts published/lastModified and preserves reference tags, ordering Patch/Vendor Advisory first", () => {
    const details = extractCveDetails(
      nvdPayload({
        published: "2026-01-01T00:00:00.000",
        lastModified: "2026-01-02T00:00:00.000",
        references: [
          { url: "https://example.com/news", source: "example.com", tags: ["Press/Media Coverage"] },
          { url: "https://example.com/patch", source: "example.com", tags: ["Patch"] },
          { url: "https://example.com/advisory", source: "example.com", tags: ["Vendor Advisory"] },
        ],
      }),
    );
    expect(details.published).toBe("2026-01-01T00:00:00.000");
    expect(details.lastModified).toBe("2026-01-02T00:00:00.000");
    expect(details.references).toHaveLength(3);
    expect(details.references[0].tags).toContain("Patch");
    expect(details.references[1].tags).toContain("Vendor Advisory");
    expect(details.references[2].url).toBe("https://example.com/news");
  });

  it("caps references at 20", () => {
    const references = Array.from({ length: 25 }, (_, i) => ({ url: `https://example.com/${i}` }));
    const details = extractCveDetails(nvdPayload({ references }));
    expect(details.references).toHaveLength(20);
  });

  it("dedupes vendor/product pairs from CPE URIs and caps with a remainder count", () => {
    const configurations = [
      {
        nodes: [
          {
            cpeMatch: [
              { criteria: "cpe:2.3:a:google:chrome:*:*:*:*:*:*:*:*" },
              { criteria: "cpe:2.3:a:google:chrome:1.0:*:*:*:*:*:*:*" },
              { criteria: "cpe:2.3:a:mozilla:firefox:*:*:*:*:*:*:*:*" },
            ],
          },
        ],
      },
    ];
    const details = extractCveDetails(nvdPayload({ configurations }));
    expect(details.affectedProducts.items).toEqual(["google chrome", "mozilla firefox"]);
    expect(details.affectedProducts.moreCount).toBe(0);
  });

  it("caps affected products at 15 with a remainder count", () => {
    const cpeMatch = Array.from({ length: 20 }, (_, i) => ({
      criteria: `cpe:2.3:a:vendor${i}:product${i}:*:*:*:*:*:*:*:*`,
    }));
    const details = extractCveDetails(nvdPayload({ configurations: [{ nodes: [{ cpeMatch }] }] }));
    expect(details.affectedProducts.items).toHaveLength(15);
    expect(details.affectedProducts.moreCount).toBe(5);
  });

  it("is empty-tolerant for malformed/absent sections, never throwing", () => {
    expect(() => extractCveDetails({})).not.toThrow();
    expect(() => extractCveDetails(null)).not.toThrow();
    expect(() => extractCveDetails(nvdPayload({}))).not.toThrow();

    const empty = extractCveDetails({});
    expect(empty).toEqual({
      description: null,
      published: null,
      lastModified: null,
      references: [],
      affectedProducts: { items: [], moreCount: 0 },
    });

    const malformedCpe = extractCveDetails(
      nvdPayload({ configurations: [{ nodes: [{ cpeMatch: [{ criteria: "not-a-cpe-uri" }] }] }] }),
    );
    expect(malformedCpe.affectedProducts.items).toEqual([]);
  });
});
