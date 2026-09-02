import { Hono } from "hono";
import { eq, and, like, or, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb, normalizeProductName } from "../lib/db";
import { requireAuth, requireOwner } from "../middleware/auth";
import { kvGet, kvSet, kvDel, CK, CACHE_TTL } from "../lib/cache";
import {
  products,
  productAliases,
  priceHistory,
  inventoryMovements,
  notifications,
} from "@workspace/db/schema";

// Bulk import → products-import.ts
// Stock transfer → products-transfer.ts

const productsRouter = new Hono<AppEnv>();

productsRouter.get("/products", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const q = c.req.query("q")?.trim();
  const category = c.req.query("category");
  const lowStock = c.req.query("lowStock");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 3000);
  const offset = parseInt(c.req.query("offset") ?? "0");

  // NOTE: product list cache intentionally removed.
  // The in-memory cache is per-CF-isolate. With multiple warm isolates,
  // a product created on isolate A clears A's cache, but GET routed to isolate B
  // still serves B's stale 5-minute cache → the "disappearing product" bug.
  // D1 queries run in ~50-100ms, well within our 800ms budget, so no cache needed.

  // ── SQL search path ────────────────────────────────────────────────────────
  // Keep product search on the products table so each product write updates
  // only products. The old FTS5 triggers multiplied product writes and were
  // unnecessary for this catalog size; these indexed/filterable columns are
  // sufficient for the POS search workload.
  const conditions: ReturnType<typeof eq>[] = [];
  if (shopId) conditions.push(eq(products.shopId, shopId));
  conditions.push(eq(products.isActive, true));
  if (category) conditions.push(eq(products.category, category));
  if (lowStock === "true") conditions.push(sql`${products.stockQty} <= ${products.alertQty}` as any);

  if (q) {
    const norm = normalizeProductName(q);
    conditions.push(
      or(
        like(products.normalizedName, `%${norm}%`),
        like(products.canonicalName, `%${q}%`),
        like(products.sku, `%${q}%`),
        like(products.category, `%${q}%`),
      ) as any,
    );
  }

  const where = conditions.length ? and(...(conditions as any[])) : undefined;

  const [countRows, rows] = await Promise.all([
    db.select({ n: sql<number>`count(*)` }).from(products).where(where).all(),
    db.select().from(products).where(where).limit(limit).offset(offset).all(),
  ]);

  const total = Number(countRows[0]?.n ?? 0);
  const payload = {
    products: rows.map((p) => {
      // Strip heavy internal fields never used by the frontend
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tokensJson, normalizedName, ...rest } = p as any;
      return rest;
    }),
    total,
  };
  return c.json(payload);
});

productsRouter.post("/products", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    canonicalName: string;
    sku?: string;
    category?: string;
    unit?: string;
    productType?: string;
    allowDecimals?: boolean;
    purchasePrice?: number;
    sellingPrice?: number;
    stockQty?: number;
    alertQty?: number;
    size?: string;
    expiryDate?: string;
  }>();
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const profitMargin =
    body.purchasePrice && body.sellingPrice
      ? ((body.sellingPrice - body.purchasePrice) / body.sellingPrice) * 100
      : null;

  await db.insert(products).values({
    id,
    shopId: body.shopId,
    canonicalName: body.canonicalName,
    normalizedName: normalizeProductName(body.canonicalName),
    sku: body.sku ?? null,
    category: body.category ?? null,
    unit: body.unit ?? "unit",
    productType: body.productType ?? "normal",
    allowDecimals: body.allowDecimals ?? false,
    purchasePrice: body.purchasePrice ?? null,
    sellingPrice: body.sellingPrice ?? null,
    profitMargin,
    stockQty: body.stockQty ?? 0,
    alertQty: body.alertQty ?? 5,
    size: body.size ?? null,
    expiryDate: body.expiryDate ?? null,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, id))
    .get();
  await kvDel(c.env.SESSIONS, CK.products(body.shopId));
  return c.json(
    { ...product!, tokens: product!.tokensJson ? JSON.parse(product!.tokensJson) : null },
    201,
  );
});

productsRouter.get("/products/:productId", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, c.req.param("productId")))
    .get();
  if (!product) return c.json({ error: "Not found" }, 404);
  return c.json({
    ...product,
    tokens: product.tokensJson ? JSON.parse(product.tokensJson) : null,
  });
});

