import { Hono } from "hono";

// NVD lookup per SPEC.md §7 — not implemented yet.
export function cveRoutes() {
  const app = new Hono();

  app.get("/cve/:cveId", (c) => {
    return c.json({ error: "NVD lookup is not implemented yet. See SPEC.md §7." }, 501);
  });

  return app;
}
