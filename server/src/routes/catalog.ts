import { Hono } from "hono";
import { CATALOG, CATALOG_VERSION } from "../catalog/index.js";

export function catalogRoutes() {
  const app = new Hono();

  app.get("/catalog", (c) => {
    return c.json({ catalogVersion: CATALOG_VERSION, questions: CATALOG });
  });

  return app;
}
