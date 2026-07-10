import { useEffect, useState } from "react";
import { deleteEnvironment, getCatalog, getEnvironment, updateEnvironment } from "../api.js";
import type { Catalog, EnvironmentDetail } from "../types.js";
import { ConfirmModal } from "../components/Modal.js";
import { Icon } from "../components/Icon.js";

// Plain-English register for each red flag, kept alongside the rule set
// it explains (server/src/scoring/redflags.ts).
const RED_FLAG_COPY: Record<string, string> = {
  uncertain_recovery:
    "This location says a compromise would be catastrophic, but recovery would be improvised.",
  concentrated_availability:
    "Uptime is critical here, yet the resources are concentrated on single systems.",
  hard_to_patch:
    "The stakes are high but patching is slow and disruptive, so vulnerabilities stay open longer.",
};

export function EnvironmentEditPage({
  environmentId,
  onDone,
  onOpenInterview,
}: {
  environmentId: number;
  onDone: () => void;
  onOpenInterview: (environmentId: number) => void;
}) {
  const [environment, setEnvironment] = useState<EnvironmentDetail | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    getEnvironment(environmentId)
      .then((env) => {
        setEnvironment(env);
        setName(env.name);
        setDescription(env.description);
        setLocation(env.location);
      })
      .catch((err: Error) => setError(err.message));
  }, [environmentId]);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateEnvironment(environmentId, { name: name.trim(), description, location: location.trim() });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save changes");
      setSaving(false);
    }
  }

  async function handleDelete() {
    setConfirmingDelete(false);
    try {
      await deleteEnvironment(environmentId);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete environment");
    }
  }

  if (error && !environment) {
    return <p className="error-text">{error}</p>;
  }

  if (!environment) {
    return <p>Loading…</p>;
  }

  const hasStarted = environment.interviewCompletion["3.1"];
  const raisesScores = environment.raisesScores["4.0"] || environment.raisesScores["3.1"];

  function labelAnswers(answers: { questionId: string; optionId: string }[]) {
    return answers
      .map(({ questionId, optionId }) => {
        const question = catalog?.questions.find((q) => q.id === questionId);
        const option = question?.options.find((o) => o.id === optionId);
        if (!question || !option) return null;
        return { question: question.question, option: option.label };
      })
      .filter((v): v is { question: string; option: string } => v !== null);
  }

  const raisingAnswerLabels = labelAnswers(environment.raisingAnswers);
  const redFlags = environment.redFlags;
  const showCallout = raisesScores || redFlags.length > 0;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Edit environment</h1>
          <p>Rename this location, update its description, or manage the interview.</p>
        </div>
      </div>

      {showCallout && (
        <div className="callout-warning">
          <Icon name="warning" size={18} />
          <div>
            {raisesScores && (
              <div className="callout-section">
                <div className="callout-section-intro">
                  <p>
                    Because of how this environment is configured, vulnerabilities can score <strong>higher</strong>{" "}
                    here than their published base score. These answers state the location has a lot to lose, which
                    is worth reviewing, not necessarily a misconfiguration. <strong>localscore</strong> recommends
                    having this configuration reviewed by a security professional.
                  </p>
                </div>
                {raisingAnswerLabels.length > 0 && (
                  <ul className="raises-scores-list">
                    {raisingAnswerLabels.map(({ question, option }, i) => (
                      <li key={i}>
                        <p className="raises-scores-question">
                          <strong>Q:</strong> <strong>{question}</strong>
                        </p>
                        <p className="raises-scores-answer">A: {option}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            {redFlags.length > 0 && (
              <div className="callout-section">
                <div className="callout-section-intro">
                  <p className="callout-section-title">This configuration needs review</p>
                </div>
                {redFlags.map((flag) => (
                  <div key={flag.id} className="red-flag-block">
                    <div className="callout-section-intro">
                      <p>{RED_FLAG_COPY[flag.id] ?? flag.id}</p>
                    </div>
                    <ul className="raises-scores-list">
                      {labelAnswers(flag.answers).map(({ question, option }, i) => (
                        <li key={i}>
                          <p className="raises-scores-question">
                            <strong>Q:</strong> <strong>{question}</strong>
                          </p>
                          <p className="raises-scores-answer">A: {option}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <form className="card environment-edit-form" onSubmit={handleSave}>
        <div className="field">
          <label htmlFor="environment-edit-name">Name</label>
          <input
            id="environment-edit-name"
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="environment-edit-location">Location (optional)</label>
          <input
            id="environment-edit-location"
            className="input"
            placeholder="e.g. us-east-1 or Building 4, rack 12"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="environment-edit-description">Description</label>
          <textarea
            id="environment-edit-description"
            className="textarea"
            rows={4}
            placeholder="What is this location, and why does it matter for risk? Markdown supported."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        {error && <p className="error-text">{error}</p>}

        <div className="environment-edit-actions">
          <button
            type="button"
            className="icon-button icon-button-delete"
            aria-label="Delete"
            onClick={() => setConfirmingDelete(true)}
          >
            <Icon name="trash" />
          </button>
          <div className="environment-edit-actions-right">
            <button type="button" className="button button-cancel" onClick={onDone}>
              Cancel
            </button>
            <button type="submit" className="button button-save" disabled={saving || !name.trim()}>
              Save
            </button>
          </div>
        </div>
      </form>

      <div className="card environment-edit-interview">
        <div>
          <h3>Interview</h3>
          <p>
            {hasStarted
              ? "This environment has a profile. Re-answer to update it."
              : "No answers yet. Start the interview to build this environment's profile."}
          </p>
        </div>
        <button type="button" className="button button-primary" onClick={() => onOpenInterview(environmentId)}>
          {hasStarted ? "Re-Answer Interview" : "Answer Interview"}
        </button>
      </div>

      {confirmingDelete && (
        <ConfirmModal
          title={`Delete "${environment.name}"?`}
          description="This can't be undone."
          onConfirm={handleDelete}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </div>
  );
}
