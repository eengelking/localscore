import { useState } from "react";
import { Icon } from "./Icon.js";
import { applyTheme, getPreferredTheme, storeTheme, type Theme } from "../lib/theme.js";

// An on/off switch (mobile convention) rather than a quiet icon button —
// light = off (thumb left), dark = on (thumb right, accent-filled track).
// The active icon rides inside the sliding thumb (both icons static in the
// track with the thumb covering one was considered and passed over as
// cluttered at this control's size).
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());
  const isDark = theme === "dark";

  function toggle() {
    const next: Theme = isDark ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    storeTheme(next);
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={isDark}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="theme-switch"
      onClick={toggle}
    >
      <span className="theme-switch-track">
        <span className="theme-switch-thumb">
          <Icon name={isDark ? "moon" : "sun"} size={18} />
        </span>
      </span>
    </button>
  );
}
