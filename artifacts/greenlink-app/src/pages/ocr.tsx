import { useState } from "react";
import { useOcrScan, useListScanSessions } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Camera, Upload, ScanLine, FileText, CheckCircle2, Image, Zap } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

export default function OCR() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const [image, setImage] = useState<string | null>(null);
  const [scanType, setScanType] = useState<"notebook" | "invoice">("notebook");
  const [scanResult, setScanResult] = useState<any>(null);
  const ocrScan = useOcrScan();

  const { data: sessions, refetch: refetchSessions } = useListScanSessions(
    { shopId },
    { query: { enabled: !!shopId } }
  );

  const handleCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { setImage(ev.target?.result as string); setScanResult(null); };
    reader.readAsDataURL(file);
  };

  const processImage = () => {
    if (!image) return;
    ocrScan.mutate(
      { data: { shopId, imageBase64: image.split(",")[1], scanType } },
      {
        onSuccess: (data) => {
          setScanResult(data);
          toast.success(`Detected ${data.totalDetected} items`);
          refetchSessions();
        },
        onError: () => toast.error("Failed to process document. Please try again."),
      }
    );
  };

  const recentSessions = (sessions || []).slice(0, 8);

  return (
    <div className="flex flex-col h-full min-h-0 bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center gap-2">
          <ScanLine className="h-5 w-5 text-primary" />
          <h1 className="text-lg font-bold font-display">OCR Scanner</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">Digitize handwritten notebooks and supplier invoices</p>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* GEMINI_API_KEY notice */}
          <div className="flex items-start gap-3 bg-orange-500/10 border border-orange-500/20 rounded-xl px-3 py-3">
            <div className="w-5 h-5 rounded-full bg-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
              <Zap className="h-3 w-3 text-orange-400" />
            </div>
            <div>
              <p className="text-xs font-bold text-orange-400">AI Scanner Setup Required</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                Add <code className="font-mono bg-muted/60 px-1 py-0.5 rounded text-[10px]">GEMINI_API_KEY = "your-key"</code> to{" "}
                <code className="font-mono bg-muted/60 px-1 py-0.5 rounded text-[10px]">artifacts/api-server/wrangler.toml</code>{" "}
                under <code className="font-mono bg-muted/60 px-1 py-0.5 rounded text-[10px]">[vars]</code> to enable OCR scanning.
              </p>
            </div>
          </div>

          {/* Scan type toggle */}
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
                {type === "notebook" ? <FileText className="h-3.5 w-3.5" /> : <FileText className="h-3.5 w-3.5" />}
                {type === "notebook" ? "Notebook Scan" : "Invoice Scan"}
              </button>
            ))}
          </div>

          {/* Camera / Preview area */}
          <div className="relative bg-muted/30 border border-border/60 rounded-2xl overflow-hidden aspect-[4/3] flex items-center justify-center">
            {image ? (
              <>
                <img
                  src={image}
                  alt="Document to scan"
                  className="w-full h-full object-contain"
                />
                {ocrScan.isPending && (
                  <div className="absolute inset-0 bg-background/90 flex flex-col items-center justify-center gap-3">
                    <ScanLine className="h-8 w-8 text-primary animate-pulse" />
                    <p className="text-sm font-bold">Analyzing document…</p>
                    <p className="text-xs text-muted-foreground">Extracting products and quantities</p>
                  </div>
                )}
                {/* Corner markers */}
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
                <p className="text-xs font-medium text-center">
                  Tap Camera or Gallery below to capture your document
                </p>
                <p className="text-[10px] text-muted-foreground/60 text-center">
                  Tip: Take clear photo in good lighting
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
                disabled={ocrScan.isPending}
              >
                Retake
              </Button>
              <Button
                className="h-12 font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={processImage}
                disabled={ocrScan.isPending}
              >
                <Zap className="h-4 w-4 mr-2" />
                {ocrScan.isPending ? "Scanning…" : "Scan Now"}
              </Button>
            </div>
          )}

          {/* Scan result summary */}
          {scanResult && (
            <div className="bg-card border border-border rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                <span className="text-sm font-bold">Scan Complete</span>
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
              {scanResult.lines?.slice(0, 3).map((line: any, i: number) => (
                <div key={i} className="text-xs flex items-center justify-between py-1 border-t border-border/40">
                  <span className="text-foreground font-medium truncate flex-1">{line.productName || line.rawText}</span>
                  <span className={cn(
                    "text-[9px] font-bold px-1.5 py-0.5 rounded-full ml-2",
                    line.status === "confirmed" ? "bg-emerald-500/15 text-emerald-400" :
                    line.status === "review" ? "bg-orange-500/15 text-orange-400" :
                    "bg-muted text-muted-foreground"
                  )}>
                    {line.status}
                  </span>
                </div>
              ))}
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
