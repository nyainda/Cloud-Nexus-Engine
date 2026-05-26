import { useState, useMemo, useEffect } from "react";
import {
  useOcrScan, useListScanSessions, useListProducts,
  customFetch, getListProductsQueryKey, getListInventoryMovementsQueryKey,
} from "@workspace/api-client-react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Camera, Upload, ScanLine, FileText, CheckCircle2, Image,
  Zap, Cpu, Lock, AlertCircle, ChevronDown, ChevronUp,
  Package, Minus, Plus, Check, ClipboardList,
  Building2, Hash, Calendar, Banknote, ArrowRight,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Engine = "ai" | "free";

// ─── helpers ──────────────────────────────────────────────────────────────────

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

function extractPricesFromLine(line: string): { unitPrice: number | null; totalPrice: number | null } {
  const numbers = [...line.matchAll(/\b(\d{1,3}(?:,\d{3})*(?:\.\d{0,2})?|\d{4,}(?:\.\d{0,2})?)\b/g)]
    .map((m) => parseFloat(m[1].replace(/,/g, "")))
    .filter((n) => n >= 5 && n <= 999999);
  if (numbers.length === 0) return { unitPrice: null, totalPrice: null };
  if (numbers.length === 1) return { unitPrice: numbers[0], totalPrice: null };
  return { unitPrice: numbers[numbers.length - 2] ?? null, totalPrice: numbers[numbers.length - 1] ?? null };
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
        inferredTotal: prices.totalPrice,
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
      inferredTotal: prices.totalPrice,
      confidence: hit.score,
      status: hit.score >= 0.7 ? "confirmed" : "review",
    });
  }

  const confirmed = result.filter((r) => r.status === "confirmed").length;
  const review = result.filter((r) => r.status === "review").length;
  const unresolved = result.filter((r) => r.status === "unresolved").length;

  return {
    sessionId: null,
    engine: "free",
    invoiceMeta: null,
    totalDetected: result.length,
    confirmedCount: confirmed,
    reviewCount: review,
    unresolvedCount: unresolved,
    lines: result,
  };
}

// ─── EditableItem ─────────────────────────────────────────────────────────────

interface EditedItem {
  checked: boolean;
  qty: number;
  unitPrice: string;
  productId: string | null;
  productName: string | null;
  rawText: string;
  status: string;
}

