import { useState, useMemo, useEffect, useCallback } from "react";
import {
  useOcrScan, useListScanSessions, useListProducts,
  customFetch, getListProductsQueryKey, getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Camera, Upload, ScanLine, FileText, CheckCircle2, Image,
  Zap, Cpu, AlertCircle, ChevronDown, ChevronUp,
  Package, Minus, Plus, Check, ClipboardList,
  Building2, Hash, Calendar, Banknote, ArrowRight, ImageIcon,
  TrendingUp, TrendingDown, Equal, ShieldCheck, ArrowLeft, PlusCircle, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { ImageLightbox } from "@/components/image-lightbox";

type Engine = "ai" | "free";

// ─── client-side image compression ───────────────────────────────────────────
// Reduces a typical 3 MB phone photo to ~150-300 KB before upload/storage.
// Always outputs JPEG regardless of input format.

async function compressImage(dataUrl: string, maxPx = 2048, quality = 0.88): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const ratio = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Generates a scanner-quality image stored in D1.
// Scales to max 1200px, applies auto-levels (2% clipping) and an S-curve
// contrast boost so text is crisp and backgrounds are clean white.
async function makeThumbnail(dataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const MAX = 1600;
      const ratio = Math.min(1, MAX / Math.max(img.width, img.height));
      const W = Math.round(img.width * ratio);
      const H = Math.round(img.height * ratio);

      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, W, H);

      const imageData = ctx.getImageData(0, 0, W, H);
      const d = imageData.data;
      const n = d.length;

      // Build luminance histogram for auto-levels
      const hist = new Uint32Array(256);
      for (let i = 0; i < n; i += 4) {
        hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
      }

      // Find 2nd / 98th percentile (clip extremes so lighting outliers don't skew)
      const clip = W * H * 0.02;
      let lo = 0, hi = 255, acc = 0;
      for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= clip) { lo = v; break; } }
      acc = 0;
      for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= clip) { hi = v; break; } }
      if (hi <= lo) { lo = 0; hi = 255; }
      const range = hi - lo || 1;

      // Build LUT: linear stretch → S-curve contrast boost
      const lut = new Uint8Array(256);
      for (let v = 0; v < 256; v++) {
        let t = Math.max(0, Math.min(1, (v - lo) / range));
        // ease-in-out S-curve
        t = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        lut[v] = Math.round(t * 255);
      }

      // Apply LUT to RGB channels
      for (let i = 0; i < n; i += 4) {
        d[i] = lut[d[i]];
        d[i + 1] = lut[d[i + 1]];
        d[i + 2] = lut[d[i + 2]];
      }

      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// ─── types ────────────────────────────────────────────────────────────────────

interface EditedItem {
  checked: boolean;
  qty: number;
  unitPrice: string;
  productId: string | null;
  productName: string | null;
  rawText: string;
  status: string;
  currentBuyingPrice: number | null;
  currentStock: number | null;
  // For unresolved → new product
  addAsNew: boolean;
  newName: string;
  newCategory: string;
  newUnit: string;
  newSellingPrice: string;
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function getMimeTypeFromDataUrl(dataUrl: string): string {
  const match = dataUrl.match(/^data:([^;]+);base64,/);
  return match?.[1] ?? "image/jpeg";
}

function normalizeText(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function extractQtyFromLine(line: string): number {
  const match = line.match(
    /(\d+)\s*[xX×]|[xX×]\s*(\d+)|\bqty[\s:]+(\d+)|\b(\d+)\s+(?:units?|pcs?|bags?|kgs?|litres?|pieces?)\b/i,
  );
  if (match) return parseInt(match[1] || match[2] || match[3] || match[4]);
  const nums = line.match(/\b(\d{1,3})\b/g);
  if (nums) return Math.min(parseInt(nums[nums.length - 1] || "1"), 999);
  return 1;
}

function extractPricesFromLine(line: string): { unitPrice: number | null } {
  const numbers = [...line.matchAll(/\b(\d{1,3}(?:,\d{3})*(?:\.\d{0,2})?|\d{4,}(?:\.\d{0,2})?)\b/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, "")))
    .filter((n) => n >= 5 && n <= 999999);
  if (numbers.length === 0) return { unitPrice: null };
  return { unitPrice: numbers[numbers.length - 1] ?? null };
}

function matchLine(line: string, products: any[]): { product: any; score: number } | null {
  const norm = normalizeText(line);
  if (norm.length < 3) return null;
  let best: any = null;
  let bestScore = 0;
  for (const p of products) {
    const name = normalizeText(p.canonicalName ?? "");
    const words = name.split(" ").filter((w: string) => w.length > 2);
    if (!words.length) continue;
    const matched = words.filter((w: string) => norm.includes(w));
    const score = matched.length / words.length;
    if (score > bestScore && score >= 0.4) { bestScore = score; best = { product: p, score }; }
  }
  return best;
}

function buildFreeResult(rawText: string, products: any[]) {
  const lines = rawText
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 3 && !/^\d+$/.test(l))
    .slice(0, 50);

  const seen = new Set<string>();
  const result: any[] = [];

