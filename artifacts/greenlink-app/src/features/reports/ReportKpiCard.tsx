import type React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export function KpiCard({
  label,
  value,
  sub,
  icon: Icon,
  accentClass,
  isLoading,
  changePct,
}: {
  label: string;
  value?: string;
  sub?: string;
  icon: React.ElementType;
  accentClass: string;
  isLoading?: boolean;
  changePct?: number | null;
}) {
  const isHero = label === "Revenue";
  return (
    <Card className={cn("reports-kpi-card rounded-2xl border-border/80 bg-card/95 shadow-none", isHero && "reports-kpi-hero")}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2 mb-3">
          <div className={cn("w-9 h-9 rounded-xl border flex items-center justify-center shrink-0", accentClass)}>
            <Icon className="h-4 w-4" />
          </div>
          {changePct != null && (
            <span className={cn(
              "inline-flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums",
              changePct > 0 ? "bg-emerald-500/12 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25"
              : changePct < 0 ? "bg-destructive/12 text-destructive border border-destructive/25"
              : "bg-muted text-muted-foreground border border-border"
            )}>
              {changePct > 0 ? <ArrowUp className="h-2.5 w-2.5" /> : changePct < 0 ? <ArrowDown className="h-2.5 w-2.5" /> : <Minus className="h-2.5 w-2.5" />}
              {Math.abs(changePct).toFixed(1)}%
            </span>
          )}
        </div>
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
        {isLoading
          ? <Skeleton className="h-8 w-28 mt-1" />
          : <p className={cn("font-display text-2xl font-bold tracking-normal tabular-nums", isHero ? "text-primary" : "text-foreground")}>{value ?? "—"}</p>}
        {isLoading
          ? <Skeleton className="h-3.5 w-20 mt-2" />
          : sub && <p className="text-xs text-muted-foreground mt-1 truncate">{sub}</p>}
      </CardContent>
    </Card>
  );
}
