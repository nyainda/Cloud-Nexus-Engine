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
} from "@workspace/db/schema";

const ocrRouter = new Hono<AppEnv>();

async function callGeminiOCR(
  apiKey: string,
  imageBase64: string,
  scanType: string,
): Promise<Array<{ text?: string; productName?: string; qty?: number; totalPrice?: number; unitPrice?: number }>> {
  const prompt =
    scanType === "notebook"
      ? "This is a handwritten inventory notebook. Extract each product entry as a list. For each line, identify: product name, quantity, and price if visible. Return as JSON array of objects with fields: text (raw line), productName, qty (number or null), totalPrice (number or null)."
      : "This is a supplier invoice. Extract all product line items. For each item identify: product name, quantity, unit price, total price. Return as JSON array of objects with fields: text (raw line), productName, qty (number or null), unitPrice (number or null), totalPrice (number or null).";

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
  return JSON.parse(text);
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

  // Shop-specific key takes priority so owners can use their own quota; Worker secret is the fallback
  const geminiKey = shopRow?.geminiApiKey || c.env.GEMINI_API_KEY || null;

  let lines: Array<{ text?: string; productName?: string; qty?: number; totalPrice?: number; unitPrice?: number }> = [];

  if (geminiKey) {
    try {
      lines = await callGeminiOCR(geminiKey, body.imageBase64, body.scanType);
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
    const inferredTotal = line.totalPrice ?? (line.unitPrice && line.qty ? line.unitPrice * line.qty : null);

    return {
      rawText,
      productId: confidence > 0.7 ? bestMatch?.productId ?? null : null,
      productName: confidence > 0.7 ? bestMatch?.productName ?? null : null,
      inferredQty,
      inferredTotal,
      confidence,
      status: confidence > 0.85 ? "confirmed" : confidence > 0.5 ? "review" : "unresolved" as "confirmed" | "review" | "unresolved",
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
      resultJson: JSON.stringify(results),
    })
    .where(eq(scanSessions.id, sessionId));

  return c.json({
    sessionId,
    lines: results,
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
    performedBy?: string;
  }>();
  const db = createDb(c.env.DB);
  const now = new Date().toISOString();
  let applied = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const line of body.lines) {
    try {
      const product = await db.select().from(products).where(eq(products.id, line.productId)).get();
      if (!product) { skipped++; continue; }
      const beforeQty = product.stockQty;
      const afterQty = beforeQty + line.qty;
      await db.update(products).set({ stockQty: afterQty, updatedAt: now }).where(eq(products.id, line.productId));
      await db.insert(inventoryMovements).values({
        id: crypto.randomUUID(),
        productId: line.productId,
        productName: product.canonicalName,
        movementType: body.scanType === "invoice" ? "invoice_restock" : "notebook_restock",
        qtyChange: line.qty,
        beforeQty,
        afterQty,
        source: "ocr",
        referenceId: c.req.param("sessionId"),
        createdBy: body.performedBy ?? null,
        createdAt: now,
      });
      applied++;
    } catch (err) {
      errors.push(`${line.productId}: ${String(err)}`);
    }
  }

  await db.update(scanSessions).set({ status: "applied" }).where(eq(scanSessions.id, c.req.param("sessionId")));

  return c.json({ applied, skipped, errors });
});

export default ocrRouter;
