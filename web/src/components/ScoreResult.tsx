import { useState } from "react";
import type { Catalog, ScoreResponse } from "../types.js";
import { EnvironmentResultRow } from "./EnvironmentResultRow.js";
import { SeverityPill } from "./SeverityPill.js";

export function ScoreResult({
  result,
  catalog,
  onOpenInterview,
  onSave,
  defaultSaveLabel,
  overwriteLabel,
}: {
  result: ScoreResponse;
  catalog: Catalog | null;
  onOpenInterview: (environmentId: number) => void;
  onSave?: (label: string | undefined) => Promise<void>;
  defaultSaveLabel?: string;
  overwriteLabel?: string;
}) {
  const [saveOpen, setSaveOpen] = useState(false);
  const [label, setLabel] = useState(defaultSaveLabel ?? "");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function handleConfirmSave() {
    if (!onSave) return;
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(label.trim() || undefined);
      setSaved(true);
      setSaveOpen(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Couldn't save that vulnerability");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="stack">
      <div className="card base-score-card">
        <span className="base-score-label">Base score</span>
        <span className="base-score-figures">
          <span className="score-figure score-figure-hero">{result.base.score.toFixed(1)}</span>
          <span className="severity-slot">
            <SeverityPill severity={result.base.severity} />
          </span>
        </span>
        <p className="vector-string">{result.base.vector}</p>
        {result.base.note && <p className="base-score-note">{result.base.note}</p>}
        {result.base.pastedVectorHasEnvironmentalMetrics && (
          <p className="base-score-note">
            This vector already included environmental metrics. Any environment profile below takes precedence for
            the metrics it defines.
          </p>
        )}

        {onSave && (
          <div className="save-panel">
            {!saveOpen && !saved && (
              <button type="button" className="button button-save" onClick={() => setSaveOpen(true)}>
                Save
              </button>
            )}
            {saved && !saveOpen && <span className="save-confirmation">Saved</span>}
            {saveOpen && (
              <div className="save-form">
                {overwriteLabel && (
                  <p className="save-overwrite-note">This updates your existing saved entry for {overwriteLabel}.</p>
                )}
                <input
                  type="text"
                  className="input"
                  placeholder={result.base.vector}
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  aria-label="Label for this saved vulnerability"
                />
                <div className="save-form-actions">
                  <button
                    type="button"
                    className="button button-save"
                    onClick={handleConfirmSave}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button
                    type="button"
                    className="button button-cancel"
                    onClick={() => {
                      setSaveOpen(false);
                      setSaveError(null);
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                </div>
                {saveError && <p className="error-text">{saveError}</p>}
              </div>
            )}
          </div>
        )}
      </div>

      {result.environments.length === 0 ? (
        <div className="card empty-state">
          <p>No environments defined yet. Create one to see how this vulnerability applies to a real location.</p>
        </div>
      ) : (
        <ul className="result-list">
          {result.environments.map((env) => (
            <EnvironmentResultRow
              key={env.id}
              result={env}
              baseScore={result.base.score}
              catalog={catalog}
              onOpenInterview={onOpenInterview}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
