import { useState } from "react";
import { EnvironmentEditPage } from "./pages/EnvironmentEditPage.js";
import { EnvironmentsPage } from "./pages/EnvironmentsPage.js";
import { InterviewPage } from "./pages/InterviewPage.js";
import { SavedVulnerabilitiesPage } from "./pages/SavedVulnerabilitiesPage.js";
import { ScorePage } from "./pages/ScorePage.js";
import { ThemeToggle } from "./components/ThemeToggle.js";

type View =
  | { name: "environments" }
  | { name: "environment-edit"; environmentId: number }
  | { name: "interview"; environmentId: number }
  | { name: "score" }
  | { name: "vulnerabilities" };

export function App() {
  const [view, setView] = useState<View>({ name: "environments" });

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-inner">
          <a
            className="wordmark"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setView({ name: "environments" });
            }}
          >
            localscore
            <small>real risk, not worst case</small>
          </a>
          <nav className="nav">
            <button
              type="button"
              className={`nav-link ${view.name === "environments" ? "is-active" : ""}`}
              onClick={() => setView({ name: "environments" })}
            >
              Environments
            </button>
            <button
              type="button"
              className={`nav-link ${view.name === "score" ? "is-active" : ""}`}
              onClick={() => setView({ name: "score" })}
            >
              Scoring
            </button>
            <button
              type="button"
              className={`nav-link ${view.name === "vulnerabilities" ? "is-active" : ""}`}
              onClick={() => setView({ name: "vulnerabilities" })}
            >
              Saved
            </button>
          </nav>
          <ThemeToggle />
        </div>
      </header>

      <main>
        {view.name === "environments" && (
          <EnvironmentsPage
            onOpenInterview={(environmentId) => setView({ name: "interview", environmentId })}
            onOpenEdit={(environmentId) => setView({ name: "environment-edit", environmentId })}
          />
        )}
        {view.name === "environment-edit" && (
          <EnvironmentEditPage
            environmentId={view.environmentId}
            onDone={() => setView({ name: "environments" })}
            onOpenInterview={(environmentId) => setView({ name: "interview", environmentId })}
          />
        )}
        {view.name === "interview" && (
          <InterviewPage
            environmentId={view.environmentId}
            onDone={() => setView({ name: "environment-edit", environmentId: view.environmentId })}
          />
        )}
        {view.name === "score" && (
          <ScorePage onOpenInterview={(environmentId) => setView({ name: "interview", environmentId })} />
        )}
        {view.name === "vulnerabilities" && (
          <SavedVulnerabilitiesPage
            onOpenInterview={(environmentId) => setView({ name: "interview", environmentId })}
          />
        )}
      </main>
    </div>
  );
}
