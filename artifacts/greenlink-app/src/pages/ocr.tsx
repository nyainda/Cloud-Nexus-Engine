import { useState, useMemo } from "react";
import { useOcrScan, useListScanSessions, useListProducts } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Camera, Upload, ScanLine, FileText, CheckCircle2, Image,
  Zap, Cpu, Lock, AlertCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

type Engine = "ai" | "free";

// ─── Client-side product matching for free OCR ───────────────────────────────
function normalizeText(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function extractQtyFromLine(line: string): number {
  const match = line.match(
    /(\d+)\s*[xX×]|[xX×]\s*(\d+)|\bqty[\s:]+(\d+)|\b(\d+)\s+(?:units?|pcs?|bags?|kgs?|litres?|pieces?)\b/i
  );
  if (match) return parseInt(match[1] || match[2] || match[3] || match[4]);
  const nums = line.match(/\b(\d{1,3})\b/g);
  if (nums) return Math.min(parseInt(nums[nums.length - 1] || "1"), 999);
  return 1;
}

function matchLine(line: string, products: any[]): { product: any; score: number } | null {
  const norm = normalizeText(line);
  if (norm.length < 3) return null;
  let best: any = null;
  let bestScore = 0;

  for (const p of products) {
    const name = normalizeText(p.canonicalName ?? "");
    const words = name.split(" ").filter(w => w.length > 2);
    if (!words.length) continue;
    const matched = words.filter(w => norm.includes(w));
    const score = matched.length / words.length;
    if (score > bestScore && score >= 0.4) {
      bestScore = score;
      best = { product: p, score };
    }
  }
  return best;
}

function buildFreeResult(rawText: string, products: any[]) {
  const lines = rawText
    .split("\n")
    .map(l => l.trim())
    .filter(l => l.length > 3 && !/^\d+$/.test(l))
    .slice(0, 40);

  const seen = new Set<string>();
  const result: any[] = [];

  for (const line of lines) {
    const hit = matchLine(line, products);
    if (!hit) {
      result.push({ rawText: line, productName: null, productId: null, qty: 1, confidence: 0, status: "unresolved" });
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
      confidence: hit.score,
      status: hit.score >= 0.7 ? "confirmed" : "review",
    });
  }

  const confirmed = result.filter(r => r.status === "confirmed").length;
  const review = result.filter(r => r.status === "review").length;
  const unresolved = result.filter(r => r.status === "unresolved").length;

  return {
    sessionId: null,
    engine: "free",
    totalDetected: result.length,
    confirmedCount: confirmed,
    reviewCount: review,
    unresolvedCount: unresolved,
    lines: result,
  };
}

