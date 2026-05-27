import { Hono } from "hono";
import { eq, and, like, or, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb, normalizeProductName } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { kvGet, kvSet, kvDel, CK, CACHE_TTL } from "../lib/cache";
import {
  products,
  productAliases,
  priceHistory,
  inventoryMovements,
  notifications,
  stockTransfers,
} from "@workspace/db/schema";

const productsRouter = new Hono<AppEnv>();

productsRouter.get("/products", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const rawDb = c.env.DB;
  const shopId = c.req.query("shopId");
  const q = c.req.query("q")?.trim();
  const category = c.req.query("category");
  const lowStock = c.req.query("lowStock");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 3000);
  const offset = parseInt(c.req.query("offset") ?? "0");

  // ── FTS5 path: fast full-text search when a query term is present ──────────
  if (q) {
    const norm = normalizeProductName(q);
    // FTS5 MATCH uses prefix tokens — escape special chars, add * for prefix match
    const ftsQuery = norm.replace(/["']/g, "").split(/\s+/).filter(Boolean)
      .map(t => `"${t}"*`).join(" OR ");

    // Extra SQL conditions (category / lowStock / shopId / isActive)
    const extras: string[] = ["p.is_active = 1"];
    const binds: (string | number)[] = [ftsQuery];
    if (shopId) { extras.push(`p.shop_id = ?`); binds.push(shopId); }
    if (category) { extras.push(`p.category = ?`); binds.push(category); }
    if (lowStock === "true") extras.push(`p.stock_qty <= p.alert_qty`);

    const whereClause = extras.length ? `AND ${extras.join(" AND ")}` : "";

    const countSql = `
      SELECT COUNT(*) as n
      FROM products_fts fts
      JOIN products p ON p.rowid = fts.rowid
      WHERE products_fts MATCH ? ${whereClause}`;

    const dataSql = `
      SELECT p.*
      FROM products_fts fts
      JOIN products p ON p.rowid = fts.rowid
      WHERE products_fts MATCH ? ${whereClause}
      ORDER BY rank
      LIMIT ${limit} OFFSET ${offset}`;

    try {
      const [countRes, dataRes] = await Promise.all([
        rawDb.prepare(countSql).bind(...binds).all(),
        rawDb.prepare(dataSql).bind(...binds).all(),
      ]);
      const total = Number((countRes.results[0] as any)?.n ?? 0);
      const rows = dataRes.results as any[];
      return c.json({
        products: rows.map((p) => ({
          id: p.id,
          shopId: p.shop_id,
          canonicalName: p.canonical_name,
          sku: p.sku,
          category: p.category,
          unit: p.unit,
          purchasePrice: p.purchase_price,
          sellingPrice: p.selling_price,
          profitMargin: p.profit_margin,
          stockQty: p.stock_qty,
          alertQty: p.alert_qty,
          size: p.size,
          expiryDate: p.expiry_date,
          isActive: p.is_active !== undefined ? Boolean(p.is_active) : true,
          lastSoldAt: p.last_sold_at,
          createdAt: p.created_at,
          updatedAt: p.updated_at,
        })),
        total,
      });
    } catch {
      // FTS table not yet populated (first boot) — fall through to LIKE path
    }
  }

  // ── KV cache: full product list (no search / no filter) ──────────────────────
  if (!q && !category && !lowStock && shopId) {
    const cached = await kvGet<object>(c.env.SESSIONS, CK.products(shopId));
    if (cached) return c.json(cached);
  }

  // ── Non-search / fallback path: SQL WHERE with LIKE ─────────────────────────
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
  // Cache the full list (no search/filter) so subsequent reads skip D1
  if (!q && !category && !lowStock && shopId) {
    await kvSet(c.env.SESSIONS, CK.products(shopId), payload, CACHE_TTL.products);
  }
  return c.json(payload);
});

