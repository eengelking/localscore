export function MoreExpander({ label = "More", children }: { label?: string; children: React.ReactNode }) {
  return (
    <details className="more-expander">
      <summary>{label}</summary>
      <div className="more-expander-body">{children}</div>
    </details>
  );
}
