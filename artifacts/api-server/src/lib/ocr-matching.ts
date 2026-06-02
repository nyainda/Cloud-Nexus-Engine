// ── OCR product matching helpers ───────────────────────────────────────────
// Pure functions — no I/O, no Hono, no DB. Isolated so they can be unit-tested
// and reused from any route that needs fuzzy product matching.

import { normalizeProductName } from "./db";
import type { InvoiceMeta } from "./ocr-ai";

// Bigram/trigram similarity (Dice coefficient)
export function ngramSim(a: string, b: string, n = 3): number {
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
export function wordOverlapScore(a: string, b: string): number {
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
      for (const bw of bSet) {
        if (w.startsWith(bw) || bw.startsWith(w)) { match += wt * 0.6; break; }
      }
    }
  }
  return total > 0 ? match / total : 0;
}

export function findProductMatches(
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

export function deriveVatFields(meta: InvoiceMeta | null): InvoiceMeta | null {
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
