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

async function callGeminiOCR(
  apiKey: string,
  imageBase64: string,
  scanType: string,
): Promise<{ items: GeminiItem[]; meta: InvoiceMeta | null }> {
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
- Do not include header rows, subtotals, or tax rows in items`;
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
Strip currency symbols (KES, Ksh, Sh) and commas from numbers. Extract all entries.`;
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
              { inline_data: { mime_type: "image/jpeg", data: imageBase64 } },
            ],
          },
        ],
        generationConfig: { responseMimeType: "application/json" },
      }),
    },
  );

  const data = await resp.json<{
    candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
  }>();
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

ocrRouter.post("/ocr/scan", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    imageBase64: string;
    scanType: "notebook" | "invoice";
    sessionId?: string;
  }>();

  const db = createDb(c.env.DB);
  const sessionId = body.sessionId ?? crypto.randomUUID();

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
  }

  const [allProducts, allAliases, shopRow] = await Promise.all([
    db.select().from(products).where(eq(products.shopId, body.shopId)).all(),
    db.select().from(productAliases).all(),
    db.select().from(shops).where(eq(shops.id, body.shopId)).get(),
  ]);

  const geminiKey = shopRow?.geminiApiKey || c.env.GEMINI_API_KEY || null;

  let lines: GeminiItem[] = [];
  let invoiceMeta: InvoiceMeta | null = null;

  if (geminiKey) {
    try {
      const result = await callGeminiOCR(geminiKey, body.imageBase64, body.scanType);
      lines = result.items;
      invoiceMeta = result.meta;
    } catch {
      lines = [];
    }
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
    lines: results,
    invoiceMeta,
    totalDetected: results.length,
    confirmedCount: confirmed,
    reviewCount: review,
    unresolvedCount: unresolved,
  });
});

ocrRouter.get("/ocr/sessions", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const rows = await db
    .select()
    .from(scanSessions)
    .where(shopId ? eq(scanSessions.shopId, shopId) : undefined)
    .all();
  return c.json(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
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
    scanType: "notebook" | "invoice";
    lines: Array<{ productId: string; qty: number; unitPrice?: number }>;
    invoiceMeta?: InvoiceMeta;
    performedBy?: string;
  }>();

  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  const sessionId = c.req.param("sessionId");
  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const line of body.lines) {
    try {
      const product = await db.select().from(products).where(eq(products.id, line.productId)).get();
      if (!product) { skipped++; continue; }

      const beforeQty = product.stockQty;
      const afterQty = beforeQty + line.qty;
      const updates: Record<string, unknown> = { stockQty: afterQty, updatedAt: now };

      // Update purchase price if a new unit price is provided and it differs
      const newPrice = line.unitPrice && line.unitPrice > 0 ? line.unitPrice : null;
      if (newPrice && newPrice !== product.purchasePrice) {
        updates.purchasePrice = newPrice;
        // Record the price change in price history
        try {
          await db.insert(priceHistory).values({
            id: crypto.randomUUID(),
            productId: line.productId,
            oldPurchasePrice: product.purchasePrice,
            newPurchasePrice: newPrice,
            oldSellingPrice: product.sellingPrice,
            newSellingPrice: product.sellingPrice,
            pctChange: product.purchasePrice
              ? ((newPrice - (product.purchasePrice ?? 0)) / (product.purchasePrice ?? 1)) * 100
              : null,
            changedBy: body.performedBy ?? "ocr",
            changedAt: now,
          });
        } catch { /* price history write is non-fatal */ }
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

  // Save invoice meta + applied count back to session
  const metaPayload = JSON.stringify({
    applied,
    invoiceMeta: body.invoiceMeta ?? null,
  });
  await db
    .update(scanSessions)
    .set({ status: "applied", totalProducts: applied, resultJson: metaPayload })
    .where(eq(scanSessions.id, sessionId));

  return c.json({ applied, skipped, errors });
});

export default ocrRouter;