// ─── OCR Page ─────────────────────────────────────────────────────────────────
export default function OCR() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [engine, setEngine] = useState<Engine>("free");
  const [image, setImage] = useState<string | null>(null);
  const [scanType, setScanType] = useState<"notebook" | "invoice">("invoice");
  const [scanResult, setScanResult] = useState<any>(null);
  const [freeLoading, setFreeLoading] = useState(false);
  const [showAllLines, setShowAllLines] = useState(false);

  const ocrScan = useOcrScan();

  const { data: sessions, refetch: refetchSessions } = useListScanSessions(
    { shopId },
    { query: { enabled: !!shopId } }
  );

  const { data: productsData } = useListProducts(
    { shopId, limit: 3000 },
    { query: { enabled: !!shopId && engine === "free" } }
  );
  const products = useMemo(() => productsData?.products ?? [], [productsData]);

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setImage(ev.target?.result as string); setScanResult(null); setShowAllLines(false); };
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
      }
    );
  };

  const processFree = async () => {
    if (!image) return;
    setFreeLoading(true);
    try {
      toast.info("Loading OCR engine… (first use downloads ~4 MB)", { duration: 5000 });
      const { default: Tesseract } = await import("tesseract.js");
      const { data: { text } } = await (Tesseract as any).recognize(image, "eng", {
        logger: () => {},
      });
      const result = buildFreeResult(text, products);
      setScanResult(result);
      toast.success(`Free OCR found ${result.totalDetected} items`);
    } catch (err: any) {
      toast.error("Free OCR failed — " + (err?.message ?? "unknown error"));
    } finally {
      setFreeLoading(false);
    }
  };

  const isProcessing = ocrScan.isPending || freeLoading;
  const recentSessions = (sessions || []).slice(0, 8);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-bold font-display">Smart Scanner</h1>
          </div>
          {/* Privacy badge */}
          <div className="flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-2.5 py-1">
            <Lock className="h-3 w-3 text-emerald-500" />
            <span className="text-[10px] font-bold text-emerald-500">Images never stored</span>
          </div>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          Digitize supplier invoices and handwritten notebooks
        </p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">

          {/* ── Engine toggle ── */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => { setEngine("free"); setScanResult(null); }}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                engine === "free"
                  ? "border-primary bg-primary/8 ring-1 ring-primary/40"
                  : "border-border bg-muted/20 hover:bg-muted/40"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Cpu className={cn("h-4 w-4", engine === "free" ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-xs font-bold", engine === "free" ? "text-primary" : "text-foreground")}>
                  Free OCR
                </span>
                <Badge className="text-[9px] px-1.5 py-0 h-4 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-0">No key</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Runs on-device. Best for printed invoices.
              </p>
            </button>

            <button
              onClick={() => { setEngine("ai"); setScanResult(null); }}
              className={cn(
                "rounded-xl border p-3 text-left transition-all",
                engine === "ai"
                  ? "border-primary bg-primary/8 ring-1 ring-primary/40"
                  : "border-border bg-muted/20 hover:bg-muted/40"
              )}
            >
              <div className="flex items-center gap-2 mb-1">
                <Zap className={cn("h-4 w-4", engine === "ai" ? "text-primary" : "text-muted-foreground")} />
                <span className={cn("text-xs font-bold", engine === "ai" ? "text-primary" : "text-foreground")}>
                  AI Scanner
                </span>
                <Badge className="text-[9px] px-1.5 py-0 h-4 bg-amber-500/15 text-amber-600 dark:text-amber-400 border-0">Gemini</Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">
                Gemini Vision. Best for handwriting &amp; notebooks.
              </p>
            </button>
          </div>

          {/* Engine-specific notice */}
          {engine === "ai" && (
            <div className="flex items-start gap-3 bg-amber-500/8 border border-amber-500/20 rounded-xl px-3 py-2.5">
              <Zap className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Image is sent to <strong className="text-foreground">Google Gemini</strong> for analysis, then discarded. Requires{" "}
                <code className="font-mono bg-muted/60 px-1 py-0.5 rounded text-[10px]">GEMINI_API_KEY</code> worker secret.
              </p>
            </div>
          )}
          {engine === "free" && (
            <div className="flex items-start gap-3 bg-emerald-500/8 border border-emerald-500/20 rounded-xl px-3 py-2.5">
              <Cpu className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                OCR runs <strong className="text-foreground">entirely on this device</strong>. No internet needed after the first use. ~4 MB downloaded once, then cached.
              </p>
            </div>
          )}

          {/* Scan type toggle — only shown for AI mode */}
          {engine === "ai" && (
            <div className="flex gap-1 bg-muted/40 p-1 rounded-xl border border-border/60">
              {(["notebook", "invoice"] as const).map(type => (
                <button
                  key={type}
                  onClick={() => setScanType(type)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all capitalize flex items-center justify-center gap-1.5",
                    scanType === type
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <FileText className="h-3.5 w-3.5" />
                  {type === "notebook" ? "Notebook Scan" : "Invoice Scan"}
                </button>
              ))}
            </div>
          )}

          {/* Camera / Preview area */}
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
                  Tip: Clear photo in good lighting gives best results
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
                onClick={() => { setImage(null); setScanResult(null); }}
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
                  : <><Zap className="h-4 w-4 mr-2" />{ocrScan.isPending ? "Scanning…" : "AI Scan"}</>
                }
              </Button>
            </div>
          )}

          {/* Scan result */}
          {scanResult && (
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              {/* Summary */}
              <div className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span className="text-sm font-bold">
                      Scan Complete
                      <span className="text-[10px] font-normal text-muted-foreground ml-2">
                        via {scanResult.engine === "free" ? "Free OCR" : "Gemini AI"}
                      </span>
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="bg-emerald-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold text-emerald-400">{scanResult.confirmedCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Confirmed</p>
                  </div>
                  <div className="bg-orange-500/10 rounded-lg p-2">
                    <p className="text-lg font-bold text-orange-400">{scanResult.reviewCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Review</p>
                  </div>
                  <div className="bg-muted rounded-lg p-2">
                    <p className="text-lg font-bold text-muted-foreground">{scanResult.unresolvedCount}</p>
                    <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Unresolved</p>
                  </div>
                </div>
              </div>

              {/* Line items */}
              {scanResult.lines?.length > 0 && (
                <div className="border-t border-border/60">
                  {(showAllLines ? scanResult.lines : scanResult.lines.slice(0, 5)).map((line: any, i: number) => (
                    <div key={i} className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 last:border-0">
                      <div className="flex-1 min-w-0 pr-2">
                        <p className="text-xs font-medium truncate">{line.productName || line.rawText}</p>
                        {line.productName && line.rawText !== line.productName && (
                          <p className="text-[10px] text-muted-foreground/60 truncate">{line.rawText}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {line.qty > 1 && (
                          <span className="text-[10px] text-muted-foreground font-mono">×{line.qty}</span>
                        )}
                        <span className={cn(
                          "text-[9px] font-bold px-1.5 py-0.5 rounded-full",
                          line.status === "confirmed" ? "bg-emerald-500/15 text-emerald-400" :
                          line.status === "review" ? "bg-orange-500/15 text-orange-400" :
                          "bg-muted text-muted-foreground"
                        )}>
                          {line.status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {scanResult.lines.length > 5 && (
                    <button
                      onClick={() => setShowAllLines(v => !v)}
                      className="w-full py-2.5 text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 transition-colors"
                    >
                      {showAllLines ? <><ChevronUp className="h-3.5 w-3.5" />Show less</> : <><ChevronDown className="h-3.5 w-3.5" />Show all {scanResult.lines.length} lines</>}
                    </button>
                  )}
                </div>
              )}

              {/* Free OCR tip if low matches */}
              {scanResult.engine === "free" && scanResult.confirmedCount === 0 && (
                <div className="mx-4 mb-4 mt-1 rounded-lg bg-amber-500/10 border border-amber-400/20 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[11px] text-muted-foreground leading-snug">
                      No product matches found. Free OCR works best on <strong className="text-foreground">clear, printed text</strong>. For handwritten notebooks, try the <strong className="text-foreground">AI Scanner</strong> instead.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recent Scans */}
          {recentSessions.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Recent Scans</h2>
              <div className="space-y-2">
                {recentSessions.map((session: any) => (
                  <div key={session.id} className="flex items-center gap-3 bg-card border border-border/60 rounded-xl p-3">
                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                      <ScanLine className="h-4 w-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-foreground capitalize">
                        {session.scanType === "notebook" ? "Notebook" : "Invoice"} Scan
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {format(new Date(session.createdAt), "MMM d, h:mm a")}
                        {session.totalProducts > 0 && ` · ${session.totalProducts} items`}
                      </p>
                    </div>
                    <span className={cn(
                      "text-[9px] font-bold px-2 py-0.5 rounded-full",
                      session.status === "complete" || session.status === "applied"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : session.status === "processing"
                        ? "bg-orange-500/15 text-orange-400"
                        : "bg-muted text-muted-foreground"
                    )}>
                      {session.status === "applied" ? "Completed" : session.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
