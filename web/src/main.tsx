import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App.js";
import { applyTheme, getPreferredTheme } from "./lib/theme.js";
import "./styles.css";

// Applied before render, not inside a component, so the page never flashes
// the wrong theme while React mounts.
applyTheme(getPreferredTheme());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
