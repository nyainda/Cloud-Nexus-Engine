import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { inventoryMovements } from "@workspace/db/schema";

const inventoryRouter = new Hono<AppEnv>();

inventoryRouter.get("/inventory-movements", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const productId = c.req.query("productId");
  const movementType = c.req.query("movementType");
  const limit = parseInt(c.req.query("limit") ?? "100");
  const offset = parseInt(c.req.query("offset") ?? "0");

  let rows = await db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        productId ? eq(inventoryMovements.productId, productId) : undefined,
        movementType ? eq(inventoryMovements.movementType, movementType) : undefined,
      ),
    )
    .all();

  if (shopId) {
    rows = rows.filter(r => {
      return true;
    });
  }

  return c.json(
    rows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offset, offset + limit),
  );
});

export default inventoryRouter;