productsRouter.patch("/products/:productId", requireAuth, async (c) => {
  const body = await c.req.json<{
    canonicalName?: string;
    sellingPrice?: number | null;
    purchasePrice?: number | null;
    stockQty?: number;
    alertQty?: number;
    category?: string | null;
    unit?: string;
    productType?: string;
    allowDecimals?: boolean;
    size?: string | null;
    isActive?: boolean;
    sku?: string | null;
    expiryDate?: string | null;
  }>();
  const db = createDb(c.env.DB);
  const productId = c.req.param("productId");
  const session = c.get("session");
  const existing = await db.select({ shopId: products.shopId }).from(products).where(eq(products.id, productId)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.shopId !== session.shopId) return c.json({ error: "Forbidden" }, 403);
  const now = new Date().toISOString();
  const patch: Partial<typeof products.$inferInsert> = { updatedAt: now };
  if (body.canonicalName) {
    patch.canonicalName = body.canonicalName;
    patch.normalizedName = normalizeProductName(body.canonicalName);
  }
  if ("sellingPrice" in body) patch.sellingPrice = body.sellingPrice ?? undefined;
  if ("purchasePrice" in body) patch.purchasePrice = body.purchasePrice ?? undefined;
  if ("stockQty" in body) patch.stockQty = body.stockQty;
  if ("alertQty" in body) patch.alertQty = body.alertQty;
  if ("category" in body) patch.category = body.category ?? undefined;
  if ("unit" in body) patch.unit = body.unit;
  if ("productType" in body) patch.productType = body.productType;
  if ("allowDecimals" in body) patch.allowDecimals = body.allowDecimals;
  if ("size" in body) patch.size = body.size ?? undefined;
  if ("isActive" in body) patch.isActive = body.isActive;
  if ("sku" in body) patch.sku = body.sku ?? undefined;
  if ("expiryDate" in body) patch.expiryDate = body.expiryDate ?? undefined;
  if (patch.sellingPrice != null && patch.purchasePrice != null) {
    patch.profitMargin = ((patch.sellingPrice - patch.purchasePrice) / patch.sellingPrice) * 100;
  }
  await db
    .update(products)
    .set(patch)
    .where(eq(products.id, c.req.param("productId")));
  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, c.req.param("productId")))
    .get();
  if (!product) return c.json({ error: "Not found" }, 404);
  await kvDel(c.env.SESSIONS, CK.products(existing.shopId));
  return c.json({
    ...product,
    tokens: product.tokensJson ? JSON.parse(product.tokensJson) : null,
  });
});

productsRouter.delete("/products/:productId", requireAuth, requireOwner, async (c) => {
  const db = createDb(c.env.DB);
  const productId = c.req.param("productId");
  const session = c.get("session");
  const existing = await db.select({ shopId: products.shopId }).from(products).where(eq(products.id, productId)).get();
  if (!existing) return c.json({ error: "Not found" }, 404);
  if (existing.shopId !== session.shopId) return c.json({ error: "Forbidden" }, 403);
  await db
    .update(products)
    .set({ isActive: false, updatedAt: new Date().toISOString() })
    .where(eq(products.id, productId));
  await kvDel(c.env.SESSIONS, CK.products(existing.shopId));
  return c.body(null, 204);
});

