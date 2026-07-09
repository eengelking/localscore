import { useEffect, useState } from "react";
import { deleteEnvironment, getEnvironment, updateEnvironment } from "../api.js";
import type { Environment } from "../types.js";
import { ConfirmModal } from "../components/Modal.js";
import { Icon } from "../components/Icon.js";

export function EnvironmentEditPage({
  environmentId,
  onDone,
  onOpenInterview,
}: {
  environmentId: number;
  onDone: () => void;
  onOpenInterview: (environmentId: number) => void;
}) {
  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    getEnvironment(environmentId)
      .then((env) => {
        setEnvironment(env);
        setName(env.name);
        setDescription(env.description);
      })
      .catch((err: Error) => setError(err.message));
  }, [environmentId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await updateEnvironment(environmentId, { name: name.trim(), description });
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

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Edit environment</h1>
          <p>Rename this location, update its description, or manage the interview.</p>
        </div>
      </div>

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
              : "No answers yet — start the interview to build this environment's profile."}
          </p>
        </div>
        <button type="button" className="button button-primary" onClick={() => onOpenInterview(environmentId)}>
          {hasStarted ? "Re-answer interview" : "Answer interview"}
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
