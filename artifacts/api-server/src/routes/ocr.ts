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
  subTotal?: number | null;
  vatRate?: number | null;
  vatAmount?: number | null;
  hasVat?: boolean;
}

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

// ── Groq Vision call ───────────────────────────────────────────────────────

async function callGroqOCR(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  scanType: string,
  tesseractText?: string,
): Promise<{ items: GeminiItem[]; meta: InvoiceMeta | null }> {
  const ocrHint = tesseractText?.trim()
    ? `\n\nA basic OCR engine pre-scanned this image and extracted the following raw text. Use it as an additional hint:\n\n"""\n${tesseractText.slice(0, 3000)}\n"""`
    : "";

  let prompt: string;
  if (scanType === "invoice") {
    prompt = `Analyze this Kenyan supplier invoice carefully. Extract ALL information with high precision.
Return ONLY a valid JSON object (no markdown, no code blocks, no extra text) with this exact structure:
{
  "meta": {
    "supplierName": "supplier or company name, or null",
    "invoiceNumber": "invoice/receipt/LPO/DN number, or null",
    "invoiceDate": "YYYY-MM-DD, or null",
    "subTotal": subtotal BEFORE VAT as plain number or null,
    "vatRate": VAT percentage as plain number (e.g. 16 for 16%) or null if no VAT shown,
    "vatAmount": total VAT amount as plain number or null,
    "grandTotal": FINAL total after VAT as plain number or null
  },
  "items": [
    {
      "text": "exact raw line from invoice",
      "productName": "clean chemical/product name — keep active ingredient % if part of name (e.g. Dimethoate 40% EC, Roundup 480SL, Emamectin 1.9% EC). Strip pack size/volume from name.",
      "qty": quantity ordered as plain number or null,
      "unitPrice": unit price per item EXCLUDING VAT as plain number or null,
      "totalPrice": line total EXCLUDING VAT as plain number or null
    }
  ]
}
Rules:
- Strip all currency symbols (KES, Ksh, Sh, K, /=, sh) from all numbers
- Remove commas from numbers: 1,200 → 1200
- Extract EVERY product line, even with partial data
- Product name examples: "DIMETHOATE 40% EC 1L x12" → name:"Dimethoate 40% EC" qty:12 | "ROUNDUP 480SL 5LTR 6PCS" → name:"Roundup 480SL" qty:6 | "NPK 17:17:17 50KG" → name:"NPK 17:17:17" qty:1
- VAT in Kenya is typically 16% — extract if shown as V.A.T, VAT, or Tax line
- If only totalPrice and qty are visible: unitPrice = totalPrice / qty
- DO NOT include header rows, subtotal rows, VAT rows, or delivery charges in items${ocrHint}`;
  } else {
    prompt = `This is a handwritten inventory notebook. Extract each product entry carefully.
Return ONLY a valid JSON array (no markdown, no code blocks, no extra text):
[
  {
    "text": "raw handwritten line",
    "productName": "clean product/chemical name — keep concentration % if present",
    "qty": quantity as a plain number or null,
    "unitPrice": unit price as a plain number (no currency symbols) or null,
    "totalPrice": total price as a plain number (no currency symbols) or null
  }
]
Strip currency symbols (KES, Ksh, Sh) and commas from numbers. Extract all entries.${ocrHint}`;
  }

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
          ],
        },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const json: any = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "[]";

  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return { items: parsed, meta: null };
    if (parsed && typeof parsed === "object") {
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

// ── Gemini Vision call ─────────────────────────────────────────────────────

async function callGeminiOCR(
  apiKey: string,
  imageBase64: string,
  mimeType: string,
  scanType: string,
  tesseractText?: string,
  aiBaseUrl?: string,
): Promise<{ items: GeminiItem[]; meta: InvoiceMeta | null }> {
  const ocrHint = tesseractText?.trim()
    ? `\n\nA basic OCR engine pre-scanned this image and extracted the following raw text. Use it as an additional hint to improve accuracy — cross-reference it with what you see in the image:\n\n"""\n${tesseractText.slice(0, 3000)}\n"""`
    : "";

  let prompt: string;

  if (scanType === "invoice") {
    prompt = `Analyze this Kenyan supplier invoice carefully. Extract ALL information with high precision.
Return ONLY a valid JSON object (no markdown, no code blocks, no extra text) with this exact structure:
{
  "meta": {
    "supplierName": "supplier or company name, or null",
    "invoiceNumber": "invoice/receipt/LPO/DN number, or null",
    "invoiceDate": "YYYY-MM-DD, or null",
    "subTotal": subtotal BEFORE VAT as plain number or null,
    "vatRate": VAT percentage as plain number (e.g. 16 for 16%) or null if no VAT shown,
    "vatAmount": total VAT amount as plain number or null,
    "grandTotal": FINAL total after VAT as plain number or null
  },
  "items": [
    {
      "text": "exact raw line from invoice",
      "productName": "clean chemical/product name — keep active ingredient % if part of name (e.g. Dimethoate 40% EC, Roundup 480SL, Emamectin 1.9% EC). Strip pack volume/weight from name.",
      "qty": quantity ordered as plain number or null,
      "unitPrice": unit price per item EXCLUDING VAT as plain number or null,
      "totalPrice": line total EXCLUDING VAT as plain number or null
    }
  ]
}

Rules:
- Strip all currency symbols (KES, Ksh, Sh, K, /=, sh) from all numbers
- Remove commas from numbers: 1,200 → 1200
- Extract EVERY product line, even with partial data
- Product name examples: "DIMETHOATE 40% EC 1L x12" → name:"Dimethoate 40% EC" qty:12 | "ROUNDUP 480SL 5LTR 6PCS" → name:"Roundup 480SL" qty:6 | "NPK 17:17:17 50KG BAG" → name:"NPK 17:17:17" qty:1
- VAT in Kenya is typically 16% — extract if shown as V.A.T, VAT, or Tax line
- If only totalPrice and qty are visible: unitPrice = totalPrice / qty
- DO NOT include header rows, subtotal rows, VAT rows, or delivery charges in items${ocrHint}`;
  } else {
    prompt = `This is a handwritten inventory notebook. Extract each product entry carefully.
Return ONLY a valid JSON array (no markdown, no code blocks, no extra text):
[
  {
    "text": "raw handwritten line",
    "productName": "clean product/chemical name — keep concentration % if present (e.g. Dimethoate 40% EC)",
    "qty": quantity as a plain number or null,
    "unitPrice": unit price as a plain number (no currency symbols) or null,
    "totalPrice": total price as a plain number (no currency symbols) or null
  }
]
Strip currency symbols (KES, Ksh, Sh) and commas from numbers. Extract all entries.${ocrHint}`;
  }

  const base = aiBaseUrl
    ? aiBaseUrl.replace(/\/$/, "")
    : "https://generativelanguage.googleapis.com";
  const url = `${base}/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: imageBase64 } }] }],
      generationConfig: { responseMimeType: "application/json" },
    }),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini API error ${res.status}: ${err}`);
  }

  const json: any = await res.json();
  const text: string = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";

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

