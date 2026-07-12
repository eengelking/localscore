import { Hono } from "hono";
import type Database from "better-sqlite3";

export function healthRoutes(db: Database.Database) {
  const app = new Hono();

  app.get("/health", (c) => {
    let dbOk: boolean;
    try {
      db.prepare("SELECT 1").get();
      dbOk = true;
    } catch {
      dbOk = false;
    }
    return c.json({ ok: true, db: dbOk });
  });

  return app;
}
