import { useEffect, useState } from "react";
import { createEnvironment, deleteEnvironment, listEnvironments } from "../api.js";
import type { Environment } from "../types.js";

export function EnvironmentsPage({ onOpenInterview }: { onOpenInterview: (environmentId: number) => void }) {
  const [environments, setEnvironments] = useState<Environment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

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
      const env = await createEnvironment(newName.trim());
      setNewName("");
      refresh();
      onOpenInterview(env.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't create environment");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: number, name: string) {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
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
            Each location — a data center, a fleet of kiosks, a dev lab — gets its own profile from a short
            interview.
          </p>
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
              Create &amp; start interview
            </button>
          </div>
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
                {env.description && <p>{env.description}</p>}
                <div className="badge-row">
                  <span className={`badge ${env.interviewCompletion["3.1"] ? "is-complete" : ""}`}>
                    v3.1 {env.interviewCompletion["3.1"] ? "ready" : "no profile yet"}
                  </span>
                  <span className={`badge ${env.interviewCompletion["4.0"] ? "is-complete" : ""}`}>
                    v4.0 {env.interviewCompletion["4.0"] ? "ready" : "no profile yet"}
                  </span>
                </div>
              </div>
              <div className="environment-row-actions">
                <button type="button" className="button" onClick={() => onOpenInterview(env.id)}>
                  {env.interviewCompletion["3.1"] ? "Edit interview" : "Answer interview"}
                </button>
                <button type="button" className="button button-quiet" onClick={() => handleDelete(env.id, env.name)}>
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