// Bigram/trigram similarity (Dice coefficient)
function ngramSim(a: string, b: string, n = 3): number {
  if (a === b) return 1;
  if (a.length < n - 1 || b.length < n - 1) return 0;
  const getNgrams = (s: string): Map<string, number> => {
    const m = new Map<string, number>();
    const p = " ".repeat(n - 1) + s + " ".repeat(n - 1);
    for (let i = 0; i <= p.length - n; i++) {
      const t = p.slice(i, i + n);
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return m;
  };
  const ag = getNgrams(a);
  const bg = getNgrams(b);
  let inter = 0;
  ag.forEach((cnt, t) => { inter += Math.min(cnt, bg.get(t) ?? 0); });
  const total = [...ag.values()].reduce((s, v) => s + v, 0)
              + [...bg.values()].reduce((s, v) => s + v, 0);
  return total === 0 ? 0 : (2 * inter) / total;
}

// Weighted word overlap — longer words carry more weight (more specific)
function wordOverlapScore(a: string, b: string): number {
  const aW = a.split(" ").filter((w) => w.length > 1);
  const bW = b.split(" ").filter((w) => w.length > 1);
  if (!aW.length || !bW.length) return 0;
  const bSet = new Set(bW);
  let match = 0;
  let total = 0;
  for (const w of aW) {
    const wt = Math.log2(w.length + 2);
    total += wt;
    if (bSet.has(w)) match += wt;
    else {
      // Partial: check if any bWord starts with this word or vice-versa
      for (const bw of bSet) {
        if (w.startsWith(bw) || bw.startsWith(w)) { match += wt * 0.6; break; }
      }
    }
  }
  return total > 0 ? match / total : 0;
}

function findProductMatches(
  rawText: string,
  allProducts: Array<{ id: string; canonicalName: string; normalizedName: string }>,
  aliases: Array<{ productId: string; alias: string }>,
) {
  const norm = normalizeProductName(rawText);
  if (norm.length < 2) return [];

  const scored = new Map<string, { productId: string; productName: string; confidence: number }>();

  for (const p of allProducts) {
    const pn = p.normalizedName;
    let score = 0;

    if (pn === norm) {
      score = 1.0;
    } else if (pn.includes(norm) || norm.includes(pn)) {
      const lenRatio = Math.min(norm.length, pn.length) / Math.max(norm.length, pn.length);
      score = 0.72 + 0.18 * lenRatio;
    } else {
      const wo = wordOverlapScore(norm, pn);
      const tri = ngramSim(norm, pn, 3);
      const bi = ngramSim(norm, pn, 2);
      score = Math.max(wo * 0.88, tri * 0.80, bi * 0.72, (wo + tri) / 2 * 0.92);
    }

    if (score >= 0.27) {
      const prev = scored.get(p.id);
      if (!prev || score > prev.confidence) {
        scored.set(p.id, { productId: p.id, productName: p.canonicalName, confidence: Math.min(score, 0.99) });
      }
    }
  }

  // Alias matching
  for (const alias of aliases) {
    const an = normalizeProductName(alias.alias);
    let aliasScore = 0;
    if (an === norm) aliasScore = 0.95;
    else if (an.includes(norm) || norm.includes(an)) aliasScore = 0.88;
    else {
      const wo = wordOverlapScore(norm, an);
      const tri = ngramSim(norm, an, 3);
      aliasScore = Math.max(wo, tri) * 0.88;
    }
    if (aliasScore >= 0.5) {
      const product = allProducts.find((p) => p.id === alias.productId);
      if (product) {
        const prev = scored.get(product.id);
        if (!prev || aliasScore > prev.confidence) {
          scored.set(product.id, { productId: product.id, productName: product.canonicalName, confidence: aliasScore });
        }
      }
    }
  }

  return [...scored.values()]
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 5);
}

// ── VAT derivation ─────────────────────────────────────────────────────────
// Fills in missing VAT fields when enough data is present.

function deriveVatFields(meta: InvoiceMeta | null): InvoiceMeta | null {
  if (!meta) return null;
  const gt = meta.grandTotal ?? null;
  const st = meta.subTotal ?? null;
  const vr = meta.vatRate ?? null;
  let va = meta.vatAmount ?? null;

  if (gt && st && gt > st && !va) {
    va = Math.round((gt - st) * 100) / 100;
    meta.vatAmount = va;
  }
  if (gt && st && !vr && va) {
    meta.vatRate = Math.round((va / st) * 100 * 10) / 10;
  }
  if (gt && vr && !st) {
    meta.subTotal = Math.round((gt / (1 + vr / 100)) * 100) / 100;
    meta.vatAmount = meta.vatAmount ?? Math.round((gt - meta.subTotal) * 100) / 100;
  }
  if ((va && va > 0) || (vr && vr > 0)) meta.hasVat = true;
  return meta;
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
  await db
    .update(scanSessions)
    .set({ status: "applied", totalProducts: totalRecords, resultJson: metaPayload })
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
