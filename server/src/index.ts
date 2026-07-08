import path from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { openDb } from "./db/index.js";
import { config } from "./env.js";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { HttpError } from "./lib/errors.js";
import { catalogRoutes } from "./routes/catalog.js";
import { cveRoutes } from "./routes/cve.js";
import { environmentRoutes } from "./routes/environments.js";
import { healthRoutes } from "./routes/health.js";
import { scoreRoutes } from "./routes/score.js";
import { vulnerabilityRoutes } from "./routes/vulnerabilities.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webDist = path.join(__dirname, "..", "..", "web", "dist");

export function createApp(db = openDb()) {
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: err.message }, err.status as ContentfulStatusCode);
    }
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

  const api = new Hono();
  api.route("/", healthRoutes(db));
  api.route("/", catalogRoutes());
  api.route("/", environmentRoutes(db));
  api.route("/", scoreRoutes(db));
  api.route("/", cveRoutes(db));
  api.route("/", vulnerabilityRoutes(db));
  app.route("/api", api);

  // SPA fallback: serve built frontend assets for everything else.
  app.use("/*", serveStatic({ root: path.relative(process.cwd(), webDist) }));
  app.get("*", serveStatic({ path: path.join(path.relative(process.cwd(), webDist), "index.html") }));

  return app;
}

function main() {
  const db = openDb();
  const app = createApp(db);

  const server = serve({ fetch: app.fetch, port: config.port }, (info) => {
    console.log(`localscore listening on http://localhost:${info.port}`);
  });

  const shutdown = () => {
    console.log("Shutting down...");
    server.close(() => {
      db.close();
      process.exit(0);
    });
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
