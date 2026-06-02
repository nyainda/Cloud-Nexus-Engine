import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb, normalizeProductName } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import {
  scanSessions,
  products,
  productAliases,
  inventoryMovements,
  shops,
  priceHistory,
  suppliers,
} from "@workspace/db/schema";
import type { GeminiItem, InvoiceMeta } from "../lib/ocr-ai";
import { callGroqOCR, callGeminiOCR } from "../lib/ocr-ai";
import { findProductMatches, deriveVatFields } from "../lib/ocr-matching";

const ocrRouter = new Hono<AppEnv>();

// ── KV cache helpers ───────────────────────────────────────────────────────
// Sessions list is cached in KV (shared with auth sessions namespace) for 90s.
// Cache key is prefixed to avoid collisions with UUID-based session tokens.

const KV_TTL = 90;
function ocrCacheKey(shopId: string) { return `ocr_sess_v1:${shopId}`; }

async function invalidateOcrCache(kv: KVNamespace, shopId: string) {
  try { await kv.delete(ocrCacheKey(shopId)); } catch { /* non-fatal */ }
}

// ── Auto-supplier detection ────────────────────────────────────────────────
// Fuzzy-matches supplierName from OCR against existing suppliers.
// Auto-creates a new supplier record if no match found.

async function findOrCreateSupplier(
  db: ReturnType<typeof createDb>,
  shopId: string,
  supplierName: string | null | undefined,
): Promise<string | null> {
  if (!supplierName?.trim()) return null;
  const name = supplierName.trim();
  const norm = name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

  const existing = await db.select().from(suppliers).where(eq(suppliers.shopId, shopId)).all();

  for (const s of existing) {
    const sNorm = s.name.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
    if (sNorm === norm) return s.id;
    if (sNorm.includes(norm) || norm.includes(sNorm)) return s.id;
    const words = norm.split(" ").filter(Boolean);
    const sWords = sNorm.split(" ").filter(Boolean);
    const overlap = words.filter((w) => sWords.includes(w)).length;
    if (words.length > 1 && overlap / Math.max(words.length, sWords.length) >= 0.6) return s.id;
  }

  // Auto-create — name is new
  const id = crypto.randomUUID();
  await db.insert(suppliers).values({ id, shopId, name, createdAt: new Date().toISOString() });
  return id;
}

// ── Normalise raw DB row to camelCase session object ───────────────────────

function normalizeSessionRow(r: any) {
  return {
    id: r.id,
    shopId: r.shop_id ?? r.shopId,
    scanType: r.scan_type ?? r.scanType,
    totalImages: r.total_images ?? r.totalImages ?? 0,
    totalProducts: r.total_products ?? r.totalProducts ?? 0,
    status: r.status,
    resultJson: r.result_json ?? r.resultJson ?? null,
    imageUrl: r.image_url ?? r.imageUrl ?? null,
    supplierId: r.supplier_id ?? r.supplierId ?? null,
    createdAt: r.created_at ?? r.createdAt,
  };
}

// ── Routes ─────────────────────────────────────────────────────────────────

