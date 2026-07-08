import { useEffect, useState } from "react";
import { getCatalog, scoreVector } from "../api.js";
import { EnvironmentResultRow } from "../components/EnvironmentResultRow.js";
import { SeverityPill } from "../components/SeverityPill.js";
import type { Catalog, ScoreResponse } from "../types.js";

const PLACEHOLDER = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";

export function ScorePage({ onOpenInterview }: { onOpenInterview: (environmentId: number) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [vector, setVector] = useState("");
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vector.trim()) return;
    setScoring(true);
    setError(null);
    try {
      const res = await scoreVector(vector.trim());
      setResult(res);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Couldn't score that vector");
    } finally {
      setScoring(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Score a vulnerability</h1>
          <p>Paste a CVSS v4.0, v3.1, or v3.0 vector to see the base score against every environment you've defined.</p>
        </div>
      </div>

      <form className="card score-form" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor="vector-input">CVSS vector</label>
          <textarea
            id="vector-input"
            className="textarea"
            placeholder={PLACEHOLDER}
            value={vector}
            onChange={(e) => setVector(e.target.value)}
            rows={2}
          />
          <span className="hint">e.g. {PLACEHOLDER}</span>
        </div>
        <button type="submit" className="button button-primary" disabled={scoring || !vector.trim()}>
          {scoring ? "Scoring…" : "Score it"}
        </button>
      </form>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <div className="stack">
          <div className="card base-score-card">
            <span className="base-score-label">Base score</span>
            <span className="base-score-figures">
              <span className="score-figure score-figure-hero">{result.base.score.toFixed(1)}</span>
              <SeverityPill severity={result.base.severity} />
            </span>
            <p className="vector-string">{result.base.vector}</p>
            {result.base.note && <p className="base-score-note">{result.base.note}</p>}
            {result.base.pastedVectorHasEnvironmentalMetrics && (
              <p className="base-score-note">
                This vector already included environmental metrics — any environment profile below takes precedence
                for the metrics it defines.
              </p>
            )}
          </div>

          {result.environments.length === 0 ? (
            <div className="card empty-state">
              <p>No environments defined yet — create one to see how this vulnerability applies to a real location.</p>
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
      )}
    </div>
  );
}
