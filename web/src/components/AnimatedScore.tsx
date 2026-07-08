import { useEffect, useRef, useState } from "react";
import { severityFromScore } from "../severity.js";
import { SeverityPill } from "./SeverityPill.js";

const DURATION_MS = 900;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// The signature moment: a score counting down (or up) from the base to the
// modified value, its severity color morphing in transit. This is the one
// deliberate animation in the app — everything else stays quiet.
export function AnimatedScore({ from, to, size = "lg" }: { from: number; to: number; size?: "lg" | "hero" }) {
  const [value, setValue] = useState(prefersReducedMotion() ? to : from);
  const raf = useRef<number>();

  useEffect(() => {
    if (prefersReducedMotion()) {
      setValue(to);
      return;
    }
    const start = performance.now();
    const startValue = from;
    function tick(now: number) {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / DURATION_MS);
      const eased = easeOutCubic(t);
      setValue(startValue + (to - startValue) * eased);
      if (t < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setValue(to);
      }
    }
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [from, to]);

  const severity = severityFromScore(value);
  const className = size === "hero" ? "score-figure score-figure-hero" : "score-figure score-figure-lg";

  return (
    <span className="animated-score">
      <span className={className} style={{ color: colorFor(severity) }}>
        {value.toFixed(1)}
      </span>
      <span className="severity-slot">
        <SeverityPill severity={severity} />
      </span>
    </span>
  );
}

function colorFor(severity: ReturnType<typeof severityFromScore>): string {
  switch (severity) {
    case "None":
      return "var(--ink-muted)";
    case "Low":
      return "var(--severity-low)";
    case "Medium":
      return "var(--severity-medium)";
    case "High":
      return "var(--severity-high)";
    case "Critical":
      return "var(--severity-critical)";
  }
}