ocrRouter.post("/ocr/scan", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    imageBase64: string;
    mimeType?: string;
    scanType: "notebook" | "invoice";
    sessionId?: string;
    tesseractText?: string;
  }>();

  const db = createDb(c.env.DB);
  const sessionId = body.sessionId ?? crypto.randomUUID();
  const mimeType = body.mimeType ?? "image/jpeg";

  // thumbnailDataUrl is a ~8 KB data URL generated on the frontend (200px canvas resize).
  // Stored directly in D1 image_url column — no external storage needed.
  const thumbnailDataUrl = (body as any).thumbnailDataUrl ?? null;

  if (!body.sessionId) {
    await db.insert(scanSessions).values({
      id: sessionId,
      shopId: body.shopId,
      scanType: body.scanType,
      totalImages: 1,
      totalProducts: 0,
      status: "processing",
      resultJson: null,
      createdAt: new Date().toISOString(),
    });
    if (thumbnailDataUrl) {
      try {
        await c.env.DB.prepare("UPDATE scan_sessions SET image_url = ? WHERE id = ?")
          .bind(thumbnailDataUrl, sessionId).run();
      } catch { /* column might not exist yet — non-fatal */ }
    }
  }

  const [allProducts, allAliases, shopRow] = await Promise.all([
    db.select().from(products).where(eq(products.shopId, body.shopId)).all(),
    db.select().from(productAliases).all(),
    db.select().from(shops).where(eq(shops.id, body.shopId)).get(),
  ]);

  const groqKey = shopRow?.groqApiKey || (c.env as any).GROQ_API_KEY || null;
  const geminiKey = shopRow?.geminiApiKey || c.env.AI_INTEGRATIONS_GEMINI_API_KEY || c.env.GEMINI_API_KEY || null;
  const aiBaseUrl = c.env.AI_INTEGRATIONS_GEMINI_BASE_URL || undefined;

  let lines: GeminiItem[] = [];
  let invoiceMeta: InvoiceMeta | null = null;
  let geminiError: string | null = null;
  let aiProvider = "none";

  if (groqKey) {
    try {
      const result = await callGroqOCR(groqKey, body.imageBase64, mimeType, body.scanType, body.tesseractText);
      lines = result.items;
      invoiceMeta = result.meta;
      aiProvider = "groq";
    } catch (err: any) {
      const groqError = err?.message ?? "Groq call failed";
      console.error("[ocr] Groq error:", groqError);
      if (geminiKey) {
        try {
          const result = await callGeminiOCR(geminiKey, body.imageBase64, mimeType, body.scanType, body.tesseractText, aiBaseUrl);
          lines = result.items;
          invoiceMeta = result.meta;
          aiProvider = "gemini";
        } catch (err2: any) {
          geminiError = err2?.message ?? "Gemini call failed";
          console.error("[ocr] Gemini fallback error:", geminiError);
        }
      } else {
        geminiError = groqError;
      }
    }
  } else if (geminiKey) {
    try {
      const result = await callGeminiOCR(geminiKey, body.imageBase64, mimeType, body.scanType, body.tesseractText, aiBaseUrl);
      lines = result.items;
      invoiceMeta = result.meta;
      aiProvider = "gemini";
    } catch (err: any) {
      geminiError = err?.message ?? "Gemini call failed";
      console.error("[ocr] Gemini error:", geminiError);
      lines = [];
    }
  } else {
    geminiError = "No AI key configured. Add a Groq or Gemini key in Settings → AI Integration.";
  }
  console.log(`[ocr] provider=${aiProvider} lines=${lines.length}`);

  // Derive missing VAT fields from what the AI returned
  invoiceMeta = deriveVatFields(invoiceMeta);

  const results = lines.map((line) => {
    const rawText = line.text ?? line.productName ?? "";
    // Use the AI-cleaned productName for matching — it's much more accurate than raw text
    const matchText = (line.productName?.trim() || rawText).trim();
    const suggestions = findProductMatches(matchText, allProducts, allAliases);
    const bestMatch = suggestions[0];
    const confidence = bestMatch?.confidence ?? 0;
    const inferredQty = line.qty ?? null;
    const inferredUnitPrice = line.unitPrice ?? null;
    const inferredTotal = line.totalPrice ?? (line.unitPrice && line.qty ? Math.round(line.unitPrice * line.qty * 100) / 100 : null);

    return {
      rawText,
      productId: confidence >= 0.62 ? (bestMatch?.productId ?? null) : null,
      productName: confidence >= 0.62 ? (bestMatch?.productName ?? null) : null,
      inferredQty,
      inferredUnitPrice,
      inferredTotal,
      confidence,
      status: (confidence >= 0.80 ? "confirmed" : confidence >= 0.42 ? "review" : "unresolved") as "confirmed" | "review" | "unresolved",
      suggestions,
    };
  });

  const confirmed = results.filter((r) => r.status === "confirmed").length;
  const review = results.filter((r) => r.status === "review").length;
  const unresolved = results.filter((r) => r.status === "unresolved").length;

  await db
    .update(scanSessions)
    .set({
      totalProducts: results.length,
      status: "complete",
      resultJson: JSON.stringify({ items: results, meta: invoiceMeta }),
    })
    .where(eq(scanSessions.id, sessionId));

  // Auto-link supplier from OCR invoice metadata
  let linkedSupplierId: string | null = null;
  if (body.scanType === "invoice" && invoiceMeta?.supplierName) {
    try {
      linkedSupplierId = await findOrCreateSupplier(db, body.shopId, invoiceMeta.supplierName);
      if (linkedSupplierId) {
        await c.env.DB.prepare("UPDATE scan_sessions SET supplier_id = ? WHERE id = ?")
          .bind(linkedSupplierId, sessionId).run();
      }
    } catch (err) {
      console.error("[ocr] supplier link error:", err);
    }
  }

  // Invalidate sessions cache for this shop
  await invalidateOcrCache(c.env.SESSIONS, body.shopId);

  return c.json({
    sessionId,
    imageUrl: thumbnailDataUrl ?? null,
    supplierId: linkedSupplierId,
    lines: results,
    invoiceMeta,
    totalDetected: results.length,
    confirmedCount: confirmed,
    reviewCount: review,
    unresolvedCount: unresolved,
    ...(geminiError ? { warning: geminiError } : {}),
  });
});

