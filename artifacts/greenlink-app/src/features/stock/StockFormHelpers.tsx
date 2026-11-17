import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Package, Scale, Zap, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIES, getCategoryStyle } from "@/lib/product-utils";

export function CategoryPicker({
  value,
  onChange,
  autoDetected,
}: {
  value: string;
  onChange: (v: string) => void;
  autoDetected?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const isPreset = CATEGORIES.includes(value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex h-9 w-full items-center justify-between rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          value ? "text-foreground" : "text-muted-foreground"
        )}
      >
        <span className="flex items-center gap-2">
          {value ? (
            <>
              {isPreset && (
                <span className={cn("w-2 h-2 rounded-full shrink-0", getCategoryStyle(value).text.replace("text-", "bg-"))} />
              )}
              <span>{value}</span>
              {autoDetected && !isPreset && (
                <span className="text-[10px] text-primary font-semibold">Auto-inferred</span>
              )}
              {autoDetected && isPreset && (
                <span className="text-[10px] text-primary/70">Auto-inferred</span>
              )}
            </>
          ) : (
            "Select or type a category…"
          )}
        </span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-border/60 bg-popover shadow-xl p-3 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map(cat => {
              const s = getCategoryStyle(cat);
              const active = value === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => { onChange(active ? "" : cat); setOpen(false); }}
                  className={cn(
                    "px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all",
                    active
                      ? `${s.bg} ${s.text} ${s.border} ring-1 ring-current/30`
                      : "bg-muted/50 text-muted-foreground border-border/40 hover:bg-muted"
                  )}
                >
                  {cat}
                </button>
              );
            })}
          </div>
          <div className="border-t border-border/40 pt-2.5 flex gap-2">
            <input
              type="text"
              value={custom}
              onChange={e => setCustom(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && custom.trim()) { onChange(custom.trim()); setCustom(""); setOpen(false); } }}
              placeholder="Custom category…"
              className="flex-1 h-8 rounded-lg border border-border/50 bg-muted/30 px-3 text-xs focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/20"
            />
            <button
              type="button"
              disabled={!custom.trim()}
              onClick={() => { if (custom.trim()) { onChange(custom.trim()); setCustom(""); setOpen(false); } }}
              className="h-8 px-3 rounded-lg bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-40 transition-opacity"
            >
              Set
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function BagCalculator({
  unit,
  setBuyPrice,
  setSellPrice,
}: {
  unit: string;
  setBuyPrice: (v: string) => void;
  setSellPrice: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [bagSize, setBagSize] = useState("");
  const [bagBuy, setBagBuy] = useState("");
  const [bagSell, setBagSell] = useState("");

  const perUnitBuy = bagSize && bagBuy && parseFloat(bagSize) > 0
    ? (parseFloat(bagBuy) / parseFloat(bagSize)).toFixed(2) : null;
  const perUnitSell = bagSize && bagSell && parseFloat(bagSize) > 0
    ? (parseFloat(bagSell) / parseFloat(bagSize)).toFixed(2) : null;

  return (
    <div className="col-span-full">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
      >
        <Zap className="h-3.5 w-3.5" />
        {open ? "Hide" : "Use"} Bag Price Calculator
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="mt-2 border border-primary/20 bg-primary/5 rounded-xl p-3 space-y-3">
          <p className="text-[11px] text-muted-foreground">
            Enter your bag size and buy/sell price — we&apos;ll calculate the price per <strong>{unit}</strong> for you.
          </p>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bag size ({unit})</Label>
              <Input type="number" value={bagSize} onChange={e => setBagSize(e.target.value)} placeholder="e.g. 50" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bag buy (KES)</Label>
              <Input type="number" value={bagBuy} onChange={e => setBagBuy(e.target.value)} placeholder="6000" className="h-8 text-sm" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Bag sell (KES)</Label>
              <Input type="number" value={bagSell} onChange={e => setBagSell(e.target.value)} placeholder="7200" className="h-8 text-sm" />
            </div>
          </div>
          {(perUnitBuy || perUnitSell) && (
            <div className="bg-background border border-border rounded-lg px-3 py-2 space-y-1">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-bold">Per {unit} price:</p>
              <div className="flex items-center gap-4 flex-wrap">
                {perUnitBuy && <span className="text-xs font-mono font-bold text-blue-400">Buy: KES {perUnitBuy}/{unit}</span>}
                {perUnitSell && <span className="text-xs font-mono font-bold text-emerald-500">Sell: KES {perUnitSell}/{unit}</span>}
              </div>
              <Button
                size="sm"
                className="mt-1.5 h-7 text-xs w-full"
                onClick={() => {
                  if (perUnitBuy) setBuyPrice(perUnitBuy);
                  if (perUnitSell) setSellPrice(perUnitSell);
                  setOpen(false);
                }}
              >
                Apply prices
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function WeightPresets({ unit, onSelect }: { unit: string; onSelect: (v: number) => void }) {
  const u = unit.toLowerCase().trim();
  const presets = u === "g" || u === "gram" || u === "grams"
    ? [100, 250, 500, 1000]
    : u === "ml"
    ? [250, 500, 1000]
    : [0.5, 1, 2, 5, 10, 25, 50];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {presets.map(p => (
        <button
          key={p}
          type="button"
          onClick={() => onSelect(p)}
          className="text-xs font-semibold px-2.5 py-1 rounded-full bg-muted text-muted-foreground hover:bg-muted/70 border border-border transition-colors"
        >
          {p}{unit}
        </button>
      ))}
    </div>
  );
}

export const PRODUCT_UNIT_PRESETS = ["bag", "kg", "g", "litre", "ml", "sachet", "unit", "bottle", "pack", "box", "tin"];

export function ProductTypeAndUnitSection({
  productType,
  unit,
  onTypeChange,
  onUnitChange,
}: {
  productType: "normal" | "measured";
  unit: string;
  onTypeChange: (nextType: "normal" | "measured") => void;
  onUnitChange: (nextUnit: string) => void;
}) {
  return (
    <div className="rounded-2xl border border-border/80 bg-muted/20 p-3.5 space-y-3">
      <div className="space-y-2">
        <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground block">
          Measurement &amp; Packaging
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onTypeChange("normal")}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer",
              productType === "normal"
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-background border-border/80 text-muted-foreground hover:border-primary/45 hover:text-foreground"
            )}
          >
            <Package className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold leading-tight">Whole Units</p>
              <p className="text-[10px] opacity-80 leading-tight mt-0.5">Pieces, bags, packs</p>
            </div>
          </button>
          <button
            type="button"
            onClick={() => {
              onTypeChange("measured");
              if (!["kg", "g", "litre", "ml", "l"].includes(unit.toLowerCase())) onUnitChange("kg");
            }}
            className={cn(
              "flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all cursor-pointer",
              productType === "measured"
                ? "bg-primary text-primary-foreground border-primary shadow-xs"
                : "bg-background border-border/80 text-muted-foreground hover:border-primary/45 hover:text-foreground"
            )}
          >
            <Scale className="h-4 w-4 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-bold leading-tight">Measured</p>
              <p className="text-[10px] opacity-80 leading-tight mt-0.5">Decimal qty (kg, L, g)</p>
            </div>
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <Label className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Unit Label</Label>
          <Input
            value={unit}
            onChange={e => onUnitChange(e.target.value)}
            placeholder="bag, kg, litre…"
            className="h-8 w-36 rounded-lg bg-background text-xs font-mono font-semibold text-right"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {PRODUCT_UNIT_PRESETS.map(u => (
            <button
              key={u}
              type="button"
              onClick={() => onUnitChange(u)}
              className={cn(
                "text-[11px] font-semibold px-2.5 py-1 rounded-full border transition-colors cursor-pointer",
                unit === u
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border/80 hover:border-primary/45 hover:text-foreground"
              )}
            >
              {u}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
