import { useEffect, useMemo, useState } from "react";
import {
  deleteVulnerability,
  getCatalog,
  getVulnerability,
  listVulnerabilities,
  scoreVector,
  updateVulnerability,
} from "../api.js";
import { CveDetailsView } from "../components/CveDetailsView.js";
import { NvdVectorPicker } from "../components/NvdVectorPicker.js";
import { ScoreResult } from "../components/ScoreResult.js";
import { nvdSeverityToAppSeverity } from "../lib/severity.js";
import { SeverityPill } from "../components/SeverityPill.js";
import { ConfirmModal } from "../components/Modal.js";
import { Icon } from "../components/Icon.js";
import { MarkdownContent } from "../components/MarkdownContent.js";
import type { Catalog, SavedVulnerability, SavedVulnerabilityDetail, ScoreResponse, Severity } from "../types.js";

interface Viewing {
  id: number;
  detail: SavedVulnerabilityDetail;
  result: ScoreResponse;
  selectedVectorIndex: number;
}

type TypeFilter = "all" | "nvd" | "vector";
type SeverityFilter = "all" | Extract<Severity, "Critical" | "High" | "Medium" | "Low">;

const SEVERITY_FILTERS: SeverityFilter[] = ["Critical", "High", "Medium", "Low"];
const SEARCH_DEBOUNCE_MS = 280;

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

  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  function refresh(q: string) {
    listVulnerabilities(q)
      .then(setVulnerabilities)
      .catch((err: Error) => setError(err.message));
  }

  // docs/SPEC06.md §4.2.2: search is server-side (it has to reach the cached
  // NVD JSON, which the list response doesn't carry), debounced so typing
  // doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => refresh(searchQuery), [searchQuery]);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  // docs/SPEC06.md §4.2.1: type/severity are client-side filters over the
  // already-fetched (possibly search-narrowed) list. Severity reuses the
  // exact mapping the row's own pill uses, so a row can never filter into a
  // bucket different from what it visibly shows.
  const filteredVulnerabilities = useMemo(() => {
    if (!vulnerabilities) return null;
    return vulnerabilities.filter((vuln) => {
      if (typeFilter !== "all" && vuln.source !== typeFilter) return false;
      if (severityFilter !== "all" && nvdSeverityToAppSeverity("", vuln.baseScore) !== severityFilter) return false;
      return true;
    });
  }, [vulnerabilities, typeFilter, severityFilter]);

  const filtersActive = typeFilter !== "all" || severityFilter !== "all" || searchInput.trim() !== "";

  function clearFilters() {
    setTypeFilter("all");
    setSeverityFilter("all");
    setSearchInput("");
  }

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
      refresh(searchQuery);
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
      refresh(searchQuery);
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
          <p>Vulnerabilities you've saved from a scored result: pasted vectors or NVD lookups.</p>
        </div>
      </div>

      {error && <p className="error-text">{error}</p>}

      {vulnerabilities === null && <p>Loading…</p>}

      {vulnerabilities !== null && (vulnerabilities.length > 0 || filtersActive) && (
        <div className="filter-bar">
          <div className="filter-group">
            <span className="filter-group-label">Type</span>
            <div className="filter-group-options">
              {(["all", "nvd", "vector"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`filter-chip ${typeFilter === option ? "is-active" : ""}`}
                  aria-pressed={typeFilter === option}
                  onClick={() => setTypeFilter(option)}
                >
                  {option === "all" ? "All" : option === "nvd" ? "NVD" : "Vector"}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group">
            <span className="filter-group-label">Severity</span>
            <div className="filter-group-options">
              <button
                type="button"
                className={`filter-chip ${severityFilter === "all" ? "is-active" : ""}`}
                aria-pressed={severityFilter === "all"}
                onClick={() => setSeverityFilter("all")}
              >
                All
              </button>
              {SEVERITY_FILTERS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`filter-chip filter-chip-severity-${option.toLowerCase()} ${
                    severityFilter === option ? "is-active" : ""
                  }`}
                  aria-pressed={severityFilter === option}
                  onClick={() => setSeverityFilter(option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-group filter-search-group">
            <label className="filter-group-label" htmlFor="vuln-search">
              Search
            </label>
            <input
              id="vuln-search"
              className="input"
              type="search"
              placeholder="Label, CVE ID, vector, description..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
        </div>
      )}

      {vulnerabilities?.length === 0 && !filtersActive && (
        <div className="card empty-state">
          <p>No saved vulnerabilities yet. Score one and save it to see it here.</p>
        </div>
      )}

      {vulnerabilities !== null && filtersActive && filteredVulnerabilities?.length === 0 && (
        <div className="card empty-state">
          <p>No saved vulnerabilities match these filters.</p>
          <button type="button" className="link-button" onClick={clearFilters}>
            Clear filters
          </button>
        </div>
      )}

      {filteredVulnerabilities && filteredVulnerabilities.length > 0 && (
        <ul className="environment-list">
          {filteredVulnerabilities.map((vuln) =>
            editingId === vuln.id ? (
              <li key={vuln.id} className="card vulnerability-row">
                <div className="vulnerability-row-edit environment-edit-form">
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
                      <span className="badge">{vuln.source === "nvd" ? "NVD" : "Vector"}</span>
                      {vuln.cveId && <span className="badge">{vuln.cveId}</span>}
                      <SeverityPill severity={nvdSeverityToAppSeverity("", vuln.baseScore)} variant="outline" />
                      <span className="score-figure">{vuln.baseScore.toFixed(1)}</span>
                    </div>
                  </div>
                  <div className="environment-row-actions">
                    <button
                      type="button"
                      className="icon-button icon-button-quiet"
                      aria-label={viewing?.id === vuln.id ? "Hide details" : "View details"}
                      disabled={viewLoading === vuln.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleView(vuln.id);
                      }}
                    >
                      <Icon name={viewing?.id === vuln.id ? "eye-off" : "eye"} />
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
                    {viewing.detail.details && (
                      <CveDetailsView details={viewing.detail.details} cveId={viewing.detail.cveId} />
                    )}
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
