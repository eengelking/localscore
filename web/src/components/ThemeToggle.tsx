import { useState } from "react";
import { Icon } from "./Icon.js";
import { applyTheme, getPreferredTheme, storeTheme, type Theme } from "../lib/theme.js";

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => getPreferredTheme());

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    applyTheme(next);
    storeTheme(next);
  }

  return (
    <button
      type="button"
      className="icon-button icon-button-quiet"
      aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
      onClick={toggle}
    >
      <Icon name={theme === "dark" ? "sun" : "moon"} />
    </button>
  );
}
