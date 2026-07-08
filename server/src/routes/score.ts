import { Hono } from "hono";

// Scoring math is intentionally not implemented yet. SPEC.md §2.4 requires
// evaluating a reference-validated library (ae-cvss-calculator is the
// leading candidate) against the test vectors in §10 before any scoring
// code is written — hand-rolled math without that validation is explicitly
// disallowed. See src/scoring/index.ts.
export function scoreRoutes() {
  const app = new Hono();

  app.post("/score", (c) => {
    return c.json(
      {
        error:
          "Scoring is not implemented yet. See SPEC.md §2.4 and src/scoring/index.ts for what's required before this can be built.",
      },
      501,
    );
  });

  return app;
}