productsRouter.post("/products/:productId/restock", requireAuth, async (c) => {
  const body = await c.req.json<{
    qty: number;
    newPurchasePrice?: number;
    newSellingPrice?: number;
    performedBy?: string;
  }>();
  const db = createDb(c.env.DB);
  const productId = c.req.param("productId");
  const product = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .get();
  if (!product) return c.json({ error: "Not found" }, 404);

  const beforeQty = product.stockQty;
  const afterQty = beforeQty + body.qty;
  const now = new Date().toISOString();

  const hasPriceChange =
    body.newPurchasePrice !== undefined || body.newSellingPrice !== undefined;

  const newPurchasePrice = body.newPurchasePrice ?? product.purchasePrice;
  const newSellingPrice = body.newSellingPrice ?? product.sellingPrice;
  const newProfitMargin =
    hasPriceChange && newPurchasePrice && newSellingPrice
      ? ((newSellingPrice - newPurchasePrice) / newSellingPrice) * 100
      : product.profitMargin;

  if (hasPriceChange) {
    try {
      await db.insert(priceHistory).values({
        id: crypto.randomUUID(),
        productId,
        oldPurchasePrice: product.purchasePrice,
        newPurchasePrice: body.newPurchasePrice ?? product.purchasePrice,
        oldSellingPrice: product.sellingPrice,
        newSellingPrice: body.newSellingPrice ?? product.sellingPrice,
        pctChange:
          product.sellingPrice && body.newSellingPrice
            ? ((body.newSellingPrice - product.sellingPrice) /
                product.sellingPrice) *
              100
            : null,
        changedBy: body.performedBy ?? null,
        changedAt: now,
      });
    } catch (err) {
      console.warn("[restock] price_history insert failed (non-fatal):", err);
    }
  }

  // Atomic increment — never calculate final qty on the app server and write it.
  // Using stockQty = stockQty + qty prevents lost updates if two restocks arrive
  // concurrently (each adds its own delta rather than overwriting with a stale total).
  await db
    .update(products)
    .set({
      stockQty: sql`${products.stockQty} + ${body.qty}`,
      updatedAt: now,
      ...(body.newPurchasePrice !== undefined && { purchasePrice: body.newPurchasePrice }),
      ...(body.newSellingPrice !== undefined && { sellingPrice: body.newSellingPrice }),
      ...(hasPriceChange && { profitMargin: newProfitMargin ?? undefined }),
    })
    .where(eq(products.id, productId));

  await db.insert(inventoryMovements).values({
    id: crypto.randomUUID(),
    productId,
    productName: product.canonicalName,
    movementType: "restock",
    qtyChange: body.qty,
    beforeQty,
    afterQty,
    source: "manual",
    referenceId: null,
    createdBy: body.performedBy ?? null,
    createdAt: now,
  });

  if (afterQty > product.alertQty) {
    await db
      .delete(notifications)
      .where(
        and(
          eq(notifications.productId, productId),
          eq(notifications.type, "low_stock"),
          eq(notifications.isRead, false),
        ),
      );
  }

  const updated = await db
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .get();
  await kvDel(c.env.SESSIONS, CK.products(product.shopId));
  return c.json({
    ...updated!,
    tokens: updated!.tokensJson ? JSON.parse(updated!.tokensJson) : null,
  });
});

productsRouter.get(
  "/products/:productId/price-history",
  requireAuth,
  async (c) => {
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(priceHistory)
      .where(eq(priceHistory.productId, c.req.param("productId")))
      .all();
    return c.json(rows);
  },
);

productsRouter.get(
  "/products/:productId/aliases",
  requireAuth,
  async (c) => {
    const db = createDb(c.env.DB);
    const rows = await db
      .select()
      .from(productAliases)
      .where(eq(productAliases.productId, c.req.param("productId")))
      .all();
    return c.json(rows);
  },
);

productsRouter.post(
  "/products/:productId/aliases",
  requireAuth,
  async (c) => {
    const body = await c.req.json<{ alias: string; confidence?: number; autoGenerated?: boolean }>();
    const db = createDb(c.env.DB);
    const productId = c.req.param("productId");

    // Reject aliases that are too short or purely numeric — they'd create false matches
    const trimmed = body.alias?.trim() ?? "";
    if (trimmed.length < 3 || /^\d+$/.test(trimmed)) {
      return c.json({ error: "Alias too short or purely numeric" }, 400);
    }

    // Deduplication: check if this alias (case-insensitive) already exists for this product
    const existing = await db
      .select()
      .from(productAliases)
      .where(eq(productAliases.productId, productId))
      .all();
    const normAlias = trimmed.toLowerCase();
    const duplicate = existing.find(
      (a) => a.alias.toLowerCase() === normAlias,
    );
    if (duplicate) {
      // Idempotent — return the existing record rather than erroring
      return c.json(duplicate, 200);
    }

    const id = crypto.randomUUID();
    await db.insert(productAliases).values({
      id,
      productId,
      alias: trimmed,
      confidence: body.confidence ?? null,
      autoGenerated: body.autoGenerated ?? false,
      createdAt: new Date().toISOString(),
    });
    const alias = await db
      .select()
      .from(productAliases)
      .where(eq(productAliases.id, id))
      .get();
    return c.json(alias!, 201);
  },
);

productsRouter.delete("/aliases/:aliasId", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  await db
    .delete(productAliases)
    .where(eq(productAliases.id, c.req.param("aliasId")));
  return c.body(null, 204);
});

export default productsRouter;
