import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb, normalizeProductName } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { kvDel, CK } from "../lib/cache";
import { products } from "@workspace/db/schema";

const productsImportRouter = new Hono<AppEnv>();

productsImportRouter.get("/products/bulk-import", requireAuth, async (c) => {
  return c.json({ error: "Use POST" }, 405);
});

productsImportRouter.post("/products/bulk-import", requireAuth, async (c) => {
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
              ? ((item.sellingPrice - item.purchasePrice) / item.sellingPrice) * 100
              : existingProduct.profitMargin;
          await db
            .update(products)
            .set({
              sellingPrice: item.sellingPrice ?? existingProduct.sellingPrice,
              purchasePrice: item.purchasePrice ?? existingProduct.purchasePrice,
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
      // Update local dedup map so subsequent items in the same batch don't create duplicates
      existingByNorm.set(normName, {
        id, shopId: body.shopId, canonicalName: item.canonicalName,
        normalizedName: normName, sku: item.sku ?? null, category: item.category ?? null,
        unit: item.unit ?? "unit", purchasePrice: item.purchasePrice ?? null,
        sellingPrice: item.sellingPrice ?? null, profitMargin,
        stockQty: item.stockQty ?? 0, alertQty: item.alertQty ?? 5,
        expiryDate: null, tokensJson: null, size: item.size ?? null,
        isActive: true, lastSoldAt: null, createdAt: now, updatedAt: now,
        productType: "normal", allowDecimals: false,
      });
      created++;
    } catch (err) {
      errors.push(`${item.canonicalName}: ${String(err)}`);
    }
  }

  await kvDel(c.env.SESSIONS, CK.products(body.shopId));
  return c.json({ created, skipped, merged, errors });
});

export default productsImportRouter;