productsRouter.post("/products", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    canonicalName: string;
    sku?: string;
    category?: string;
    unit?: string;
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

productsRouter.get("/products/bulk-import", requireAuth, async (c) => {
  return c.json({ error: "Use POST" }, 405);
});

productsRouter.post("/products/bulk-import", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    products: Array<{
      canonicalName: string;
      sku?: string;
      category?: string;
      unit?: string;
      purchasePrice?: number;
      sellingPrice?: number;
      stockQty?: number;
      alertQty?: number;
      size?: string;
    }>;
    deduplicateStrategy?: "skip" | "merge" | "overwrite";
  }>();

  const db = createDb(c.env.DB);
  const strategy = body.deduplicateStrategy ?? "skip";
  let created = 0;
  let skipped = 0;
  let merged = 0;
  const errors: string[] = [];

  const existing = await db
    .select()
    .from(products)
    .where(eq(products.shopId, body.shopId))
    .all();
  const existingByNorm = new Map(existing.map((p) => [p.normalizedName, p]));
  const existingBySku = new Map(
    existing.filter((p) => p.sku).map((p) => [p.sku!, p]),
  );

  for (const item of body.products) {
    try {
      const normName = normalizeProductName(item.canonicalName);
      const existByNorm = existingByNorm.get(normName);
      const existBySku = item.sku ? existingBySku.get(item.sku) : undefined;
      const existingProduct = existBySku ?? existByNorm;

      if (existingProduct) {
        if (strategy === "skip") {
          skipped++;
          continue;
        }
        if (strategy === "merge" || strategy === "overwrite") {
          const now = new Date().toISOString();
          const profitMargin =
            item.purchasePrice && item.sellingPrice
              ? ((item.sellingPrice - item.purchasePrice) / item.sellingPrice) *
                100
              : existingProduct.profitMargin;
          await db
            .update(products)
            .set({
              sellingPrice: item.sellingPrice ?? existingProduct.sellingPrice,
              purchasePrice:
                item.purchasePrice ?? existingProduct.purchasePrice,
              profitMargin,
              stockQty:
                strategy === "overwrite"
                  ? (item.stockQty ?? existingProduct.stockQty)
                  : existingProduct.stockQty,
              alertQty: item.alertQty ?? existingProduct.alertQty,
              category: item.category ?? existingProduct.category,
              unit: item.unit ?? existingProduct.unit,
              updatedAt: now,
            })
            .where(eq(products.id, existingProduct.id));
          merged++;
          continue;
        }
      }

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const profitMargin =
        item.purchasePrice && item.sellingPrice
          ? ((item.sellingPrice - item.purchasePrice) / item.sellingPrice) * 100
          : null;
      await db.insert(products).values({
        id,
        shopId: body.shopId,
        canonicalName: item.canonicalName,
        normalizedName: normName,
        sku: item.sku ?? null,
        category: item.category ?? null,
        unit: item.unit ?? "unit",
        purchasePrice: item.purchasePrice ?? null,
        sellingPrice: item.sellingPrice ?? null,
        profitMargin,
        stockQty: item.stockQty ?? 0,
        alertQty: item.alertQty ?? 5,
        size: item.size ?? null,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      existingByNorm.set(normName, { id, shopId: body.shopId, canonicalName: item.canonicalName, normalizedName: normName, sku: item.sku ?? null, category: item.category ?? null, unit: item.unit ?? "unit", purchasePrice: item.purchasePrice ?? null, sellingPrice: item.sellingPrice ?? null, profitMargin, stockQty: item.stockQty ?? 0, alertQty: item.alertQty ?? 5, expiryDate: null, tokensJson: null, size: item.size ?? null, isActive: true, lastSoldAt: null, createdAt: now, updatedAt: now });
      created++;
    } catch (err) {
      errors.push(`${item.canonicalName}: ${String(err)}`);
    }
  }

  await kvDel(c.env.SESSIONS, CK.products(body.shopId));
  return c.json({ created, skipped, merged, errors });
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

productsRouter.delete("/products/:productId", requireAuth, async (c) => {
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
    const body = await c.req.json<{ alias: string; confidence?: number }>();
    const db = createDb(c.env.DB);
    const id = crypto.randomUUID();
    await db.insert(productAliases).values({
      id,
      productId: c.req.param("productId"),
      alias: body.alias,
      confidence: body.confidence ?? null,
      autoGenerated: false,
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

productsRouter.post("/products/:productId/transfer", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const productId = c.req.param("productId");
  const session = c.get("session");

  let body: { targetShopId: string; qty: number; notes?: string };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON body" }, 400);
  }

  if (!body.targetShopId || !body.qty || body.qty <= 0) {
    return c.json({ error: "targetShopId and qty (>0) are required" }, 400);
  }
  if (body.targetShopId === session.shopId) {
    return c.json({ error: "Cannot transfer to the same shop" }, 400);
  }

  const sourceProduct = await db
    .select()
    .from(products)
    .where(and(eq(products.id, productId), eq(products.shopId, session.shopId)))
    .get();

  if (!sourceProduct) return c.json({ error: "Product not found" }, 404);
  if (sourceProduct.stockQty < body.qty) {
    return c.json({ error: `Insufficient stock (have ${sourceProduct.stockQty})` }, 400);
  }

  const now = new Date().toISOString();

  // Find matching product in target shop by normalized name
  let targetProduct = await db
    .select()
    .from(products)
    .where(
      and(
        eq(products.shopId, body.targetShopId),
        eq(products.normalizedName, sourceProduct.normalizedName),
        eq(products.isActive, true),
      ),
    )
    .get();

  if (!targetProduct) {
    // Create product in target shop with 0 stock — we'll update it below
    const newId = crypto.randomUUID();
    await db.insert(products).values({
      id: newId,
      shopId: body.targetShopId,
      canonicalName: sourceProduct.canonicalName,
      normalizedName: sourceProduct.normalizedName,
      sku: sourceProduct.sku ?? null,
      category: sourceProduct.category ?? null,
      unit: sourceProduct.unit ?? "unit",
      purchasePrice: sourceProduct.purchasePrice ?? null,
      sellingPrice: sourceProduct.sellingPrice ?? null,
      profitMargin: sourceProduct.profitMargin ?? null,
      stockQty: 0,
      alertQty: sourceProduct.alertQty ?? 5,
      size: sourceProduct.size ?? null,
      expiryDate: sourceProduct.expiryDate ?? null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    targetProduct = await db
      .select()
      .from(products)
      .where(eq(products.id, newId))
      .get();
  }

  // Atomic delta operations for both legs of the transfer.
  // Avoids the read-modify-write race: each UPDATE applies its own ±delta
  // to whatever the DB currently holds, rather than overwriting with a
  // pre-read value that may be stale if another request ran concurrently.
  await db
    .update(products)
    .set({ stockQty: sql`${products.stockQty} - ${body.qty}`, updatedAt: now })
    .where(eq(products.id, productId));

  await db
    .update(products)
    .set({ stockQty: sql`${products.stockQty} + ${body.qty}`, updatedAt: now })
    .where(eq(products.id, targetProduct!.id));

  // Re-read committed quantities (used for inventory movement log and API response)
  const [updatedSource, updatedTarget] = await Promise.all([
    db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, productId)).get(),
    db.select({ stockQty: products.stockQty }).from(products).where(eq(products.id, targetProduct!.id)).get(),
  ]);
  const newSourceQty = updatedSource?.stockQty ?? sourceProduct.stockQty - body.qty;
  const newTargetQty = updatedTarget?.stockQty ?? (targetProduct!.stockQty ?? 0) + body.qty;

  // Bust KV product cache for both shops so next fetch reflects updated quantities
  await Promise.all([
    kvDel(c.env.SESSIONS, CK.products(session.shopId)),
    kvDel(c.env.SESSIONS, CK.products(body.targetShopId)),
  ]);

  // Inventory movement logs
  await db.insert(inventoryMovements).values({
    id: crypto.randomUUID(),
    productId,
    productName: sourceProduct.canonicalName,
    movementType: "transfer_out",
    qtyChange: -body.qty,
    beforeQty: sourceProduct.stockQty,
    afterQty: newSourceQty,
    source: "transfer",
    referenceId: targetProduct!.id,
    createdBy: null,
    createdAt: now,
  });

  await db.insert(inventoryMovements).values({
    id: crypto.randomUUID(),
    productId: targetProduct!.id,
    productName: targetProduct!.canonicalName,
    movementType: "transfer_in",
    qtyChange: body.qty,
    beforeQty: targetProduct!.stockQty,
    afterQty: newTargetQty,
    source: "transfer",
    referenceId: productId,
    createdBy: null,
    createdAt: now,
  });

  const transferId = crypto.randomUUID();
  await db.insert(stockTransfers).values({
    id: transferId,
    fromShopId: session.shopId,
    toShopId: body.targetShopId,
    fromProductId: productId,
    toProductId: targetProduct!.id,
    productName: sourceProduct.canonicalName,
    qty: body.qty,
    unit: sourceProduct.unit ?? "unit",
    notes: body.notes ?? null,
    transferredBy: session.role ?? null,
    createdAt: now,
  });

  return c.json({
    ok: true,
    transferId,
    productName: sourceProduct.canonicalName,
    sourceQtyAfter: newSourceQty,
    targetQtyAfter: newTargetQty,
    targetProductId: targetProduct!.id,
  });
});

export default productsRouter;
