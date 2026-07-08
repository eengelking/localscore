import { useEffect, useRef, useState } from "react";
import { getCatalog, lookupCve, saveVulnerability, scoreVector } from "../api.js";
import { NvdVectorPicker } from "../components/NvdVectorPicker.js";
import { ScoreResult } from "../components/ScoreResult.js";
import type { Catalog, CveResponse, ScoreResponse } from "../types.js";

const PLACEHOLDER = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";

function formatFetchedAt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

export function ScorePage({ onOpenInterview }: { onOpenInterview: (environmentId: number) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [mode, setMode] = useState<"paste" | "cve">("paste");
  const vectorInputRef = useRef<HTMLTextAreaElement>(null);

  const [vector, setVector] = useState("");
  const [result, setResult] = useState<ScoreResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [lookupSource, setLookupSource] = useState<{ cveId: string } | null>(null);

  const [cveId, setCveId] = useState("");
  const [cveLookup, setCveLookup] = useState<CveResponse | null>(null);
  const [cveError, setCveError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedVectorIndex, setSelectedVectorIndex] = useState(0);

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (mode === "paste") vectorInputRef.current?.focus();
  }, [mode]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!vector.trim()) return;
    setScoring(true);
    setError(null);
    try {
      const res = await scoreVector(vector.trim());
      setResult(res);
      setLookupSource(null);
    } catch (err) {
      setResult(null);
      setError(err instanceof Error ? err.message : "Couldn't score that vector");
    } finally {
      setScoring(false);
    }
  }

  async function performCveLookup(id: string, refresh: boolean) {
    if (refresh) setRefreshing(true);
    else setLookingUp(true);
    setCveError(null);
    try {
      const res = await lookupCve(id, { refresh });
      setCveLookup(res);
      const primaryIndex = res.vectors.findIndex((v) => v.vector === res.primaryVector);
      setSelectedVectorIndex(primaryIndex >= 0 ? primaryIndex : 0);
    } catch (err) {
      setCveLookup(null);
      setCveError(err instanceof Error ? err.message : "Couldn't look up that CVE");
      setMode("paste");
    } finally {
      setLookingUp(false);
      setRefreshing(false);
    }
  }

  async function handleCveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!cveId.trim()) return;
    await performCveLookup(cveId.trim(), false);
  }

  async function handleScoreCveVector() {
    if (!cveLookup) return;
    const chosenVector = cveLookup.vectors[selectedVectorIndex]?.vector ?? cveLookup.primaryVector;
    setScoring(true);
    setError(null);
    try {
      const res = await scoreVector(chosenVector);
      setResult(res);
      setLookupSource({ cveId: cveLookup.cveId });
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
          <p>Paste a CVSS v4.0, v3.1, or v3.0 vector — or look up a CVE — to see the base score against every environment you've defined.</p>
        </div>
      </div>

      <div className="mode-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "paste"}
          className={`mode-toggle-option ${mode === "paste" ? "is-active" : ""}`}
          onClick={() => setMode("paste")}
        >
          Paste a vector
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "cve"}
          className={`mode-toggle-option ${mode === "cve" ? "is-active" : ""}`}
          onClick={() => setMode("cve")}
        >
          Look up a CVE
        </button>
      </div>

      {mode === "paste" && (
        <form className="card score-form" onSubmit={handleSubmit}>
          <div className="field">
            <label htmlFor="vector-input">CVSS vector</label>
            <textarea
              id="vector-input"
              ref={vectorInputRef}
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
      )}

      {mode === "cve" && (
        <div className="card score-form">
          <form className="score-form" onSubmit={handleCveSubmit}>
            <div className="field">
              <label htmlFor="cve-input">CVE ID</label>
              <input
                id="cve-input"
                type="text"
                className="input"
                placeholder="CVE-2026-55200"
                value={cveId}
                onChange={(e) => setCveId(e.target.value)}
              />
            </div>
            <button type="submit" className="button button-primary" disabled={lookingUp || !cveId.trim()}>
              {lookingUp ? "Looking up…" : "Look up"}
            </button>
          </form>

          {cveLookup && (
            <div className="cve-lookup-result">
              <div className="cve-lookup-meta">
                <span>
                  {cveLookup.cached ? `Cached · fetched ${formatFetchedAt(cveLookup.fetchedAt)}` : "Fetched just now"}
                </span>
                <button
                  type="button"
                  className="link-button"
                  onClick={() => performCveLookup(cveLookup.cveId, true)}
                  disabled={refreshing}
                >
                  {refreshing ? "Refreshing…" : "Refresh"}
                </button>
              </div>

              {cveLookup.vectors.length > 1 ? (
                <NvdVectorPicker
                  vectors={cveLookup.vectors}
                  selectedIndex={selectedVectorIndex}
                  onSelect={setSelectedVectorIndex}
                />
              ) : (
                <p className="vector-string">{cveLookup.primaryVector}</p>
              )}

              <button type="button" className="button button-primary" onClick={handleScoreCveVector} disabled={scoring}>
                {scoring ? "Scoring…" : "Score it"}
              </button>
            </div>
          )}
        </div>
      )}

      {cveError && <p className="error-text">{cveError}</p>}
      {error && <p className="error-text">{error}</p>}

      {result && (
        <ScoreResult
          key={result.base.vector}
          result={result}
          catalog={catalog}
          onOpenInterview={onOpenInterview}
          defaultSaveLabel={lookupSource?.cveId}
          onSave={async (label) => {
            await saveVulnerability({ vector: result.base.vector, label, cveId: lookupSource?.cveId });
          }}
        />
      )}
    </div>
  );
}