  for (const line of lines) {
    const prices = extractPricesFromLine(line);
    const hit = matchLine(line, products);
    if (!hit) {
      result.push({
        rawText: line, productName: null, productId: null,
        qty: extractQtyFromLine(line),
        inferredUnitPrice: prices.unitPrice,
        confidence: 0, status: "unresolved",
      });
      continue;
    }
    const pid = hit.product.id;
    if (seen.has(pid)) continue;
    seen.add(pid);
    result.push({
      rawText: line,
      productName: hit.product.canonicalName,
      productId: pid,
      qty: extractQtyFromLine(line),
      inferredUnitPrice: prices.unitPrice,
      confidence: hit.score,
      status: hit.score >= 0.7 ? "confirmed" : "review",
    });
  }

  const confirmed = result.filter((r) => r.status === "confirmed").length;
  const review = result.filter((r) => r.status === "review").length;
  const unresolved = result.filter((r) => r.status === "unresolved").length;

  return {
    sessionId: null, imageUrl: null, engine: "free", invoiceMeta: null,
    totalDetected: result.length, confirmedCount: confirmed,
    reviewCount: review, unresolvedCount: unresolved, lines: result,
  };
}

function fmtKes(n: number | null | undefined): string {
  if (n == null) return "—";
  return "KES " + n.toLocaleString("en-KE", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function priceDiff(oldP: number | null, newP: number | null): "up" | "down" | "same" | null {
  if (oldP == null || newP == null || newP <= 0) return null;
  if (newP > oldP) return "up";
  if (newP < oldP) return "down";
  return "same";
}

function pctChange(oldP: number, newP: number): string {
  if (!oldP) return "";
  const pct = ((newP - oldP) / oldP) * 100;
  return (pct > 0 ? "+" : "") + pct.toFixed(1) + "%";
}

const CATEGORIES = [
  "Herbicides", "Fungicides", "Insecticides", "Fertilizers", "Seeds",
  "Equipment", "Acaricides", "Animal Health", "Agrochemicals",
];
const UNITS = ["unit", "kg", "g", "litre", "ml", "bag", "box", "piece", "pack"];

// ─── init state ───────────────────────────────────────────────────────────────

function initEditedItems(lines: any[], productsMap: Map<string, any>): EditedItem[] {
  return lines.map((line: any) => {
    const dbProduct = line.productId ? productsMap.get(line.productId) : null;
    return {
      checked: line.status === "confirmed" || line.status === "review",
      qty: Math.max(1, line.qty ?? line.inferredQty ?? 1),
      unitPrice: line.inferredUnitPrice ? String(line.inferredUnitPrice) : "",
      productId: line.productId ?? null,
      productName: line.productName ?? null,
      rawText: line.rawText ?? "",
      status: line.status ?? "unresolved",
      currentBuyingPrice: dbProduct?.purchasePrice ?? null,
      currentStock: dbProduct?.stockQty ?? null,
      addAsNew: false,
      newName: line.rawText ?? "",
      newCategory: "Agrochemicals",
      newUnit: "unit",
      newSellingPrice: "",
    };
  });
}

// ─── OCR Page ─────────────────────────────────────────────────────────────────

export default function OCR() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "owner";

  const [engine, setEngine] = useState<Engine>("free");
  const [image, setImage] = useState<string | null>(null);
  const [scanType, setScanType] = useState<"notebook" | "invoice">("invoice");
  const [scanResult, setScanResult] = useState<any>(null);
  const [freeLoading, setFreeLoading] = useState(false);
  const [showAllLines, setShowAllLines] = useState(false);
  const [approving, setApproving] = useState(false);
  const [applied, setApplied] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const openLightbox = useCallback((url: string) => setLightboxUrl(url), []);

  const [editedItems, setEditedItems] = useState<EditedItem[]>([]);
  const [invoiceMeta, setInvoiceMeta] = useState({ supplierName: "", invoiceNumber: "", invoiceDate: "", grandTotal: "" });

  const qc = useQueryClient();
  const ocrScan = useOcrScan();

  const { data: sessions, refetch: refetchSessions } = useListScanSessions(
    { shopId },
    { query: { enabled: !!shopId } },
  );

  const { data: productsData } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId } },
  );
  const products = useMemo(() => productsData?.products ?? [], [productsData]);
  const productsMap = useMemo(() => {
    const m = new Map<string, any>();
    products.forEach((p: any) => m.set(p.id, p));
    return m;
  }, [products]);

  useEffect(() => {
    if (!scanResult?.lines) return;
    setEditedItems(initEditedItems(scanResult.lines, productsMap));
    setApplied(false);
    setApproving(false);
    if (scanResult.invoiceMeta) {
      setInvoiceMeta({
        supplierName: scanResult.invoiceMeta.supplierName ?? "",
        invoiceNumber: scanResult.invoiceMeta.invoiceNumber ?? "",
        invoiceDate: scanResult.invoiceMeta.invoiceDate ?? "",
        grandTotal: scanResult.invoiceMeta.grandTotal ? String(scanResult.invoiceMeta.grandTotal) : "",
      });
    } else {
      setInvoiceMeta({ supplierName: "", invoiceNumber: "", invoiceDate: "", grandTotal: "" });
    }
  }, [scanResult, productsMap]);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const raw = ev.target?.result as string;
      // Compress to JPEG ≤1200px, ~82% quality — reduces 3 MB → ~200 KB
      const compressed = await compressImage(raw);
      setImage(compressed);
      setScanResult(null);
      setShowAllLines(false);
      setApplied(false);
      setApproving(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  // ── Hybrid AI scan ────────────────────────────────────────────────────────
  const processAI = async () => {
    if (!image) return;
    const mimeType = getMimeTypeFromDataUrl(image);
    const imageBase64 = image.split(",")[1];

    // Generate thumbnail in parallel with Tesseract pre-scan
    const [thumbnailDataUrl, tesseractText] = await Promise.all([
      makeThumbnail(image),
      (async () => {
        try {
          toast.info("Pre-scanning on device…", { duration: 3000 });
          const { default: Tesseract } = await import("tesseract.js");
          const { data: { text } } = await (Tesseract as any).recognize(image, "eng", { logger: () => {} });
          return text ?? "";
        } catch { return ""; }
      })(),
    ]);

    ocrScan.mutate(
      {
        data: {
          shopId, imageBase64, mimeType, scanType,
          tesseractText: tesseractText || undefined,
          thumbnailDataUrl: thumbnailDataUrl || undefined,
        } as any,
      },
      {
        onSuccess: (data: any) => {
          setScanResult({ ...data, engine: "ai" });
          if (data.warning) toast.warning(data.warning);
          else toast.success(`AI detected ${data.totalDetected} items`);
          refetchSessions();
        },
        onError: (err: any) => {
          const msg = err?.data?.warning ?? err?.message ?? "";
          if (msg.includes("API key") || msg.includes("Gemini")) {
            toast.error("Add your Gemini API key in Settings → Shop to use AI scanning.");
          } else {
            toast.error("AI scan failed — " + (msg || "check your Gemini API key in Settings"));
          }
        },
      },
    );
  };

  // ── Free OCR (Tesseract only) ─────────────────────────────────────────────
  const processFree = async () => {
    if (!image) return;
    setFreeLoading(true);
    try {
      toast.info("Loading OCR engine… (~4 MB cached after first use)", { duration: 5000 });
      const { default: Tesseract } = await import("tesseract.js");
      const { data: { text } } = await (Tesseract as any).recognize(image, "eng", { logger: () => {} });
      const thumbnail = await makeThumbnail(image);
      const result = buildFreeResult(text, products);
      // For free scans, store thumbnail locally in result (no server session)
      setScanResult({ ...result, localThumbnail: thumbnail });
      toast.success(`Free OCR found ${result.totalDetected} items`);
    } catch (err: any) {
      toast.error("Free OCR failed — " + (err?.message ?? "unknown error"));
    } finally {
      setFreeLoading(false);
    }
  };

  // ── Apply mutation ────────────────────────────────────────────────────────
  const applyMutation = useMutation({
    mutationFn: async () => {
      const linesToApply = editedItems
        .filter((item) => item.checked && item.productId && item.qty > 0)
        .map((item) => ({
          productId: item.productId!,
          qty: item.qty,
          unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
        }));

      const newProductsToAdd = editedItems
        .filter((item) => !item.productId && item.addAsNew && item.newName.trim() && parseFloat(item.unitPrice) > 0)
        .map((item) => ({
          name: item.newName.trim(),
          category: item.newCategory,
          unit: item.newUnit,
          buyingPrice: parseFloat(item.unitPrice),
          sellingPrice: item.newSellingPrice ? parseFloat(item.newSellingPrice) : undefined,
          qty: item.qty,
        }));

      if (linesToApply.length === 0 && newProductsToAdd.length === 0) throw new Error("No items selected");

      let sessionId = scanResult?.sessionId as string | null;
      if (!sessionId) {
        const session = await customFetch<{ id: string }>("/api/ocr/sessions", {
          method: "POST",
          body: JSON.stringify({ shopId, scanType }),
        });
        sessionId = session.id;
      }

      const meta = {
        supplierName: invoiceMeta.supplierName || undefined,
        invoiceNumber: invoiceMeta.invoiceNumber || undefined,
        invoiceDate: invoiceMeta.invoiceDate || undefined,
        grandTotal: invoiceMeta.grandTotal ? parseFloat(invoiceMeta.grandTotal) : undefined,
      };

      return customFetch<{ applied: number; skipped: number; priceUpdated: number; newAdded: number; errors: string[] }>(
        `/api/ocr/sessions/${sessionId}/apply`,
        {
          method: "POST",
          body: JSON.stringify({
            shopId,
            scanType,
            lines: linesToApply,
            newProducts: newProductsToAdd.length > 0 ? newProductsToAdd : undefined,
            invoiceMeta: Object.values(meta).some(Boolean) ? meta : undefined,
            performedBy: role,
          }),
        },
      );
    },
    onSuccess: (data) => {
      const parts = [];
      if (data.applied > 0) parts.push(`${data.applied} restocked`);
      if (data.priceUpdated > 0) parts.push(`${data.priceUpdated} prices updated`);
      if (data.newAdded > 0) parts.push(`${data.newAdded} new products added`);
      toast.success("Stock updated — " + (parts.join(", ") || "done"));
      if (data.skipped > 0) toast.warning(`${data.skipped} items skipped — product not found`);
      setApplied(true);
      setApproving(false);
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      refetchSessions();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to apply — please retry");
      setApproving(false);
    },
  });

  const updateItem = (idx: number, patch: Partial<EditedItem>) => {
    setEditedItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  const isProcessing = ocrScan.isPending || freeLoading;
  const recentSessions = (sessions || []).slice(0, 8);

  // Derived approval summary data
  const checkedRestocks = editedItems.filter((i) => i.checked && i.productId);
  const priceChanges = checkedRestocks.filter((i) => {
    const np = i.unitPrice ? parseFloat(i.unitPrice) : null;
    return np && np > 0 && np !== i.currentBuyingPrice;
  });
  const newProductItems = editedItems.filter((i) => !i.productId && i.addAsNew && i.newName.trim() && parseFloat(i.unitPrice) > 0);
  const totalActions = checkedRestocks.length + newProductItems.length;

  // ── Approval summary panel ────────────────────────────────────────────────
  if (scanResult && approving && !applied) {
    return (
      <div className="flex flex-col h-full min-h-0 bg-background">
        <div className="px-4 py-3 border-b border-border bg-card shrink-0">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold font-display">Approve Changes</h1>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">Review carefully — this will update your stock database</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">

          {/* Restocks section */}
          {checkedRestocks.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
                <Package className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-bold">Restock {checkedRestocks.length} Product{checkedRestocks.length !== 1 ? "s" : ""}</span>
              </div>
              {checkedRestocks.map((item, i) => (
                <div key={i} className="px-4 py-3 border-b border-border/20 last:border-0">
                  <p className="text-xs font-semibold text-foreground mb-1">{item.productName}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[11px] text-muted-foreground">
                      Qty: <span className="text-emerald-400 font-bold font-mono">+{item.qty}</span>
                    </span>
                    {item.currentStock != null && (
                      <span className="text-[11px] text-muted-foreground font-mono">
                        Stock: {item.currentStock} → <span className="text-foreground font-bold">{item.currentStock + item.qty}</span>
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Price changes section */}
          {priceChanges.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-amber-400" />
                <span className="text-sm font-bold">Price Updates ({priceChanges.length})</span>
              </div>
              {priceChanges.map((item, i) => {
                const oldP = item.currentBuyingPrice;
                const newP = parseFloat(item.unitPrice);
                const dir = priceDiff(oldP, newP);
                return (
                  <div key={i} className="px-4 py-3 border-b border-border/20 last:border-0">
                    <p className="text-xs font-semibold text-foreground mb-1.5">{item.productName}</p>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-mono text-muted-foreground">{fmtKes(oldP)}</span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground/50" />
                      <span className={cn(
                        "text-[11px] font-bold font-mono",
                        dir === "up" ? "text-rose-400" : dir === "down" ? "text-emerald-400" : "text-foreground",
                      )}>
                        {fmtKes(newP)}
                      </span>
                      {dir === "up" && <TrendingUp className="h-3 w-3 text-rose-400" />}
                      {dir === "down" && <TrendingDown className="h-3 w-3 text-emerald-400" />}
                      {oldP != null && (
                        <span className={cn(
                          "text-[10px] font-bold ml-1",
                          dir === "up" ? "text-rose-400" : "text-emerald-400",
                        )}>
                          {pctChange(oldP, newP)}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {dir === "up" ? "⚠️ Price increased — consider updating selling price" :
                       dir === "down" ? "✓ Price decreased — you may reduce selling price" : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          )}

          {/* New products section */}
          {newProductItems.length > 0 && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border/60 flex items-center gap-2">
                <PlusCircle className="h-4 w-4 text-primary" />
                <span className="text-sm font-bold">Add {newProductItems.length} New Product{newProductItems.length !== 1 ? "s" : ""}</span>
              </div>
              {newProductItems.map((item, i) => (
                <div key={i} className="px-4 py-3 border-b border-border/20 last:border-0">
                  <p className="text-xs font-semibold text-foreground mb-1">{item.newName}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{item.newCategory}</span>
                    <span className="text-[10px] bg-muted px-2 py-0.5 rounded-full">{item.newUnit}</span>
                    <span className="text-[10px] font-mono text-muted-foreground">Buy: {fmtKes(parseFloat(item.unitPrice))}</span>
                    {item.newSellingPrice && (
                      <span className="text-[10px] font-mono text-muted-foreground">Sell: {fmtKes(parseFloat(item.newSellingPrice))}</span>
                    )}
                    <span className="text-[10px] text-emerald-400 font-mono">Stock: {item.qty}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* No-action state */}
          {totalActions === 0 && (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <AlertCircle className="h-8 w-8 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Nothing to apply yet</p>
              <p className="text-xs text-muted-foreground/60">Go back and select items or add new products</p>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex gap-3 pt-2 pb-4">
            <Button
              variant="outline"
              className="flex-1 h-12 font-bold"
              onClick={() => setApproving(false)}
              disabled={applyMutation.isPending}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />Back & Edit
            </Button>
            <Button
              className={cn(
                "flex-1 h-12 font-bold",
                totalActions > 0
                  ? "bg-primary text-primary-foreground hover:bg-primary/90"
                  : "opacity-40 cursor-not-allowed",
              )}
              onClick={() => totalActions > 0 && applyMutation.mutate()}
              disabled={applyMutation.isPending || totalActions === 0}
            >
              {applyMutation.isPending ? (
                "Applying…"
              ) : (
                <><ShieldCheck className="h-4 w-4 mr-2" />Confirm & Apply</>
              )}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Main view ─────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold font-display">Smart Scanner</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Scan supplier invoices · match products · restock instantly
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* Engine toggle */}
          <div className="grid grid-cols-2 gap-2">
            {(["free", "ai"] as const).map((eng) => (
              <button
                key={eng}
                onClick={() => { setEngine(eng); setScanResult(null); setApplied(false); }}
                className={cn(
                  "rounded-xl border p-3 text-left transition-all",
                  engine === eng
                    ? "border-primary bg-primary/8 ring-1 ring-primary/40"
                    : "border-border bg-muted/20 hover:bg-muted/40",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  {eng === "free"
                    ? <Cpu className={cn("h-4 w-4", engine === "free" ? "text-primary" : "text-muted-foreground")} />
                    : <Zap className={cn("h-4 w-4", engine === "ai" ? "text-primary" : "text-muted-foreground")} />}
                  <span className={cn("text-xs font-bold", engine === eng ? "text-primary" : "text-foreground")}>
                    {eng === "free" ? "Free OCR" : "Hybrid AI"}
                  </span>
                  <span className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                    eng === "free"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  )}>
                    {eng === "free" ? "Offline" : "Gemini"}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  {eng === "free"
                    ? "Runs on-device. Best for clear printed text."
                    : "OCR + Gemini Vision. Handles handwriting & complex layouts."}
                </p>
              </button>
            ))}
          </div>

          {/* Scan type (AI only) */}
          {engine === "ai" && (
            <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
              {(["invoice", "notebook"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setScanType(type)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5",
                    scanType === type
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {type === "invoice" ? "Supplier Invoice" : "Notebook"}
                </button>
              ))}
            </div>
          )}

          {/* Camera preview */}
          <div className="relative bg-muted/30 border border-border/60 rounded-2xl overflow-hidden aspect-[4/3] flex items-center justify-center">
            {image ? (
              <>
                <img
                  src={image}
                  alt="Document to scan"
                  className="w-full h-full object-contain cursor-zoom-in"
                  onClick={() => !isProcessing && openLightbox(image)}
                />
                {isProcessing && (
                  <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-3">
                    <ScanLine className="h-8 w-8 text-primary animate-pulse" />
                    <p className="text-sm font-bold">
                      {engine === "free" ? "Running OCR on device…" : "OCR → Gemini AI…"}
                    </p>
                  </div>
                )}
                <div className="absolute top-3 left-3 w-5 h-5 border-t-2 border-l-2 border-primary rounded-tl" />
                <div className="absolute top-3 right-3 w-5 h-5 border-t-2 border-r-2 border-primary rounded-tr" />
                <div className="absolute bottom-3 left-3 w-5 h-5 border-b-2 border-l-2 border-primary rounded-bl" />
                <div className="absolute bottom-3 right-3 w-5 h-5 border-b-2 border-r-2 border-primary rounded-br" />
              </>
            ) : (
              <div className="flex flex-col items-center gap-3 text-muted-foreground p-8">
                <div className="relative">
                  <div className="w-16 h-16 border-2 border-dashed border-muted-foreground/30 rounded-xl flex items-center justify-center">
                    <Image className="h-8 w-8 opacity-30" />
                  </div>
                  <div className="absolute top-0 left-0 w-3 h-3 border-t-2 border-l-2 border-primary rounded-tl" />
                  <div className="absolute top-0 right-0 w-3 h-3 border-t-2 border-r-2 border-primary rounded-tr" />
                  <div className="absolute bottom-0 left-0 w-3 h-3 border-b-2 border-l-2 border-primary rounded-bl" />
                  <div className="absolute bottom-0 right-0 w-3 h-3 border-b-2 border-r-2 border-primary rounded-br" />
                </div>
                <p className="text-xs font-medium text-center">Tap Camera or Gallery to capture your document</p>
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  Tip: Flat surface, good lighting, full invoice in frame
                </p>
              </div>
            )}
          </div>

          {/* Action buttons */}
          {!image ? (
            <div className="grid grid-cols-2 gap-2">
              <label className="cursor-pointer">
                <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={handleCapture} />
                <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm hover:bg-primary/90 transition-colors">
                  <Camera className="h-4 w-4" />Camera
                </div>
              </label>
              <label className="cursor-pointer">
                <input type="file" accept="image/*" className="sr-only" onChange={handleCapture} />
                <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-muted border border-border text-foreground font-bold text-sm hover:bg-muted/80 transition-colors">
                  <Upload className="h-4 w-4" />Gallery
                </div>
              </label>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="h-12 font-bold"
                onClick={() => { setImage(null); setScanResult(null); setApplied(false); setApproving(false); }}
                disabled={isProcessing}
              >
                Retake
              </Button>
              <Button
                className="h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={engine === "free" ? processFree : processAI}
                disabled={isProcessing}
              >
                {engine === "free"
                  ? <><Cpu className="h-4 w-4 mr-2" />{freeLoading ? "Scanning…" : "Free Scan"}</>
                  : <><Zap className="h-4 w-4 mr-2" />{ocrScan.isPending ? "Scanning…" : "Hybrid Scan"}</>}
              </Button>
            </div>
          )}

          {/* ── Review Panel ── */}
          {scanResult && !applied && !approving && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">

              {/* Summary counts */}
              <div className="px-4 pt-4 pb-3 border-b border-border/60">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                  <span className="text-sm font-bold">Scan Complete</span>
                  <span className="text-[10px] text-muted-foreground">via {scanResult.engine === "free" ? "Free OCR" : "Hybrid AI"}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-emerald-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold font-mono text-emerald-400">{scanResult.confirmedCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Confirmed</p>
                  </div>
                  <div className="bg-orange-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold font-mono text-orange-400">{scanResult.reviewCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Review</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-lg font-bold font-mono text-muted-foreground">{scanResult.unresolvedCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Unresolved</p>
                  </div>
                </div>
              </div>

              {/* Invoice metadata */}
              {(scanResult.scanType === "invoice" || scanType === "invoice") && (
                <div className="px-4 py-3 border-b border-border/60 space-y-3">
                  <div className="flex items-center gap-2">
                    <ClipboardList className="h-3.5 w-3.5 text-primary" />
                    <span className="text-xs font-bold uppercase tracking-wide">Invoice Details</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Building2 className="h-3 w-3" />Supplier
                      </Label>
                      <Input value={invoiceMeta.supplierName}
                        onChange={(e) => setInvoiceMeta((m) => ({ ...m, supplierName: e.target.value }))}
                        placeholder="Supplier name" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Hash className="h-3 w-3" />Invoice No.
                      </Label>
                      <Input value={invoiceMeta.invoiceNumber}
                        onChange={(e) => setInvoiceMeta((m) => ({ ...m, invoiceNumber: e.target.value }))}
                        placeholder="e.g. INV-0234" className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />Date
                      </Label>
                      <Input type="date" value={invoiceMeta.invoiceDate}
                        onChange={(e) => setInvoiceMeta((m) => ({ ...m, invoiceDate: e.target.value }))}
                        className="h-8 text-xs" />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Banknote className="h-3 w-3" />Grand Total (KES)
                      </Label>
                      <Input type="number" value={invoiceMeta.grandTotal}
                        onChange={(e) => setInvoiceMeta((m) => ({ ...m, grandTotal: e.target.value }))}
                        placeholder="0" className="h-8 text-xs font-mono" />
                    </div>
                  </div>
                </div>
              )}

              {/* Line items */}
              {editedItems.length > 0 && (
                <div className="border-b border-border/60">
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                      Items ({editedItems.length})
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditedItems((prev) => prev.map((i) => ({ ...i, checked: !!i.productId })))}
                        className="text-[10px] text-primary hover:underline"
                      >
                        Select matched
                      </button>
                      <span className="text-[10px] text-muted-foreground">·</span>
                      <button
                        onClick={() => setEditedItems((prev) => prev.map((i) => ({ ...i, checked: false, addAsNew: false })))}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  {(showAllLines ? editedItems : editedItems.slice(0, 8)).map((item, idx) => {
                    const newP = item.unitPrice ? parseFloat(item.unitPrice) : null;
                    const dir = item.productId ? priceDiff(item.currentBuyingPrice, newP) : null;

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "px-3 py-3 border-b border-border/20 last:border-0",
                          item.checked && (item.productId || item.addAsNew) ? "bg-primary/3" : "",
                          !item.productId && !item.addAsNew ? "opacity-70" : "",
                        )}
                      >
                        <div className="flex items-start gap-2.5">
                          {/* Checkbox */}
                          <button
                            onClick={() => {
                              if (item.productId) updateItem(idx, { checked: !item.checked });
                              else if (!item.addAsNew) updateItem(idx, { addAsNew: true, checked: true });
                              else updateItem(idx, { addAsNew: false, checked: false });
                            }}
                            className={cn(
                              "mt-0.5 w-4.5 h-4.5 rounded border shrink-0 flex items-center justify-center transition-all cursor-pointer",
                              item.checked && (item.productId || item.addAsNew)
                                ? "bg-primary border-primary"
                                : "border-border bg-muted/40",
                            )}
                          >
                            {item.checked && (item.productId || item.addAsNew) && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                          </button>

                          <div className="flex-1 min-w-0 space-y-2">
                            {/* Product name / status */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.productId ? (
                                <span className="text-xs font-semibold text-foreground">{item.productName}</span>
                              ) : item.addAsNew ? (
                                <span className="text-xs font-semibold text-primary">New product</span>
                              ) : (
                                <span className="text-xs text-muted-foreground italic truncate max-w-[180px]">{item.rawText}</span>
                              )}
                              <span className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                                item.status === "confirmed" ? "bg-emerald-500/15 text-emerald-400" :
                                item.status === "review" ? "bg-orange-500/15 text-orange-400" :
                                item.addAsNew ? "bg-primary/15 text-primary" :
                                "bg-muted text-muted-foreground",
                              )}>
                                {item.addAsNew ? "new" : item.status}
                              </span>
                            </div>

                            {/* Raw text hint */}
                            {item.productId && item.rawText && (
                              <p className="text-[10px] text-muted-foreground/50 truncate">{item.rawText}</p>
                            )}

                            {/* Unresolved — not adding as new */}
                            {!item.productId && !item.addAsNew && (
                              <button
                                onClick={() => updateItem(idx, { addAsNew: true, checked: true })}
                                className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                              >
                                <PlusCircle className="h-3 w-3" />Add as new product
                              </button>
                            )}

                            {/* New product form */}
                            {!item.productId && item.addAsNew && (
                              <div className="space-y-2 pt-1">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-primary uppercase tracking-wide">New Product Details</span>
                                  <button onClick={() => updateItem(idx, { addAsNew: false, checked: false })}>
                                    <X className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                  </button>
                                </div>
                                <Input
                                  value={item.newName}
                                  onChange={(e) => updateItem(idx, { newName: e.target.value })}
                                  placeholder="Product name"
                                  className="h-7 text-xs"
                                />
                                <div className="grid grid-cols-2 gap-1.5">
                                  <select
                                    value={item.newCategory}
                                    onChange={(e) => updateItem(idx, { newCategory: e.target.value })}
                                    className="h-7 text-xs rounded-md border border-border bg-background px-2"
                                  >
                                    {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
                                  </select>
                                  <select
                                    value={item.newUnit}
                                    onChange={(e) => updateItem(idx, { newUnit: e.target.value })}
                                    className="h-7 text-xs rounded-md border border-border bg-background px-2"
                                  >
                                    {UNITS.map((u) => <option key={u}>{u}</option>)}
                                  </select>
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                  <div>
                                    <p className="text-[9px] text-muted-foreground mb-0.5">Buy price (KES) *</p>
                                    <Input
                                      type="number"
                                      value={item.unitPrice}
                                      onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                                      placeholder="0"
                                      className="h-7 text-xs font-mono"
                                    />
                                  </div>
                                  <div>
                                    <p className="text-[9px] text-muted-foreground mb-0.5">Sell price (KES)</p>
                                    <Input
                                      type="number"
                                      value={item.newSellingPrice}
                                      onChange={(e) => updateItem(idx, { newSellingPrice: e.target.value })}
                                      placeholder="0"
                                      className="h-7 text-xs font-mono"
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Qty + price row (matched items) */}
                            {item.productId && (
                              <div className="space-y-1.5">
                                <div className="flex items-center gap-2 flex-wrap">
                                  {/* Qty stepper */}
                                  <div className="flex items-center gap-1">
                                    <button
                                      onClick={() => updateItem(idx, { qty: Math.max(1, item.qty - 1) })}
                                      className="h-6 w-6 rounded border border-border bg-muted/60 flex items-center justify-center hover:bg-muted"
                                    >
                                      <Minus className="h-3 w-3" />
                                    </button>
                                    <input
                                      type="number"
                                      value={item.qty}
                                      min={1}
                                      onChange={(e) => updateItem(idx, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                                      className="h-6 w-12 text-center text-xs font-bold font-mono border border-border rounded bg-background"
                                    />
                                    <button
                                      onClick={() => updateItem(idx, { qty: item.qty + 1 })}
                                      className="h-6 w-6 rounded border border-border bg-muted/60 flex items-center justify-center hover:bg-muted"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                    <span className="text-[10px] text-muted-foreground">units</span>
                                  </div>

                                  {/* Buy price with current price hint */}
                                  <div className="flex items-center gap-1 ml-auto">
                                    <span className="text-[10px] text-muted-foreground">Buy KES</span>
                                    <input
                                      type="number"
                                      value={item.unitPrice}
                                      onChange={(e) => updateItem(idx, { unitPrice: e.target.value })}
                                      placeholder="—"
                                      className="h-6 w-20 text-xs font-mono border border-border rounded bg-background px-1.5"
                                    />
                                  </div>
                                </div>

                                {/* Price diff indicator */}
                                {newP && newP > 0 && item.currentBuyingPrice != null && (
                                  <div className={cn(
                                    "flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg",
                                    dir === "up" ? "bg-rose-500/10 text-rose-400" :
                                    dir === "down" ? "bg-emerald-500/10 text-emerald-400" :
                                    "bg-muted/60 text-muted-foreground",
                                  )}>
                                    {dir === "up" && <TrendingUp className="h-3 w-3 shrink-0" />}
                                    {dir === "down" && <TrendingDown className="h-3 w-3 shrink-0" />}
                                    {dir === "same" && <Equal className="h-3 w-3 shrink-0" />}
                                    <span>
                                      {dir === "same"
                                        ? `Same as current (${fmtKes(item.currentBuyingPrice)}) — no change`
                                        : dir === "up"
                                        ? `Price up from ${fmtKes(item.currentBuyingPrice)} → ${fmtKes(newP)}  ${pctChange(item.currentBuyingPrice, newP)}`
                                        : dir === "down"
                                        ? `Price down from ${fmtKes(item.currentBuyingPrice)} → ${fmtKes(newP)}  ${pctChange(item.currentBuyingPrice, newP)}`
                                        : `Current price: ${fmtKes(item.currentBuyingPrice)}`}
                                    </span>
                                  </div>
                                )}
                                {(!newP || newP <= 0) && item.currentBuyingPrice != null && (
                                  <p className="text-[10px] text-muted-foreground/60 pl-1">
                                    Current buy price: {fmtKes(item.currentBuyingPrice)} — enter new price to update
                                  </p>
                                )}
                              </div>
                            )}

                            {/* New product qty */}
                            {!item.productId && item.addAsNew && (
                              <div className="flex items-center gap-1">
                                <span className="text-[10px] text-muted-foreground">Opening stock:</span>
                                <button onClick={() => updateItem(idx, { qty: Math.max(1, item.qty - 1) })} className="h-6 w-6 rounded border border-border bg-muted/60 flex items-center justify-center hover:bg-muted">
                                  <Minus className="h-3 w-3" />
                                </button>
                                <input
                                  type="number"
                                  value={item.qty}
                                  min={1}
                                  onChange={(e) => updateItem(idx, { qty: Math.max(1, parseInt(e.target.value) || 1) })}
                                  className="h-6 w-12 text-center text-xs font-bold font-mono border border-border rounded bg-background"
                                />
                                <button onClick={() => updateItem(idx, { qty: item.qty + 1 })} className="h-6 w-6 rounded border border-border bg-muted/60 flex items-center justify-center hover:bg-muted">
                                  <Plus className="h-3 w-3" />
                                </button>
                                <span className="text-[10px] text-muted-foreground">units</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {editedItems.length > 8 && (
                    <button
                      onClick={() => setShowAllLines((v) => !v)}
                      className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5"
                    >
                      {showAllLines
                        ? <><ChevronUp className="h-3.5 w-3.5" />Show less</>
                        : <><ChevronDown className="h-3.5 w-3.5" />Show all {editedItems.length} items</>}
                    </button>
                  )}
                </div>
              )}

              {/* Free OCR tip */}
              {scanResult.engine === "free" && scanResult.confirmedCount === 0 && (
                <div className="mx-4 my-3 rounded-lg bg-amber-500/10 border border-amber-400/20 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      No matches found. Free OCR works best on clear printed text. For handwritten invoices, try <strong className="text-foreground">Hybrid AI</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Review & Approve button */}
              <div className="px-4 py-3">
                {totalActions > 0 ? (
                  <Button
                    className="w-full h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => setApproving(true)}
                  >
                    <ShieldCheck className="h-4 w-4 mr-2" />
                    Review & Approve ({totalActions} action{totalActions !== 1 ? "s" : ""})
                  </Button>
                ) : (
                  <p className="text-center text-xs text-muted-foreground py-1">
                    Select matched items or add new products above
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Applied success */}
          {scanResult && applied && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-400">Stock Updated</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Products restocked, prices updated, and new products added to your inventory.
                </p>
              </div>
              <Button
                variant="outline" size="sm" className="text-xs"
                onClick={() => { setImage(null); setScanResult(null); setApplied(false); setApproving(false); }}
              >
                Scan Another Invoice
              </Button>
            </div>
          )}

          {/* Recent scans */}
          {recentSessions.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Invoice History</h2>
              <div className="space-y-2">
                {recentSessions.map((session: any) => {
                  let meta: any = null;
                  try { if (session.resultJson) { const p = JSON.parse(session.resultJson); meta = p.invoiceMeta ?? null; } } catch {}
                  const hasImage = !!session.imageUrl;

                  return (
                    <div key={session.id} className="flex items-center gap-3 bg-card border border-border/60 rounded-xl p-3">
                      <div
                        className={cn(
                          "w-12 h-12 rounded-lg overflow-hidden shrink-0 bg-muted/60 border border-border/40 flex items-center justify-center",
                          hasImage && "cursor-zoom-in"
                        )}
                        onClick={() => hasImage && openLightbox(session.imageUrl!)}
                      >
                        {hasImage ? (
                          <img
                            src={session.imageUrl}
                            alt="Invoice"
                            className="w-full h-full object-cover"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                          />
                        ) : (
                          <ImageIcon className="h-5 w-5 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground">
                          {meta?.supplierName
                            ? <><span className="text-primary">{meta.supplierName}</span> · {session.scanType}</>
                            : <>{session.scanType === "notebook" ? "Notebook" : "Invoice"} Scan</>}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(session.createdAt), "MMM d, h:mm a")}
                          {session.totalProducts > 0 && ` · ${session.totalProducts} items`}
                          {meta?.grandTotal && ` · KES ${Number(meta.grandTotal).toLocaleString("en-KE")}`}
                          {meta?.invoiceNumber && ` · #${meta.invoiceNumber}`}
                        </p>
                      </div>
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0",
                        session.status === "complete" || session.status === "applied"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : "bg-muted text-muted-foreground",
                      )}>
                        {session.status === "applied" ? "Applied" : session.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

        </div>
      </div>
      {lightboxUrl && <ImageLightbox url={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}
