import { useState } from "react";
import { formatSignedScore } from "../lib/format.js";
import type { Catalog, EnvironmentScoreResult } from "../types.js";
import { AnimatedScore } from "./AnimatedScore.js";
import { Icon } from "./Icon.js";
import { ScoreChanges } from "./ScoreChanges.js";

function deltaClass(delta: number): string {
  if (delta < 0) return "delta delta-down";
  if (delta > 0) return "delta delta-up";
  return "delta delta-flat";
}

export function EnvironmentResultRow({
  result,
  baseScore,
  catalog,
  onOpenInterview,
}: {
  result: EnvironmentScoreResult;
  baseScore: number;
  catalog: Catalog | null;
  onOpenInterview: (environmentId: number) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!result.hasProfile) {
    return (
      <li className="card result-row result-row-empty">
        <span className="environment-name">{result.name}</span>
        <span className="no-profile-note">
          No profile yet —{" "}
          <button type="button" className="link-button" onClick={() => onOpenInterview(result.id)}>
            complete the interview
          </button>
        </span>
      </li>
    );
  }

  return (
    <li className="card result-row">
      <button type="button" className="result-row-summary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <span className="environment-name">{result.name}</span>
        <span className="result-row-figures">
          <AnimatedScore from={baseScore} to={result.score} />
          <span className={deltaClass(result.delta)}>{formatSignedScore(result.delta)}</span>
          <span className={`disclosure ${open ? "is-open" : ""}`} aria-hidden="true">
            <Icon name="chevron" size={20} />
          </span>
        </span>
      </button>

      {open && (
        <div className="result-row-detail">
          <p className="vector-string">{result.vector}</p>
          {result.delta > 0 && (
            <div className="more-vulnerable-warning">
              <Icon name="warning" size={18} />
              <p>Higher than the base score — this environment's answers make this vulnerability more severe here.</p>
            </div>
          )}
          <ScoreChanges changes={result.changes} notes={result.notes} catalog={catalog} />
        </div>
      )}
    </li>
  );
}
