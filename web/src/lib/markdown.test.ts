import { describe, expect, it } from "vitest";
import { renderMarkdown } from "./markdown";

describe("renderMarkdown", () => {
  it("renders basic markdown formatting", () => {
    const html = renderMarkdown("**bold** and a [link](https://example.com)");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain('href="https://example.com"');
  });

  it("adds rel=noopener noreferrer and target=_blank to links", () => {
    const html = renderMarkdown("[link](https://example.com)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("strips raw <script> tags", () => {
    const html = renderMarkdown('Hello<script>alert("xss")</script>World');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
  });

  it("strips inline event handler attributes", () => {
    const html = renderMarkdown('<img src="x" onerror="alert(1)">');
    expect(html).not.toContain("onerror");
  });

  it("neutralizes javascript: URIs in links", () => {
    const html = renderMarkdown("[click me](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  it("strips raw <style> tags", () => {
    const html = renderMarkdown("<style>body{display:none}</style>text");
    expect(html).not.toContain("<style");
  });
});