// ── Session list — KV-cached ───────────────────────────────────────────────

ocrRouter.get("/ocr/sessions", requireAuth, async (c) => {
  const shopId = c.req.query("shopId");

  // Try KV cache first — avoids DB round-trip for repeated loads
  if (shopId) {
    try {
      const cached = await c.env.SESSIONS.get(ocrCacheKey(shopId));
      if (cached) return c.json(JSON.parse(cached));
    } catch { /* cache miss — fall through to DB */ }
  }

  let rows: any[];
  try {
    const result = await c.env.DB.prepare(
      shopId
        ? "SELECT * FROM scan_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 200"
        : "SELECT * FROM scan_sessions ORDER BY created_at DESC LIMIT 200"
    ).bind(...(shopId ? [shopId] : [])).all();
    rows = result.results as any[];
  } catch {
    const db = createDb(c.env.DB);
    rows = await db.select().from(scanSessions).all();
    rows = rows
      .filter((r: any) => !shopId || r.shopId === shopId)
      .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 200);
  }

  const normalized = rows.map(normalizeSessionRow);

  // Store in KV — subsequent reads within TTL skip the DB entirely
  if (shopId) {
    try {
      await c.env.SESSIONS.put(ocrCacheKey(shopId), JSON.stringify(normalized), { expirationTtl: KV_TTL });
    } catch { /* non-fatal */ }
  }

  return c.json(normalized);
});

ocrRouter.post("/ocr/sessions", requireAuth, async (c) => {
  const body = await c.req.json<{ shopId: string; scanType: "notebook" | "invoice" }>();
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(scanSessions).values({
    id,
    shopId: body.shopId,
    scanType: body.scanType,
    totalImages: 0,
    totalProducts: 0,
    status: "pending",
    resultJson: null,
    createdAt: new Date().toISOString(),
  });
  const session = await db.select().from(scanSessions).where(eq(scanSessions.id, id)).get();
  return c.json(session!, 201);
});

ocrRouter.post("/ocr/sessions/:sessionId/apply", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    scanType: "notebook" | "invoice";
    lines: Array<{ productId: string; qty: number; unitPrice?: number }>;
    newProducts?: Array<{
      name: string;
      category?: string;
      unit?: string;
      buyingPrice: number;
      sellingPrice?: number;
      qty: number;
    }>;
    invoiceMeta?: InvoiceMeta;
    supplierId?: string;
    performedBy?: string;
  }>();

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const sessionId = c.req.param("sessionId");
  let applied = 0;
  let skipped = 0;
  let priceUpdated = 0;
  let newAdded = 0;
  const errors: string[] = [];

  // ── 1. Apply existing product restocks ───────────────────────────────────
  for (const line of body.lines) {
    try {
      const product = await db.select().from(products).where(eq(products.id, line.productId)).get();
      if (!product) { skipped++; continue; }

      const beforeQty = product.stockQty;
      const afterQty = beforeQty + line.qty;
      const updates: Record<string, unknown> = { stockQty: afterQty, updatedAt: now };

      const newPrice = line.unitPrice && line.unitPrice > 0 ? line.unitPrice : null;
      const oldPrice = product.purchasePrice ?? null;

      if (newPrice !== null && newPrice !== oldPrice) {
        updates.purchasePrice = newPrice;
        priceUpdated++;
        try {
          await db.insert(priceHistory).values({
            id: crypto.randomUUID(),
            productId: line.productId,
            oldPurchasePrice: oldPrice,
            newPurchasePrice: newPrice,
            oldSellingPrice: product.sellingPrice,
            newSellingPrice: product.sellingPrice,
            pctChange: oldPrice ? ((newPrice - oldPrice) / oldPrice) * 100 : null,
            changedBy: body.performedBy ?? "ocr",
            changedAt: now,
          });
        } catch { /* price history is non-fatal */ }
      }

      await db.update(products).set(updates).where(eq(products.id, line.productId));

      await db.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        productId: line.productId,
        productName: product.canonicalName,
        movementType: body.scanType === "invoice" ? "invoice_restock" : "notebook_restock",
        qtyChange: line.qty,
        beforeQty,
        afterQty,
        source: "ocr",
        referenceId: sessionId,
        createdBy: body.performedBy ?? null,
        createdAt: now,
      });

      applied++;
    } catch (err) {
      errors.push(`${line.productId}: ${String(err)}`);
    }
  }

  // ── 2. Create new products ────────────────────────────────────────────────
  for (const np of body.newProducts ?? []) {
    try {
      if (!np.name?.trim() || !body.shopId) continue;
      const newId = crypto.randomUUID();
      const normalized = normalizeProductName(np.name);

      const profitMargin = np.sellingPrice && np.buyingPrice
        ? ((np.sellingPrice - np.buyingPrice) / np.buyingPrice) * 100
        : null;

      await db.insert(products).values({
        id: newId,
        shopId: body.shopId,
        canonicalName: np.name.trim(),
        normalizedName: normalized,
        category: np.category ?? "Agrochemicals",
        unit: np.unit ?? "unit",
        purchasePrice: np.buyingPrice,
        sellingPrice: np.sellingPrice ?? null,
        profitMargin,
        stockQty: np.qty,
        alertQty: 5,
        isActive: true,
        updatedAt: now,
      });

      await db.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        productId: newId,
        productName: np.name.trim(),
        movementType: body.scanType === "invoice" ? "invoice_restock" : "notebook_restock",
        qtyChange: np.qty,
        beforeQty: 0,
        afterQty: np.qty,
        source: "ocr_new",
        referenceId: sessionId,
        createdBy: body.performedBy ?? null,
        createdAt: now,
      });

      newAdded++;
    } catch (err) {
      errors.push(`new:${np.name}: ${String(err)}`);
    }
  }

  const totalRecords = applied + newAdded;
  const metaPayload = JSON.stringify({
    applied: totalRecords,
    priceUpdated,
    newAdded,
    invoiceMeta: body.invoiceMeta ?? null,
  });
  const sessionUpdate: Record<string, unknown> = {
    status: "applied",
    totalProducts: totalRecords,
    resultJson: metaPayload,
  };
  if (body.supplierId) sessionUpdate.supplierId = body.supplierId;

  await db
    .update(scanSessions)
    .set(sessionUpdate as any)
    .where(eq(scanSessions.id, sessionId));

  // Invalidate cache
  await invalidateOcrCache(c.env.SESSIONS, body.shopId);

  return c.json({ applied, skipped, priceUpdated, newAdded, errors });
});

