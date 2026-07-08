import { Hono } from "hono";

// Saved-vulnerability CRUD per SPEC.md §8 — depends on scoring (§score.ts)
// being implemented first, since a save happens from a scored result.
export function vulnerabilityRoutes() {
  const app = new Hono();

  app.get("/vulnerabilities", (c) => {
    return c.json({ error: "Not implemented yet. See SPEC.md §8." }, 501);
  });

  return app;
}
