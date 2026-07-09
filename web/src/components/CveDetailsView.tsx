import { useState } from "react";
import type { CveDetails } from "../types.js";

const DESCRIPTION_CLAMP_LENGTH = 320;

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString();
}

// Shared by the CVE lookup flow and the saved-vulnerability detail view
// (docs/SPEC03.md §7.4) — same component either way, so a saved CVE shows
// identical context to a fresh lookup.
export function CveDetailsView({ details }: { details: CveDetails }) {
  const [expanded, setExpanded] = useState(false);
  const description = details.description ?? "";
  const isLong = description.length > DESCRIPTION_CLAMP_LENGTH;
  const shownDescription = isLong && !expanded ? `${description.slice(0, DESCRIPTION_CLAMP_LENGTH)}…` : description;

  const published = formatDate(details.published);
  const lastModified = formatDate(details.lastModified);

  const sortedReferences = details.references;

  return (
    <div className="cve-details">
      {description && (
        <div className="cve-details-description">
          <p>{shownDescription}</p>
          {isLong && (
            <button type="button" className="link-button" onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Show Less" : "Show More"}
            </button>
          )}
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
    </div>
  );
}
