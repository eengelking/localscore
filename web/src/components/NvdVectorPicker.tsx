import { nvdSeverityToAppSeverity } from "../lib/severity.js";
import type { NvdVectorOption } from "../types.js";
import { SeverityPill } from "./SeverityPill.js";

export function NvdVectorPicker({
  vectors,
  selectedIndex,
  onSelect,
}: {
  vectors: NvdVectorOption[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div className="option-list">
      {vectors.map((option, index) => (
        <button
          key={`${option.source}-${option.version}-${index}`}
          type="button"
          className={`option-card vector-option-card ${index === selectedIndex ? "is-selected" : ""}`}
          onClick={() => onSelect(index)}
        >
          <span className="vector-option-header">
            <span className="option-label">
              CVSS {option.version} · {option.type}
            </span>
            <SeverityPill severity={nvdSeverityToAppSeverity(option.baseSeverity, option.baseScore)} />
          </span>
          <span className="option-description">{option.source}</span>
          <span className="vector-string">{option.vector}</span>
        </button>
      ))}
    </div>
  );
}
