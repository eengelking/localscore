import { useEffect, useState } from "react";
import { getHealth, type HealthResponse } from "./api.js";

export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getHealth().then(setHealth).catch((err: Error) => setError(err.message));
  }, []);

  return (
    <main>
      <h1>localscore</h1>
      <p>
        Turns a CVSS base score into the score that actually applies to your systems. See{" "}
        <code>SPEC.md</code> for the implementation contract — this UI is scaffolding, not the
        product yet.
      </p>
      <p>
        API status:{" "}
        {error ? <span className="error">{error}</span> : health ? (health.ok ? "ok" : "degraded") : "checking…"}
      </p>
    </main>
  );
}