// ── Delete a scan session ──────────────────────────────────────────────────

ocrRouter.delete("/ocr/sessions/:sessionId", requireAuth, async (c) => {
  const sessionId = c.req.param("sessionId");

  // Get shopId before deleting (for cache invalidation)
  let shopId: string | null = null;
  try {
    const row: any = await c.env.DB.prepare("SELECT shop_id FROM scan_sessions WHERE id = ?")
      .bind(sessionId).first();
    shopId = row?.shop_id ?? null;
  } catch {}

  try {
    await c.env.DB.prepare("DELETE FROM scan_sessions WHERE id = ?").bind(sessionId).run();
  } catch {
    const db = createDb(c.env.DB);
    await db.delete(scanSessions).where(eq(scanSessions.id, sessionId));
  }

  if (shopId) await invalidateOcrCache(c.env.SESSIONS, shopId);

  return c.json({ deleted: true });
});

// ── Update invoice metadata / supplier link ────────────────────────────────

ocrRouter.patch("/ocr/sessions/:sessionId", requireAuth, async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json<{
    supplierName?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    grandTotal?: number | null;
    supplierId?: string | null;
  }>();

  const row: any = await c.env.DB.prepare(
    "SELECT result_json, shop_id FROM scan_sessions WHERE id = ?"
  ).bind(sessionId).first();

  if (!row) return c.json({ error: "Session not found" }, 404);

  let current: any = {};
  try { current = JSON.parse(row.result_json ?? "{}"); } catch {}

  const updatedMeta = {
    ...(current.meta ?? current.invoiceMeta ?? {}),
    ...(body.supplierName !== undefined ? { supplierName: body.supplierName } : {}),
    ...(body.invoiceNumber !== undefined ? { invoiceNumber: body.invoiceNumber } : {}),
    ...(body.invoiceDate !== undefined ? { invoiceDate: body.invoiceDate } : {}),
    ...(body.grandTotal !== undefined ? { grandTotal: body.grandTotal } : {}),
  };

  const updatedJson = "invoiceMeta" in current
    ? { ...current, invoiceMeta: updatedMeta }
    : { ...current, meta: updatedMeta };

  // Batch: update resultJson + optionally supplier_id
  if ("supplierId" in body) {
    await c.env.DB.prepare(
      "UPDATE scan_sessions SET result_json = ?, supplier_id = ? WHERE id = ?"
    ).bind(JSON.stringify(updatedJson), body.supplierId ?? null, sessionId).run();
  } else {
    await c.env.DB.prepare(
      "UPDATE scan_sessions SET result_json = ? WHERE id = ?"
    ).bind(JSON.stringify(updatedJson), sessionId).run();
  }

  // Invalidate cache
  const shopId: string | null = row.shop_id ?? null;
  if (shopId) await invalidateOcrCache(c.env.SESSIONS, shopId);

  return c.json({ updated: true, meta: updatedMeta });
});

export default ocrRouter;
