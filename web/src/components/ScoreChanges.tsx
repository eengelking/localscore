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

const DIRECTION_GLYPH: Record<ScoreChange["direction"], string> = {
  worse: "▲",
  better: "▼",
  neutral: "",
};

const DIRECTION_LABEL: Record<ScoreChange["direction"], string> = {
  worse: "Increased severity: ",
  better: "Decreased severity: ",
  neutral: "",
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
  const individualNotes = notes.filter((n) => n.status !== "not-applicable-to-version");
  const skippedVersionCount = notes.length - individualNotes.length;

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
                <span className={`why-direction why-direction-${change.direction}`} aria-hidden="true">
                  {DIRECTION_GLYPH[change.direction]}
                </span>
                <span className="sr-only">{DIRECTION_LABEL[change.direction]}</span>
                {change.metricName}: {change.fromValueName} → {change.toValueName}
              </span>
              <span className="why-reason">
                because you answered &ldquo;{optionLabel(catalog, change.questionId, change.optionId)}&rdquo;
              </span>
            </li>
          ))}
        </ul>
      )}

      {(individualNotes.length > 0 || skippedVersionCount > 0) && (
        <div className="why-notes">
          <span className="why-notes-heading">Other answers for this environment</span>
          <ul className="why-list">
            {individualNotes.map((note) => (
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
            {skippedVersionCount > 0 && (
              <li className="why-item">
                <span className="why-reason">
                  {skippedVersionCount} more {skippedVersionCount === 1 ? "answer doesn't" : "answers don't"} apply to
                  this vector's CVSS version.
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
