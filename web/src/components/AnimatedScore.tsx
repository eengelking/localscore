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
      // This effect drives a requestAnimationFrame loop syncing `value` to
      // the DOM's timing APIs, a legitimate external-system effect, not a
      // derived-render calculation. Snapping straight to the final value
      // when motion is reduced is the same kind of synchronous update as
      // the animation ticks below, just skipping the animation itself.
      // eslint-disable-next-line react-hooks/set-state-in-effect
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

// Uses the --severity-*-text tokens (validated for text-on-
// surface use) rather than the raw pill-fill tokens. The fills were
// deepened for white pill text and read poorly as foreground text
// themselves at --surface (medium lands at 4.39:1, just under 4.5:1); the
// -text tokens clear contrast in both themes without any of that risk.
function colorFor(severity: ReturnType<typeof severityFromScore>): string {
  switch (severity) {
    case "None":
      return "var(--ink-muted)";
    case "Low":
      return "var(--severity-low-text)";
    case "Medium":
      return "var(--severity-medium-text)";
    case "High":
      return "var(--severity-high-text)";
    case "Critical":
      return "var(--severity-critical-text)";
  }
}
