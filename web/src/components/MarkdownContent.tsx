import { renderMarkdown } from "../lib/markdown";

export function MarkdownContent({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  return (
    <div
      className={className ? `markdown ${className}` : "markdown"}
      dangerouslySetInnerHTML={{ __html: renderMarkdown(source) }}
    />
  );
}
