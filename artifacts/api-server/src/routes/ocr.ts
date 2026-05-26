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
} from "@workspace/db/schema";

const ocrRouter = new Hono<AppEnv>();

interface GeminiItem {
  text?: string;
  productName?: string;
  qty?: number;
  totalPrice?: number;
  unitPrice?: number;
}

interface InvoiceMeta {
  supplierName?: string | null;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  grandTotal?: number | null;
}

// ── Image storage helpers ──────────────────────────────────────────────────

// Thumbnail is generated on the frontend (canvas resize → ~8 KB JPEG data URL)
// and stored directly in D1 as the image_url column — zero external storage cost.
// The full-resolution image never touches the server.

// ── Gemini Vision call ─────────────────────────────────────────────────────

async function callGeminiOCR(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  scanType: string,
  tesseractText?: string,
): Promise<{ items: GeminiItem[]; meta: InvoiceMeta | null }> {
  const ocrHint = tesseractText?.trim()
    ? `\n\nA basic OCR engine pre-scanned this image and extracted the following raw text. Use it as an additional hint to improve accuracy — cross-reference it with what you see in the image:\n\n"""\n${tesseractText.slice(0, 3000)}\n"""`
    : "";

  let prompt: string;

  if (scanType === "invoice") {
    prompt = `Analyze this supplier invoice carefully. Extract all information precisely.
Return ONLY a valid JSON object (no markdown, no code blocks, no extra text) with this exact structure:
{
  "meta": {
    "supplierName": "the supplier or company name, or null if not visible",
    "invoiceNumber": "invoice/receipt/delivery note number, or null",
    "invoiceDate": "date formatted as YYYY-MM-DD, or null if not visible",
    "grandTotal": total invoice amount as a plain number (no currency symbols like KES/Ksh), or null
  },
  "items": [
    {
      "text": "exact raw line from invoice",
      "productName": "clean product/item name only",
      "qty": quantity as a plain number or null,
      "unitPrice": unit buying price as a plain number (no currency symbols) or null,
      "totalPrice": line total as a plain number (no currency symbols) or null
    }
  ]
}

Rules:
- Strip all currency symbols (KES, Ksh, Sh, K) from numeric values
- Remove commas from numbers (1,200 → 1200)
- Extract EVERY product line item, including those with missing prices
- If a field is not clearly visible, use null
- Do not include header rows, subtotals, or tax rows in items${ocrHint}`;
  } else {
    prompt = `This is a handwritten inventory notebook. Extract each product entry carefully.
Return ONLY a valid JSON array (no markdown, no code blocks, no extra text):
[
  {
    "text": "raw handwritten line",
    "productName": "clean product name",
    "qty": quantity as a plain number or null,
    "unitPrice": unit price as a plain number (no currency symbols) or null,
    "totalPrice": total price as a plain number (no currency symbols) or null
  }
]
Strip currency symbols (KES, Ksh, Sh) and commas from numbers. Extract all entries.${ocrHint}`;
  }

  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: mimeType, data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${errText.slice(0, 200)}`);
  }

  const data = await resp.json<{
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
    error?: { message: string };
  }>();

  if (data.error) throw new Error(`Gemini: ${data.error.message}`);

  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      return { items: parsed, meta: null };
    } else if (parsed && typeof parsed === "object") {
      return {
        items: Array.isArray(parsed.items) ? parsed.items : [],
        meta: parsed.meta ?? null,
      };
    }
    return { items: [], meta: null };
  } catch {
    return { items: [], meta: null };
  }
}

// ── Product matching ───────────────────────────────────────────────────────

function findProductMatches(
  rawText: string,
  allProducts: Array<{ id: string; canonicalName: string; normalizedName: string }>,
  aliases: Array<{ productId: string; alias: string }>,
) {
  const norm = normalizeProductName(rawText);
  const scored: Array<{ productId: string; productName: string; confidence: number }> = [];

  for (const p of allProducts) {
    let score = 0;
    if (p.normalizedName === norm) score = 1.0;
    else if (p.normalizedName.includes(norm) || norm.includes(p.normalizedName)) score = 0.8;
    else {
      const words = norm.split(" ");
      const pWords = p.normalizedName.split(" ");
      const overlap = words.filter((w) => pWords.includes(w)).length;
      if (overlap > 0) score = overlap / Math.max(words.length, pWords.length);
    }
    if (score > 0.3) scored.push({ productId: p.id, productName: p.canonicalName, confidence: score });
  }

  for (const alias of aliases) {
    const aliasNorm = normalizeProductName(alias.alias);
    if (aliasNorm === norm || norm.includes(aliasNorm)) {
      const product = allProducts.find((p) => p.id === alias.productId);
      if (product) scored.push({ productId: product.id, productName: product.canonicalName, confidence: 0.9 });
    }
  }

  return scored.sort((a, b) => b.confidence - a.confidence).slice(0, 3);
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

  const geminiKey = shopRow?.geminiApiKey || c.env.GEMINI_API_KEY || null;

  let lines: GeminiItem[] = [];
  let invoiceMeta: InvoiceMeta | null = null;
  let geminiError: string | null = null;

  if (geminiKey) {
    try {
      const result = await callGeminiOCR(geminiKey, body.imageBase64, mimeType, body.scanType, body.tesseractText);
      lines = result.items;
      invoiceMeta = result.meta;
    } catch (err: any) {
      geminiError = err?.message ?? "Gemini call failed";
      console.error("[ocr] Gemini error:", geminiError);
      lines = [];
    }
  } else {
    geminiError = "No Gemini API key configured. Add it in Settings → Shop.";
  }

  const results = lines.map((line) => {
    const rawText = line.text ?? line.productName ?? "";
    const suggestions = findProductMatches(rawText, allProducts, allAliases);
    const bestMatch = suggestions[0];
    const confidence = bestMatch?.confidence ?? 0;
    const inferredQty = line.qty ?? null;
    const inferredUnitPrice = line.unitPrice ?? null;
    const inferredTotal = line.totalPrice ?? (line.unitPrice && line.qty ? line.unitPrice * line.qty : null);

    return {
      rawText,
      productId: confidence > 0.7 ? (bestMatch?.productId ?? null) : null,
      productName: confidence > 0.7 ? (bestMatch?.productName ?? null) : null,
      inferredQty,
      inferredUnitPrice,
      inferredTotal,
      confidence,
      status: (confidence > 0.85 ? "confirmed" : confidence > 0.5 ? "review" : "unresolved") as "confirmed" | "review" | "unresolved",
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

  return c.json({
    sessionId,
    imageUrl: thumbnailDataUrl ?? null,
    lines: results,
    invoiceMeta,
    totalDetected: results.length,
    confirmedCount: confirmed,
    reviewCount: review,
    unresolvedCount: unresolved,
    ...(geminiError ? { warning: geminiError } : {}),
  });
});

// Note: invoice thumbnails are stored as data URLs directly in D1 (image_url column).
// No file-serving endpoint needed — the frontend renders them inline.

// ── Session CRUD ───────────────────────────────────────────────────────────

ocrRouter.get("/ocr/sessions", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");

  // Use raw query to include image_url column added via migration
  let rows: any[];
  try {
    const result = await c.env.DB.prepare(
      shopId
        ? "SELECT * FROM scan_sessions WHERE shop_id = ? ORDER BY created_at DESC LIMIT 50"
        : "SELECT * FROM scan_sessions ORDER BY created_at DESC LIMIT 50"
    ).bind(...(shopId ? [shopId] : [])).all();
    rows = result.results as any[];
  } catch {
    rows = await db.select().from(scanSessions).all();
    rows = rows.filter((r: any) => !shopId || r.shopId === shopId)
              .sort((a: any, b: any) => b.createdAt.localeCompare(a.createdAt))
              .slice(0, 50);
  }

  // Normalise snake_case from raw SQL to camelCase expected by frontend
  return c.json(rows.map((r: any) => ({
    id: r.id,
    shopId: r.shop_id ?? r.shopId,
    scanType: r.scan_type ?? r.scanType,
    totalImages: r.total_images ?? r.totalImages ?? 0,
    totalProducts: r.total_products ?? r.totalProducts ?? 0,
    status: r.status,
    resultJson: r.result_json ?? r.resultJson ?? null,
    imageUrl: r.image_url ?? r.imageUrl ?? null,
    createdAt: r.created_at ?? r.createdAt,
  })));
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

      // Update price only if different (handles both up and down)
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
            pctChange: oldPrice
              ? ((newPrice - oldPrice) / oldPrice) * 100
              : null,
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

      // Derive profit margin if both prices known
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
  await db
    .update(scanSessions)
    .set({ status: "applied", totalProducts: totalRecords, resultJson: metaPayload })
    .where(eq(scanSessions.id, sessionId));

  return c.json({ applied, skipped, priceUpdated, newAdded, errors });
});

// ── Delete a scan session ──────────────────────────────────────────────────

ocrRouter.delete("/ocr/sessions/:sessionId", requireAuth, async (c) => {
  const sessionId = c.req.param("sessionId");
  try {
    await c.env.DB.prepare("DELETE FROM scan_sessions WHERE id = ?").bind(sessionId).run();
  } catch {
    const db = createDb(c.env.DB);
    await db.delete(scanSessions).where(eq(scanSessions.id, sessionId));
  }
  return c.json({ deleted: true });
});

// ── Update invoice metadata for a scan session ────────────────────────────

ocrRouter.patch("/ocr/sessions/:sessionId", requireAuth, async (c) => {
  const sessionId = c.req.param("sessionId");
  const body = await c.req.json<{
    supplierName?: string | null;
    invoiceNumber?: string | null;
    invoiceDate?: string | null;
    grandTotal?: number | null;
  }>();

  // Read current resultJson and merge the meta patch in
  const row: any = await c.env.DB.prepare(
    "SELECT result_json FROM scan_sessions WHERE id = ?"
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

  // Preserve existing structure whether it was { items, meta } or { applied, invoiceMeta }
  let updatedJson: any;
  if ("invoiceMeta" in current) {
    updatedJson = { ...current, invoiceMeta: updatedMeta };
  } else {
    updatedJson = { ...current, meta: updatedMeta };
  }

  await c.env.DB.prepare(
    "UPDATE scan_sessions SET result_json = ? WHERE id = ?"
  ).bind(JSON.stringify(updatedJson), sessionId).run();

  return c.json({ updated: true, meta: updatedMeta });
});

export default ocrRouter;
