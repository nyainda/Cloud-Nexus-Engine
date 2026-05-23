import { Hono } from "hono";
import type { AppEnv } from "../types";

const health = new Hono<AppEnv>();

health.get("/healthz", async (c) => {
  const d1 = c.env?.DB as D1Database | undefined;
  if (d1) {
    try {
      await d1.prepare("SELECT 1 AS ok").run();
      return c.json({ status: "ok", db: "d1" });
    } catch (err) {
      return c.json({ status: "error", db: "d1", error: String(err) }, 500);
    }
  }
  return c.json({ status: "ok", db: "sqlite" });
});

export default health;
