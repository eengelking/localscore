import type { Catalog, ScoreChange } from "../types.js";

function optionLabel(catalog: Catalog | null, questionId: string, optionId: string): string {
  const question = catalog?.questions.find((q) => q.id === questionId);
  const option = question?.options.find((o) => o.id === optionId);
  return option?.label ?? optionId;
}

export function ScoreChanges({ changes, catalog }: { changes: ScoreChange[]; catalog: Catalog | null }) {
  if (changes.length === 0) {
    return <p className="why-empty">This environment's answers didn't change any metric for this vector.</p>;
  }

  return (
    <ul className="why-list">
      {changes.map((change) => (
        <li key={change.metric} className="why-item">
          <span className="why-metric">
            {change.metricName}: {change.fromValueName} → {change.toValueName}
          </span>
          <span className="why-reason">
            because you answered &ldquo;{optionLabel(catalog, change.questionId, change.optionId)}&rdquo;
          </span>
        </li>
      ))}
    </ul>
  );
}
