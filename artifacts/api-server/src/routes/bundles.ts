import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { bundles, bundleItems, products } from "@workspace/db/schema";

const bundlesRouter = new Hono<AppEnv>();

bundlesRouter.get("/bundles", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;

  const rows = await db
    .select()
    .from(bundles)
    .where(eq(bundles.shopId, shopId))
    .orderBy(desc(bundles.createdAt))
    .all();

  const allItems = await db
    .select()
    .from(bundleItems)
    .all();

  const itemsByBundle: Record<string, typeof allItems> = {};
  for (const item of allItems) {
    if (!itemsByBundle[item.bundleId]) itemsByBundle[item.bundleId] = [];
    itemsByBundle[item.bundleId].push(item);
  }

  return c.json(
    rows.map((b) => ({
      ...b,
      items: itemsByBundle[b.id] ?? [],
    })),
  );
});

bundlesRouter.post("/bundles", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const body = await c.req.json<{
    name: string;
    description?: string;
    priceOverride?: number;
    items: Array<{ productId: string; productName: string; qty: number }>;
  }>();

  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);
  if (!body.items?.length) return c.json({ error: "at least one item required" }, 400);

  const now = new Date().toISOString();
  const bundleId = crypto.randomUUID();

  await db.insert(bundles).values({
    id: bundleId,
    shopId,
    name: body.name.trim(),
    description: body.description?.trim() ?? null,
    priceOverride: body.priceOverride ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  for (const item of body.items) {
    // Resolve product name if not provided
    let productName = item.productName?.trim();
    if (!productName && item.productId) {
      const p = await db.select({ canonicalName: products.canonicalName })
        .from(products).where(eq(products.id, item.productId)).get();
      productName = p?.canonicalName ?? "Unknown";
    }
    await db.insert(bundleItems).values({
      id: crypto.randomUUID(),
      bundleId,
      productId: item.productId,
      productName,
      qty: item.qty,
    });
  }

  const bundle = await db.select().from(bundles).where(eq(bundles.id, bundleId)).get();
  const items = await db.select().from(bundleItems).where(eq(bundleItems.bundleId, bundleId)).all();
  return c.json({ ...bundle, items }, 201);
});

bundlesRouter.get("/bundles/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const id = c.req.param("id");

  const bundle = await db
    .select()
    .from(bundles)
    .where(and(eq(bundles.id, id), eq(bundles.shopId, shopId)))
    .get();
  if (!bundle) return c.json({ error: "Not found" }, 404);

  const items = await db
    .select()
    .from(bundleItems)
    .where(eq(bundleItems.bundleId, id))
    .all();

  return c.json({ ...bundle, items });
});

bundlesRouter.patch("/bundles/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    description?: string;
    priceOverride?: number | null;
    isActive?: boolean;
    items?: Array<{ productId: string; productName: string; qty: number }>;
  }>();

  const bundle = await db
    .select()
    .from(bundles)
    .where(and(eq(bundles.id, id), eq(bundles.shopId, shopId)))
    .get();
  if (!bundle) return c.json({ error: "Not found" }, 404);

  const patch: Partial<typeof bundle> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.description !== undefined) patch.description = body.description?.trim() ?? null;
  if (body.priceOverride !== undefined) patch.priceOverride = body.priceOverride;
  if (body.isActive !== undefined) patch.isActive = body.isActive;

  await db.update(bundles).set(patch).where(eq(bundles.id, id));

  if (body.items) {
    await db.delete(bundleItems).where(eq(bundleItems.bundleId, id));
    for (const item of body.items) {
      await db.insert(bundleItems).values({
        id: crypto.randomUUID(),
        bundleId: id,
        productId: item.productId,
        productName: item.productName?.trim() ?? "Unknown",
        qty: item.qty,
      });
    }
  }

  const updated = await db.select().from(bundles).where(eq(bundles.id, id)).get();
  const items = await db.select().from(bundleItems).where(eq(bundleItems.bundleId, id)).all();
  return c.json({ ...updated, items });
});

bundlesRouter.delete("/bundles/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const id = c.req.param("id");

  const bundle = await db
    .select()
    .from(bundles)
    .where(and(eq(bundles.id, id), eq(bundles.shopId, shopId)))
    .get();
  if (!bundle) return c.json({ error: "Not found" }, 404);

  await db.delete(bundles).where(eq(bundles.id, id));
  return c.json({ success: true });
});

export default bundlesRouter;
