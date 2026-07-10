import { useEffect, useState } from "react";
import { createEnvironment, deleteEnvironment, listEnvironments } from "../api.js";
import type { Environment } from "../types.js";
import { ConfirmModal } from "../components/Modal.js";
import { Icon } from "../components/Icon.js";
import { MarkdownContent } from "../components/MarkdownContent.js";
import { MoreExpander } from "../components/MoreExpander.js";

export function EnvironmentsPage({
  onOpenInterview,
  onOpenEdit,
}: {
  onOpenInterview: (environmentId: number) => void;
  onOpenEdit: (environmentId: number) => void;
}) {
  const [environments, setEnvironments] = useState<Environment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newLocation, setNewLocation] = useState("");
  const [creating, setCreating] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  function refresh() {
    listEnvironments()
      .then(setEnvironments)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(refresh, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const env = await createEnvironment(newName.trim(), newDescription.trim(), newLocation.trim());
      setNewName("");
      setNewDescription("");
      setNewLocation("");
      refresh();
      onOpenInterview(env.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create environment");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number) {
    setPendingDelete(null);
    try {
      await deleteEnvironment(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete environment");
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Environments</h1>
          <p>
            An environment is a location: a data center, a fleet of kiosks, a dev lab, where you run software.
            Answer a few questions about it once, and <strong>localscore</strong> reuses that profile to adjust any
            vulnerability's score to fit reality there.
          </p>
          <MoreExpander>
            <p>
              A CVSS base score assumes the worst case: an attacker with the easiest possible path and no
              mitigations in place. Real locations rarely look like that. A kiosk on an isolated network, or a
              dev lab rebuilt nightly, carries a different real-world risk than the base score implies.
            </p>
            <p>
              The interview turns your plain-English answers about a location into CVSS environmental metrics.
              When you score a vulnerability against this environment, those metrics are layered onto the base
              vector to produce a score that reflects this specific place, not the worst case everywhere.
            </p>
          </MoreExpander>
        </div>
      </div>

      <form className="card new-environment-form" onSubmit={handleCreate}>
        <div className="field">
          <label htmlFor="new-environment-name">New environment</label>
          <div className="new-environment-row">
            <input
              id="new-environment-name"
              className="input"
              placeholder='e.g. "My Data Center"'
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button type="submit" className="button button-primary" disabled={creating || !newName.trim()}>
              Create &amp; Start Interview
            </button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="new-environment-location">Location (optional)</label>
          <input
            id="new-environment-location"
            className="input"
            placeholder='e.g. "us-east-1", "Building 4, rack 12"'
            value={newLocation}
            onChange={(e) => setNewLocation(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="new-environment-description">Description (optional)</label>
          <textarea
            id="new-environment-description"
            className="textarea"
            rows={2}
            placeholder="What is this location? Markdown supported."
            value={newDescription}
            onChange={(e) => setNewDescription(e.target.value)}
          />
        </div>
      </form>

      {error && <p className="error-text">{error}</p>}

      {environments === null && <p>Loading…</p>}

      {environments?.length === 0 && (
        <div className="card empty-state">
          <p>No environments yet. Create one above to describe a location and start the interview.</p>
        </div>
      )}

      {environments && environments.length > 0 && (
        <ul className="environment-list">
          {environments.map((env) => (
            <li key={env.id} className="card environment-row">
              <div className="environment-row-main">
                <h3 className="environment-name">{env.name}</h3>
                {env.location && <p className="environment-location">{env.location}</p>}
                {env.description && <MarkdownContent source={env.description} className="environment-description" />}
                <div className="badge-row">
                  <span className={`badge ${env.interviewCompletion["3.1"] ? "is-complete" : ""}`}>
                    v3.1 {env.interviewCompletion["3.1"] ? "ready" : "no profile yet"}
                  </span>
                  <span className={`badge ${env.interviewCompletion["4.0"] ? "is-complete" : ""}`}>
                    v4.0 {env.interviewCompletion["4.0"] ? "ready" : "no profile yet"}
                  </span>
                  {(env.raisesScores["4.0"] || env.raisesScores["3.1"] || env.redFlags.length > 0) && (
                    <Icon
                      name="warning"
                      className="raises-scores-icon"
                      aria-label="This environment's configuration needs review"
                    />
                  )}
                </div>
              </div>
              <div className="environment-row-actions">
                {env.interviewCompletion["3.1"] ? (
                  <button
                    type="button"
                    className="icon-button icon-button-edit"
                    aria-label="Edit"
                    onClick={() => onOpenEdit(env.id)}
                  >
                    <Icon name="pencil" />
                  </button>
                ) : (
                  <button type="button" className="button" onClick={() => onOpenEdit(env.id)}>
                    Answer Interview
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button icon-button-delete"
                  aria-label="Delete"
                  onClick={() => setPendingDelete({ id: env.id, name: env.name })}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`Delete "${pendingDelete.name}"?`}
          description="This can't be undone."
          onConfirm={() => handleDelete(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