function initEditedItems(lines: any[]): EditedItem[] {
  return lines.map((line: any) => ({
    checked: line.status === "confirmed" || line.status === "review",
    qty: Math.max(1, line.qty ?? line.inferredQty ?? 1),
    unitPrice: line.inferredUnitPrice ? String(line.inferredUnitPrice) : "",
    productId: line.productId ?? null,
    productName: line.productName ?? null,
    rawText: line.rawText ?? "",
    status: line.status ?? "unresolved",
  }));
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

  // Review state
  const [editedItems, setEditedItems] = useState<EditedItem[]>([]);
  const [invoiceMeta, setInvoiceMeta] = useState({ supplierName: "", invoiceNumber: "", invoiceDate: "", grandTotal: "" });
  const [applied, setApplied] = useState(false);

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

  // Initialize review state when scan result arrives
  useEffect(() => {
    if (!scanResult?.lines) return;
    setEditedItems(initEditedItems(scanResult.lines));
    setApplied(false);
    // Pre-fill invoice meta from AI result
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
  }, [scanResult]);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImage(ev.target?.result as string);
      setScanResult(null);
      setShowAllLines(false);
      setApplied(false);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const processAI = () => {
    if (!image) return;
    ocrScan.mutate(
      { data: { shopId, imageBase64: image.split(",")[1], scanType } },
      {
        onSuccess: (data) => {
          setScanResult({ ...data, engine: "ai" });
          toast.success(`AI detected ${data.totalDetected} items`);
          refetchSessions();
        },
        onError: (err: any) => {
          const msg = err?.message ?? "";
          if (msg.includes("API key") || msg.includes("GEMINI")) {
            toast.error("GEMINI_API_KEY not configured — switch to Free OCR");
          } else {
            toast.error("AI scan failed. Try the Free OCR engine instead.");
          }
        },
      },
    );
  };

  const processFree = async () => {
    if (!image) return;
    setFreeLoading(true);
    try {
      toast.info("Loading OCR engine… (first use downloads ~4 MB)", { duration: 5000 });
      const { default: Tesseract } = await import("tesseract.js");
      const { data: { text } } = await (Tesseract as any).recognize(image, "eng", { logger: () => {} });
      const result = buildFreeResult(text, products);
      setScanResult(result);
      toast.success(`Free OCR found ${result.totalDetected} items`);
    } catch (err: any) {
      toast.error("Free OCR failed — " + (err?.message ?? "unknown error"));
    } finally {
      setFreeLoading(false);
    }
  };

  // Apply to stock mutation
  const applyMutation = useMutation({
    mutationFn: async () => {
      const linesToApply = editedItems
        .filter((item) => item.checked && item.productId && item.qty > 0)
        .map((item) => ({
          productId: item.productId!,
          qty: item.qty,
          unitPrice: item.unitPrice ? parseFloat(item.unitPrice) : undefined,
        }));

      if (linesToApply.length === 0) throw new Error("No items selected");

      let sessionId = scanResult?.sessionId as string | null;

      // Free OCR has no session yet — create one first
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

      return customFetch<{ applied: number; skipped: number; errors: string[] }>(
        `/api/ocr/sessions/${sessionId}/apply`,
        {
          method: "POST",
          body: JSON.stringify({
            scanType,
            lines: linesToApply,
            invoiceMeta: Object.values(meta).some(Boolean) ? meta : undefined,
            performedBy: role,
          }),
        },
      );
    },
    onSuccess: (data) => {
      toast.success(`Applied ${data.applied} item${data.applied !== 1 ? "s" : ""} to stock`);
      if (data.skipped > 0) toast.warning(`${data.skipped} items skipped — product not found`);
      setApplied(true);
      qc.invalidateQueries({ queryKey: getListProductsQueryKey() });
      qc.invalidateQueries({ queryKey: getListInventoryMovementsQueryKey() });
      refetchSessions();
    },
    onError: (err: any) => {
      toast.error(err?.message ?? "Failed to apply items — please retry");
    },
  });

  const isProcessing = ocrScan.isPending || freeLoading;
  const recentSessions = (sessions || []).slice(0, 8);
  const checkedCount = editedItems.filter((i) => i.checked && i.productId).length;
  const totalCheckedQty = editedItems.filter((i) => i.checked && i.productId).reduce((s, i) => s + i.qty, 0);

  const updateItem = (idx: number, patch: Partial<EditedItem>) => {
    setEditedItems((prev) => prev.map((item, i) => i === idx ? { ...item, ...patch } : item));
  };

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold font-display">Smart Scanner</h1>
          </div>
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
            <Lock className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-500">Images never stored</span>
          </div>
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
                    {eng === "free" ? "Free OCR" : "AI Scanner"}
                  </span>
                  <Badge className={cn(
                    "text-[9px] px-1.5 py-0 h-4 border-0",
                    eng === "free"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-amber-500/15 text-amber-600 dark:text-amber-400",
                  )}>
                    {eng === "free" ? "No key" : "Gemini"}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">
                  {eng === "free"
                    ? "Runs on-device. Best for printed invoices."
                    : "Gemini Vision. Handles handwriting & complex layouts."}
                </p>
              </button>
            ))}
          </div>

          {/* Engine notice */}
          {engine === "ai" && (
            <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5">
              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Image is sent to <strong className="text-foreground">Google Gemini</strong> for analysis, then discarded. Requires{" "}
                <code className="font-mono bg-muted/60 px-1 py-0.5 rounded text-[10px]">GEMINI_API_KEY</code>.
              </p>
            </div>
          )}
          {engine === "free" && (
            <div className="flex items-start gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2.5">
              <Cpu className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                OCR runs <strong className="text-foreground">entirely on this device</strong> — no internet needed. ~4 MB downloaded once and cached.
              </p>
            </div>
          )}

          {/* Scan type toggle */}
          {engine === "ai" && (
            <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
              {(["invoice", "notebook"] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => setScanType(type)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all capitalize flex items-center justify-center gap-1.5",
                    scanType === type
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {type === "invoice" ? "Supplier Invoice" : "Notebook Scan"}
                </button>
              ))}
            </div>
          )}

          {/* Camera / Preview */}
          <div className="relative bg-muted/30 border border-border/60 rounded-2xl overflow-hidden aspect-[4/3] flex items-center justify-center">
            {image ? (
              <>
                <img src={image} alt="Document to scan" className="w-full h-full object-contain" />
                {isProcessing && (
                  <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-3">
                    <ScanLine className="h-8 w-8 text-primary animate-pulse" />
                    <p className="text-sm font-bold">
                      {engine === "free" ? "Running OCR on device…" : "Analyzing with AI…"}
                    </p>
                    <p className="text-xs text-muted-foreground">Extracting products and quantities</p>
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
                <div className="flex items-center justify-center gap-2 h-12 rounded-xl bg-primary text-primary-foreground font-bold text-sm border border-primary/20 hover:bg-primary/90 transition-colors">
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
                onClick={() => { setImage(null); setScanResult(null); setApplied(false); }}
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
                  : <><Zap className="h-4 w-4 mr-2" />{ocrScan.isPending ? "Scanning…" : "AI Scan"}</>}
              </Button>
            </div>
          )}

          {/* ── Scan Result + Review Panel ── */}
          {scanResult && !applied && (
            <div className="bg-card border border-border rounded-2xl overflow-hidden">

              {/* Summary header */}
              <div className="px-4 pt-4 pb-3 border-b border-border/60">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-bold">Scan Complete</span>
                    <span className="text-[10px] text-muted-foreground">
                      via {scanResult.engine === "free" ? "Free OCR" : "Gemini AI"}
                    </span>
                  </div>
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

              {/* Invoice metadata form */}
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
                      <Input
                        value={invoiceMeta.supplierName}
                        onChange={(e) => setInvoiceMeta((m) => ({ ...m, supplierName: e.target.value }))}
                        placeholder="Supplier name"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Hash className="h-3 w-3" />Invoice No.
                      </Label>
                      <Input
                        value={invoiceMeta.invoiceNumber}
                        onChange={(e) => setInvoiceMeta((m) => ({ ...m, invoiceNumber: e.target.value }))}
                        placeholder="e.g. INV-0234"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />Date
                      </Label>
                      <Input
                        type="date"
                        value={invoiceMeta.invoiceDate}
                        onChange={(e) => setInvoiceMeta((m) => ({ ...m, invoiceDate: e.target.value }))}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Banknote className="h-3 w-3" />Grand Total (KES)
                      </Label>
                      <Input
                        type="number"
                        value={invoiceMeta.grandTotal}
                        onChange={(e) => setInvoiceMeta((m) => ({ ...m, grandTotal: e.target.value }))}
                        placeholder="0"
                        className="h-8 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Line items — editable */}
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
                        onClick={() => setEditedItems((prev) => prev.map((i) => ({ ...i, checked: false })))}
                        className="text-[10px] text-muted-foreground hover:text-foreground"
                      >
                        Clear all
                      </button>
                    </div>
                  </div>

                  {(showAllLines ? editedItems : editedItems.slice(0, 8)).map((item, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "px-3 py-3 border-b border-border/20 last:border-0 transition-colors",
                        item.checked && item.productId ? "bg-primary/3" : "",
                      )}
                    >
                      <div className="flex items-start gap-2.5">
                        {/* Checkbox */}
                        <button
                          onClick={() => updateItem(idx, { checked: !item.checked })}
                          className={cn(
                            "mt-0.5 w-4.5 h-4.5 rounded border shrink-0 flex items-center justify-center transition-all",
                            item.checked && item.productId
                              ? "bg-primary border-primary"
                              : "border-border bg-muted/40",
                            !item.productId ? "opacity-40 cursor-not-allowed" : "cursor-pointer",
                          )}
                          disabled={!item.productId}
                        >
                          {item.checked && item.productId && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                        </button>

                        <div className="flex-1 min-w-0 space-y-2">
                          {/* Product name + raw text */}
                          <div>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {item.productId ? (
                                <span className="text-xs font-semibold text-foreground">{item.productName}</span>
                              ) : (
                                <span className="text-xs text-muted-foreground italic truncate max-w-[180px]">{item.rawText}</span>
                              )}
                              <span className={cn(
                                "text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0",
                                item.status === "confirmed" ? "bg-emerald-500/15 text-emerald-400" :
                                item.status === "review" ? "bg-orange-500/15 text-orange-400" :
                                "bg-muted text-muted-foreground",
                              )}>
                                {item.status}
                              </span>
                            </div>
                            {item.productId && item.rawText && (
                              <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{item.rawText}</p>
                            )}
                            {!item.productId && (
                              <p className="text-[10px] text-muted-foreground/50 mt-0.5 flex items-center gap-1">
                                <Package className="h-2.5 w-2.5" />No product match — add manually if needed
                              </p>
                            )}
                          </div>

                          {/* Qty + price row */}
                          {item.productId && (
                            <div className="flex items-center gap-2">
                              {/* Qty stepper */}
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => updateItem(idx, { qty: Math.max(1, item.qty - 1) })}
                                  className="h-6 w-6 rounded border border-border bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
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
                                  className="h-6 w-6 rounded border border-border bg-muted/60 flex items-center justify-center hover:bg-muted transition-colors"
                                >
                                  <Plus className="h-3 w-3" />
                                </button>
                                <span className="text-[10px] text-muted-foreground">units</span>
                              </div>

                              {/* Unit price */}
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
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {editedItems.length > 8 && (
                    <button
                      onClick={() => setShowAllLines((v) => !v)}
                      className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {showAllLines
                        ? <><ChevronUp className="h-3.5 w-3.5" />Show less</>
                        : <><ChevronDown className="h-3.5 w-3.5" />Show all {editedItems.length} items</>}
                    </button>
                  )}
                </div>
              )}

              {/* Free OCR no-match tip */}
              {scanResult.engine === "free" && scanResult.confirmedCount === 0 && (
                <div className="mx-4 my-3 rounded-lg bg-amber-500/10 border border-amber-400/20 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      No product matches found. Free OCR works best on <strong className="text-foreground">clear printed text</strong>. For handwritten invoices, try the <strong className="text-foreground">AI Scanner</strong>.
                    </p>
                  </div>
                </div>
              )}

              {/* Apply to Stock button */}
              <div className="px-4 py-3">
                {checkedCount > 0 ? (
                  <Button
                    className="w-full h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                    onClick={() => applyMutation.mutate()}
                    disabled={applyMutation.isPending}
                  >
                    {applyMutation.isPending ? (
                      "Restocking…"
                    ) : (
                      <>
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Apply {checkedCount} item{checkedCount !== 1 ? "s" : ""} · {totalCheckedQty} units to Stock
                      </>
                    )}
                  </Button>
                ) : (
                  <p className="text-center text-xs text-muted-foreground py-1">
                    Select matched items above to apply them to your inventory
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Applied success state */}
          {scanResult && applied && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-2xl p-5 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-2xl bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-bold text-emerald-400">Stock Updated</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Products restocked and buying prices updated where provided.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => { setImage(null); setScanResult(null); setApplied(false); }}
              >
                Scan Another Invoice
              </Button>
            </div>
          )}

          {/* Recent Scans */}
          {recentSessions.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Scans</h2>
              <div className="space-y-2">
                {recentSessions.map((session: any) => {
                  let meta: any = null;
                  try { if (session.resultJson) { const p = JSON.parse(session.resultJson); meta = p.invoiceMeta ?? null; } } catch {}
                  return (
                    <div key={session.id} className="flex items-center gap-3 bg-card border border-border/60 rounded-xl p-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <ScanLine className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground capitalize">
                          {meta?.supplierName
                            ? <><span className="text-primary">{meta.supplierName}</span> · {session.scanType}</>
                            : <>{session.scanType === "notebook" ? "Notebook" : "Invoice"} Scan</>
                          }
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {format(new Date(session.createdAt), "MMM d, h:mm a")}
                          {session.totalProducts > 0 && ` · ${session.totalProducts} items`}
                          {meta?.grandTotal && ` · KES ${Number(meta.grandTotal).toLocaleString("en-KE")}`}
                        </p>
                      </div>
                      <span className={cn(
                        "text-[9px] font-bold px-2 py-0.5 rounded-full shrink-0",
                        session.status === "complete" || session.status === "applied"
                          ? "bg-emerald-500/15 text-emerald-400"
                          : session.status === "processing"
                          ? "bg-orange-500/15 text-orange-400"
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
    </div>
  );
}
