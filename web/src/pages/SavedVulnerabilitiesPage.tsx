import { useEffect, useState } from "react";
import {
  deleteVulnerability,
  getCatalog,
  getVulnerability,
  listVulnerabilities,
  scoreVector,
  updateVulnerability,
} from "../api.js";
import { NvdVectorPicker } from "../components/NvdVectorPicker.js";
import { ScoreResult } from "../components/ScoreResult.js";
import { nvdSeverityToAppSeverity } from "../lib/severity.js";
import { SeverityPill } from "../components/SeverityPill.js";
import { ConfirmModal } from "../components/Modal.js";
import { Icon } from "../components/Icon.js";
import { MarkdownContent } from "../components/MarkdownContent.js";
import type { Catalog, SavedVulnerability, SavedVulnerabilityDetail, ScoreResponse } from "../types.js";

interface Viewing {
  id: number;
  detail: SavedVulnerabilityDetail;
  result: ScoreResponse;
  selectedVectorIndex: number;
}

export function SavedVulnerabilitiesPage({
  onOpenInterview,
}: {
  onOpenInterview: (environmentId: number) => void;
}) {
  const [vulnerabilities, setVulnerabilities] = useState<SavedVulnerability[] | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<Viewing | null>(null);
  const [viewLoading, setViewLoading] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; label: string } | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  function refresh() {
    listVulnerabilities()
      .then(setVulnerabilities)
      .catch((err: Error) => setError(err.message));
  }

  useEffect(refresh, []);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  async function handleView(id: number) {
    if (viewing?.id === id) {
      setViewing(null);
      return;
    }
    setViewLoading(id);
    setError(null);
    try {
      const detail = await getVulnerability(id);
      const result = await scoreVector(detail.vector);
      const primaryIndex = detail.vectors.findIndex((v) => v.vector === detail.vector);
      setViewing({ id, detail, result, selectedVectorIndex: primaryIndex >= 0 ? primaryIndex : 0 });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load that vulnerability");
    } finally {
      setViewLoading(null);
    }
  }

  async function handleSelectVector(index: number) {
    if (!viewing) return;
    const chosenVector = viewing.detail.vectors[index]?.vector;
    if (!chosenVector) return;
    try {
      const result = await scoreVector(chosenVector);
      setViewing({ ...viewing, result, selectedVectorIndex: index });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't score that vector");
    }
  }

  async function handleDelete(id: number) {
    setPendingDelete(null);
    try {
      await deleteVulnerability(id);
      if (viewing?.id === id) setViewing(null);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't delete that vulnerability");
    }
  }

  function startEdit(vuln: SavedVulnerability) {
    setEditingId(vuln.id);
    setEditLabel(vuln.label);
    setEditDescription(vuln.description);
    setEditError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditError(null);
  }

  async function handleSaveEdit(id: number) {
    if (!editLabel.trim()) return;
    setEditSaving(true);
    setEditError(null);
    try {
      await updateVulnerability(id, { label: editLabel.trim(), description: editDescription });
      setEditingId(null);
      refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Couldn't save changes");
    } finally {
      setEditSaving(false);
    }
  }

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Saved vulnerabilities</h1>
          <p>Vulnerabilities you've saved from a scored result — pasted vectors or NVD lookups.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {vulnerabilities === null && <p>Loading…</p>}

      {vulnerabilities?.length === 0 && (
        <div className="card empty-state">
          <p>No saved vulnerabilities yet. Score one and save it to see it here.</p>
        </div>
      )}

      {vulnerabilities && vulnerabilities.length > 0 && (
        <ul className="environment-list">
          {vulnerabilities.map((vuln) =>
            editingId === vuln.id ? (
              <li key={vuln.id} className="card vulnerability-row">
                <div className="environment-edit-form">
                  <div className="field">
                    <label htmlFor={`vuln-edit-label-${vuln.id}`}>Label</label>
                    <input
                      id={`vuln-edit-label-${vuln.id}`}
                      className="input"
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor={`vuln-edit-description-${vuln.id}`}>Description</label>
                    <textarea
                      id={`vuln-edit-description-${vuln.id}`}
                      className="textarea"
                      rows={3}
                      placeholder="Notes about this vulnerability. Markdown supported."
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                    />
                  </div>
                  {editError && <p className="error-text">{editError}</p>}
                  <div className="save-form-actions">
                    <button type="button" className="button button-cancel" onClick={cancelEdit}>
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button button-save"
                      onClick={() => handleSaveEdit(vuln.id)}
                      disabled={editSaving || !editLabel.trim()}
                    >
                      Save
                    </button>
                  </div>
                </div>
              </li>
            ) : (
              <li key={vuln.id} className="card vulnerability-row">
                <div
                  className="vulnerability-row-header"
                  onClick={() => handleView(vuln.id)}
                  aria-expanded={viewing?.id === vuln.id}
                >
                  <div className="environment-row-main">
                    <h3 className="environment-name">{vuln.label}</h3>
                    {vuln.description && (
                      <MarkdownContent source={vuln.description} className="environment-description" />
                    )}
                    <div className="badge-row">
                      <span className="badge">{vuln.source === "nvd" ? "NVD" : "Pasted vector"}</span>
                      {vuln.cveId && <span className="badge">{vuln.cveId}</span>}
                      <SeverityPill severity={nvdSeverityToAppSeverity("", vuln.baseScore)} variant="outline" />
                      <span className="score-figure">{vuln.baseScore.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="environment-row-actions">
                    <button
                      type="button"
                      className="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView(vuln.id);
                      }}
                    >
                      {viewLoading === vuln.id ? "Loading…" : viewing?.id === vuln.id ? "Hide" : "View"}
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button-edit"
                      aria-label="Edit"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit(vuln);
                      }}
                    >
                      <Icon name="pencil" />
                    </button>
                    <button
                      type="button"
                      className="icon-button icon-button-delete"
                      aria-label="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPendingDelete({ id: vuln.id, label: vuln.label });
                      }}
                    >
                      <Icon name="trash" />
                    </button>
                  </div>
                </div>

                {viewing?.id === vuln.id && (
                  <div className="result-row-detail stack">
                    {viewing.detail.vectors.length > 1 && (
                      <NvdVectorPicker
                        vectors={viewing.detail.vectors}
                        selectedIndex={viewing.selectedVectorIndex}
                        onSelect={handleSelectVector}
                      />
                    )}
                    <ScoreResult
                      key={viewing.result.base.vector}
                      result={viewing.result}
                      catalog={catalog}
                      onOpenInterview={onOpenInterview}
                    />
                  </div>
                )}
              </li>
            ),
          )}
        </ul>
      )}

      {pendingDelete && (
        <ConfirmModal
          title={`Delete "${pendingDelete.label}"?`}
          description="This can't be undone."
          onConfirm={() => handleDelete(pendingDelete.id)}
          onCancel={() => setPendingDelete(null)}
        />
      )}
    </div>
  );
}
