import type { AnsweredQuestionNote, Catalog, ScoreChange } from "../types.js";

function optionLabel(catalog: Catalog | null, questionId: string, optionId: string): string {
  const question = catalog?.questions.find((q) => q.id === questionId);
  const option = question?.options.find((o) => o.id === optionId);
  return option?.label ?? optionId;
}

const NOTE_BADGE_LABEL: Record<AnsweredQuestionNote["status"], string> = {
  "no-effect": "No effect",
  "capped-by-base": "Not applied",
  "not-applicable-to-version": "Wrong CVSS version",
};

export function ScoreChanges({
  changes,
  notes,
  catalog,
}: {
  changes: ScoreChange[];
  notes: AnsweredQuestionNote[];
  catalog: Catalog | null;
}) {
  return (
    <div className="why">
      {changes.length === 0 ? (
        <p className="why-empty">
          None of this environment's answers changed the score for this vector — see why below.
        </p>
      ) : (
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
      )}

      {notes.length > 0 && (
        <div className="why-notes">
          <span className="why-notes-heading">Other answers for this environment</span>
          <ul className="why-list">
            {notes.map((note) => (
              <li key={note.questionId} className="why-item">
                <span className="why-metric">
                  &ldquo;{note.optionLabel}&rdquo;
                  <span className={`why-note-badge why-note-badge-${note.status}`}>
                    {NOTE_BADGE_LABEL[note.status]}
                  </span>
                </span>
                <span className="why-reason">{note.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
