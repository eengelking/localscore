import { useEffect, useRef, useState } from "react";
import {
  ApiRequestError,
  getCatalog,
  getMajorCves,
  listVulnerabilities,
  lookupCve,
  saveVulnerability,
  scoreVector,
} from "../api.js";
import { CveDetailsView } from "../components/CveDetailsView.js";
import { Icon } from "../components/Icon.js";
import { MoreExpander } from "../components/MoreExpander.js";
import { NvdVectorPicker } from "../components/NvdVectorPicker.js";
import { ScoreResult } from "../components/ScoreResult.js";
import { SeverityPill } from "../components/SeverityPill.js";
import { WarningBanner } from "../components/WarningBanner.js";
import { useOnlineStatus } from "../lib/online.js";
import { nvdSeverityToAppSeverity } from "../lib/severity.js";
import type { Catalog, CveResponse, MajorCvesResponse, SavedVulnerability, ScoreResponse } from "../types.js";

const PLACEHOLDER = "CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H";
const OFFLINE_TOOLTIP = "Internet connection required to look up a CVE.";

type Mode = "cve" | "paste" | "major";

function formatFetchedAt(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString();
}

function formatPublished(iso: string): string {
  return new Date(iso).toLocaleDateString();
}

export function ScorePage({ onOpenInterview }: { onOpenInterview: (environmentId: number) => void }) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [isOnline, setIsOnline] = useOnlineStatus();
  const [mode, setMode] = useState<Mode>(() => (typeof navigator === "undefined" || navigator.onLine ? "cve" : "paste"));
  const vectorInputRef = useRef<HTMLTextAreaElement>(null);
  const cveInputRef = useRef<HTMLInputElement>(null);

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

  const [majorCves, setMajorCves] = useState<MajorCvesResponse | null>(null);
  const [majorCvesError, setMajorCvesError] = useState<string | null>(null);
  const [majorCvesLoading, setMajorCvesLoading] = useState(true);

  const [savedVulnerabilities, setSavedVulnerabilities] = useState<SavedVulnerability[] | null>(null);

  const majorCvesTabDisabled = !isOnline && !majorCves;
  const cveTabDisabled = !isOnline;

  useEffect(() => {
    getCatalog()
      .then(setCatalog)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    listVulnerabilities()
      .then(setSavedVulnerabilities)
      .catch(() => undefined);
  }, []);

  function refreshSavedVulnerabilities() {
    listVulnerabilities()
      .then(setSavedVulnerabilities)
      .catch(() => undefined);
  }

  useEffect(() => {
    setMajorCvesLoading(true);
    getMajorCves()
      .then((res) => {
        setMajorCves(res);
        setMajorCvesError(null);
      })
      .catch((err) => {
        setMajorCvesError(err instanceof Error ? err.message : "Couldn't load major CVEs right now.");
      })
      .finally(() => setMajorCvesLoading(false));
  }, []);

  // docs/SPEC05.md §4.1: whichever tab with an input is active takes focus,
  // symmetrically — including on initial mount, since "Look up a CVE" is the
  // default tab. The Major CVEs tab has no input and focuses nothing.
  useEffect(() => {
    if (mode === "cve") cveInputRef.current?.focus();
    if (mode === "paste") vectorInputRef.current?.focus();
  }, [mode]);

  // If we go offline while on a tab that requires the network, fall back to
  // the paste tab per SPEC02 §6.4.
  useEffect(() => {
    if (!isOnline && (mode === "cve" || (mode === "major" && !majorCves))) {
      setMode("paste");
    }
  }, [isOnline, mode, majorCves]);

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
      // NVD-unreachable specifically (not "not found" / "no CVSS data") means
      // we likely have no real connectivity — redirect to the paste tab per
      // v1 behavior (§6.3), and treat it as evidence the browser is offline
      // even if navigator.onLine disagreed.
      if (err instanceof ApiRequestError && err.status === 502) {
        setIsOnline(false);
        setMode("paste");
      }
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

  function handleMajorCveClick(id: string) {
    setMode("cve");
    setCveId(id);
    void performCveLookup(id, false);
  }

  const overwriteTarget =
    result && savedVulnerabilities
      ? savedVulnerabilities.find((v) =>
          lookupSource?.cveId ? v.cveId === lookupSource.cveId : v.vector === result.base.vector,
        )
      : undefined;

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1>Scoring</h1>
          <p>
            Paste a CVSS score or vector from a scanner, or look up a CVE by ID, to see how it plays out for every
            location you've defined, not just the worst case.
          </p>
          <MoreExpander>
            <p>
              A <strong>CVE</strong> (Common Vulnerabilities and Exposures) is a published, uniquely-numbered
              vulnerability record. You'll find CVE IDs in scanner output, vendor advisories, and security news. A{" "}
              <strong>CVSS vector</strong> is the short string (like <code>{PLACEHOLDER}</code>) that encodes how
              severe a vulnerability is under the official scoring standard; it's what NVD, MITRE, and most scanners
              (Trivy, Grype, and similar) report alongside a CVE.
            </p>
            <p>
              <strong>localscore</strong> takes that vector, applies the environmental profile you built in the
              interview for each location, and shows you the score that actually applies there, which can be much
              lower (or higher) than the published worst-case number.
            </p>
            <p>
              Look one up directly: <a href="https://nvd.nist.gov/vuln/search" target="_blank" rel="noopener noreferrer">NVD's CVE search</a>{" "}
              or <a href="https://cve.mitre.org/cve/search_cve_list.html" target="_blank" rel="noopener noreferrer">MITRE's CVE list</a>.
            </p>
          </MoreExpander>
        </div>
      </div>

      <div className="tabs-shell">
      <div className="tabs" role="tablist" aria-label="Scoring input mode">
        <button
          type="button"
          role="tab"
          id="tab-cve"
          aria-selected={mode === "cve"}
          aria-controls="panel-cve"
          className={`tab ${mode === "cve" ? "is-active" : ""}`}
          disabled={cveTabDisabled}
          title={cveTabDisabled ? OFFLINE_TOOLTIP : undefined}
          onClick={() => setMode("cve")}
        >
          Look Up a CVE
        </button>
        <button
          type="button"
          role="tab"
          id="tab-paste"
          aria-selected={mode === "paste"}
          aria-controls="panel-paste"
          className={`tab ${mode === "paste" ? "is-active" : ""}`}
          onClick={() => setMode("paste")}
        >
          Paste a Vector
        </button>
        <button
          type="button"
          role="tab"
          id="tab-major"
          aria-selected={mode === "major"}
          aria-controls="panel-major"
          className={`tab ${mode === "major" ? "is-active" : ""}`}
          disabled={majorCvesTabDisabled}
          title={majorCvesTabDisabled ? OFFLINE_TOOLTIP : undefined}
          onClick={() => setMode("major")}
        >
          Major CVEs
        </button>
      </div>

      {mode === "paste" && (
        <form
          className="card tab-panel score-form"
          id="panel-paste"
          role="tabpanel"
          aria-labelledby="tab-paste"
          onSubmit={handleSubmit}
        >
          <p className="tab-purpose">
            Paste a CVSS vector from a scanner or advisory to score it against your environments.
          </p>
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
            {scoring ? "Scoring…" : "Score It"}
          </button>
        </form>
      )}

      {mode === "cve" && (
        <div className="card tab-panel score-form" id="panel-cve" role="tabpanel" aria-labelledby="tab-cve">
          <p className="tab-purpose">
            Enter a CVE ID (like CVE-2026-55200) to fetch its official score and details from NVD and see how it
            applies to your environments.
          </p>
          <form className="score-form" onSubmit={handleCveSubmit}>
            <div className="field">
              <label htmlFor="cve-input">CVE ID</label>
              <input
                id="cve-input"
                ref={cveInputRef}
                type="text"
                className="input"
                placeholder="CVE-2026-55200"
                value={cveId}
                onChange={(e) => setCveId(e.target.value)}
              />
            </div>
            <button type="submit" className="button button-primary" disabled={lookingUp || !cveId.trim()}>
              {lookingUp ? "Looking Up…" : "Look Up"}
            </button>
          </form>

          {cveError && <WarningBanner>{cveError}</WarningBanner>}

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
                {scoring ? "Scoring…" : "Score It"}
              </button>

              {cveLookup.details && <CveDetailsView details={cveLookup.details} cveId={cveLookup.cveId} />}
            </div>
          )}
        </div>
      )}

      {mode === "major" && (
        <div className="card tab-panel major-cves-panel" id="panel-major" role="tabpanel" aria-labelledby="tab-major">
          <p className="tab-purpose">
            The ten most critical CVEs published in the last 30 days, from NVD. Click one to look it up.
          </p>
          {majorCvesLoading && !majorCves && <p>Loading…</p>}
          {majorCvesError && !majorCves && <WarningBanner>{majorCvesError}</WarningBanner>}
          {majorCves && (
            <>
              <p className="major-cves-meta">
                {majorCves.cached ? `Last updated ${formatFetchedAt(majorCves.fetchedAt)}` : "Updated just now"}
              </p>
              {majorCves.cves.length === 0 ? (
                <p>No critical CVEs published in the last 30 days.</p>
              ) : (
                <ul className="major-cves-list">
                  {majorCves.cves.map((cve) => (
                    <li key={cve.cveId}>
                      <div className="major-cve-row">
                        <button
                          type="button"
                          className="major-cve-row-lookup"
                          onClick={() => handleMajorCveClick(cve.cveId)}
                        >
                          <span className="major-cve-id">{cve.cveId}</span>
                          <span className="major-cve-figures">
                            <SeverityPill
                              severity={nvdSeverityToAppSeverity(cve.baseSeverity, cve.baseScore)}
                              variant="outline"
                            />
                            <span className="score-figure">{cve.baseScore.toFixed(1)}</span>
                            <span className="major-cve-date">{formatPublished(cve.published)}</span>
                          </span>
                        </button>
                        <a
                          href={`https://nvd.nist.gov/vuln/detail/${cve.cveId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="major-cve-nvd-link"
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`View ${cve.cveId} on NVD`}
                        >
                          NVD <Icon name="external-link" size={14} />
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
      </div>

      {error && <p className="error-text">{error}</p>}

      {result && (
        <ScoreResult
          key={result.base.vector}
          result={result}
          catalog={catalog}
          onOpenInterview={onOpenInterview}
          defaultSaveLabel={lookupSource?.cveId}
          overwriteLabel={overwriteTarget ? (overwriteTarget.cveId ?? overwriteTarget.label) : undefined}
          onSave={async (label) => {
            await saveVulnerability({ vector: result.base.vector, label, cveId: lookupSource?.cveId });
            refreshSavedVulnerabilities();
          }}
        />
      )}
    </div>
  );
}
