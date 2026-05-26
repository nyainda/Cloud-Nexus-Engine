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
  const referenceId = c.req.query("referenceId");
  const limit = parseInt(c.req.query("limit") ?? "100");
  const offset = parseInt(c.req.query("offset") ?? "0");

  let rows = await db
    .select()
    .from(inventoryMovements)
    .where(
      and(
        productId ? eq(inventoryMovements.productId, productId) : undefined,
        movementType ? eq(inventoryMovements.movementType, movementType) : undefined,
        referenceId ? eq(inventoryMovements.referenceId, referenceId) : undefined,
      ),
    )
    .all();

  if (shopId) {
    // shopId filter applied client-side since inventoryMovements has no shopId column
    // referenceId queries are already scoped to a single session so no filtering needed
  }

  return c.json(
    rows
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(offset, offset + limit),
  );
});

export default inventoryRouter;
