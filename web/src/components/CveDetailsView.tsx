import { useState } from "react";
import type { CveDetails } from "../types.js";
import { Icon } from "./Icon.js";

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString();
}

// Shared by the CVE lookup flow and the saved-vulnerability detail view —
// same component either way, so a saved CVE shows identical context to a
// fresh lookup. Collapsed by default in both places (score/vector content
// is the page's job; these details are reference material) — always
// starts collapsed on a fresh render, no open-state persistence.
export function CveDetailsView({
  details,
  cveId,
  showDescription = true,
}: {
  details: CveDetails;
  cveId?: string | null;
  showDescription?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const description = showDescription ? (details.description ?? "") : "";

  const published = formatDate(details.published);
  const lastModified = formatDate(details.lastModified);

  const sortedReferences = details.references;

  return (
    <div className="cve-details">
      <button
        type="button"
        className="cve-details-summary"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span>
          CVE Details
          {published && <span className="cve-details-summary-meta"> · Published {published}</span>}
        </span>
        <span className={`disclosure ${open ? "is-open" : ""}`} aria-hidden="true">
          <Icon name="chevron" size={20} />
        </span>
      </button>

      {open && (
        <div className="cve-details-body">
          {description && (
            <div className="cve-details-description">
              <p>{description}</p>
            </div>
          )}

          {(published || lastModified) && (
            <p className="cve-details-dates">
              {published && <span>Published {published}</span>}
              {lastModified && <span>Last modified {lastModified}</span>}
            </p>
          )}

          {details.affectedProducts.items.length > 0 && (
            <div className="cve-details-section">
              <span className="cve-details-heading">Affected products (from NVD)</span>
              <div className="badge-row">
                {details.affectedProducts.items.map((product) => (
                  <span key={product} className="badge">
                    {product}
                  </span>
                ))}
                {details.affectedProducts.moreCount > 0 && (
                  <span className="badge">+{details.affectedProducts.moreCount} more</span>
                )}
              </div>
            </div>
          )}

          {sortedReferences.length > 0 && (
            <div className="cve-details-section">
              <span className="cve-details-heading">References</span>
              <ul className="cve-details-references">
                {sortedReferences.map((ref) => (
                  <li key={ref.url}>
                    <a href={ref.url} target="_blank" rel="noopener noreferrer">
                      {ref.source ?? ref.url}
                    </a>
                    {ref.tags?.map((tag) => (
                      <span key={tag} className="badge cve-details-reference-tag">
                        {tag}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {cveId && (
            <div className="cve-details-footer">
              <a
                href={`https://nvd.nist.gov/vuln/detail/${cveId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="cve-details-nvd-link"
                aria-label={`View ${cveId} on NVD`}
              >
                NVD <Icon name="external-link" size={14} />
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
