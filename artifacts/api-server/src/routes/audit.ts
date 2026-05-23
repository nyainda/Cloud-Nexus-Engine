import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { auditLog } from "@workspace/db/schema";

const auditRouter = new Hono<AppEnv>();

async function auditHandler(c: Parameters<Parameters<typeof auditRouter.get>[1]>[0]) {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const action = c.req.query("action");
  const limit = parseInt(c.req.query("limit") ?? "100");
  const offset = parseInt(c.req.query("offset") ?? "0");

  let rows = await db
    .select()
    .from(auditLog)
    .where(
      and(
        shopId ? eq(auditLog.shopId, shopId) : undefined,
        action ? eq(auditLog.action, action) : undefined,
      ),
    )
    .all();

  rows = rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return c.json(
    rows.slice(offset, offset + limit).map((e) => ({
      ...e,
      oldValue: e.oldValueJson ? JSON.parse(e.oldValueJson) : null,
      newValue: e.newValueJson ? JSON.parse(e.newValueJson) : null,
    })),
  );
}

auditRouter.get("/audit", requireAuth, auditHandler);
auditRouter.get("/audit-log", requireAuth, auditHandler);

export default auditRouter;
