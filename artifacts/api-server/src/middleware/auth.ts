import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { getSession } from "../lib/auth";

export const requireAuth = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json({ error: "Unauthorized" }, 401);
  }
  const token = auth.replace("Bearer ", "");
  const session = await getSession(c.env.SESSIONS, token);
  if (!session) {
    return c.json({ error: "Session expired or invalid" }, 401);
  }
  c.set("session", session);
  await next();
});

export const requireOwner = createMiddleware<AppEnv>(async (c, next) => {
  const session = c.get("session");
  if (!session || session.role !== "owner") {
    return c.json({ error: "Owner access required" }, 403);
  }
  await next();
});
