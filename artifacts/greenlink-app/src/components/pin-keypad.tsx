import { useEffect } from "react";
import { Delete, ArrowRight, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PinKeypadProps {
  pin: string;
  onChange: (pin: string) => void;
  onSubmit: () => void;
  loading?: boolean;
  disableKeyboard?: boolean;
}

export default function PinKeypad({
  pin,
  onChange,
  onSubmit,
  loading = false,
  disableKeyboard = false,
}: PinKeypadProps) {
  const handlePress = (num: number) => {
    if (loading || pin.length >= 6) return;
    onChange(pin + num);
  };

  const handleBackspace = () => {
    if (loading || pin.length === 0) return;
    onChange(pin.slice(0, -1));
  };

  // Support physical numeric keyboard entry on counter PCs
  useEffect(() => {
    if (disableKeyboard) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (loading) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        if (pin.length < 6) onChange(pin + e.key);
      } else if (e.key === "Backspace") {
        e.preventDefault();
        if (pin.length > 0) onChange(pin.slice(0, -1));
      } else if (e.key === "Enter" && pin.length >= 4) {
        e.preventDefault();
        onSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pin, loading, disableKeyboard, onChange, onSubmit]);

  const canSubmit = !loading && pin.length >= 4;

  return (
    <div className="w-full max-w-[300px] mx-auto select-none">
      {/* PIN display bar */}
      <div className="mb-3.5 rounded-2xl border border-border/80 bg-muted/40 px-3.5 py-2.5">
        <div className="flex items-center justify-center gap-2.5">
          {[...Array(6)].map((_, i) => {
            const filled = i < pin.length;
            const isNext = i === pin.length;
            return (
              <div
                key={i}
                className={cn(
                  "flex items-center justify-center w-7 h-7 rounded-xl border transition-all duration-150",
                  filled
                    ? "bg-primary/15 border-primary/60 shadow-[0_0_12px_hsl(var(--primary)/0.25)]"
                    : isNext
                    ? "bg-background/80 border-primary/40 ring-2 ring-primary/15"
                    : "bg-background/40 border-border/60"
                )}
              >
                <span
                  className={cn(
                    "rounded-full transition-all duration-150",
                    filled
                      ? "w-2 h-2 bg-primary scale-100"
                      : "w-1.5 h-1.5 bg-muted-foreground/25 scale-90"
                  )}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-center text-[11px] font-medium text-muted-foreground">
          {pin.length === 0
            ? "Enter 4–6 digit PIN (tap or type)"
            : pin.length < 4
            ? `${4 - pin.length} more digit${4 - pin.length === 1 ? "" : "s"} required`
            : "Ready — tap Go or press Enter"}
        </p>
      </div>

      {/* Tactile keypad grid */}
      <div className="grid grid-cols-3 gap-2">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
          <button
            key={num}
            type="button"
            onClick={() => handlePress(num)}
            disabled={loading}
            className={cn(
              "h-12 rounded-2xl border border-border/90 bg-card text-foreground font-mono text-lg font-bold",
              "shadow-[0_2px_0_0_hsl(var(--border))] hover:bg-muted/70 hover:border-primary/35",
              "active:translate-y-[1px] active:shadow-none active:bg-primary/10 transition-all duration-100",
              "disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
            )}
          >
            {num}
          </button>
        ))}

        <button
          type="button"
          onClick={handleBackspace}
          disabled={loading || pin.length === 0}
          aria-label="Backspace"
          className={cn(
            "h-12 rounded-2xl border border-border/70 bg-muted/40 text-muted-foreground flex items-center justify-center",
            "hover:text-destructive hover:border-destructive/40 hover:bg-destructive/10",
            "active:scale-[0.97] transition-all duration-100",
            "disabled:opacity-35 disabled:pointer-events-none cursor-pointer"
          )}
        >
          <Delete className="h-5 w-5" />
        </button>

        <button
          type="button"
          onClick={() => handlePress(0)}
          disabled={loading}
          className={cn(
            "h-12 rounded-2xl border border-border/90 bg-card text-foreground font-mono text-lg font-bold",
            "shadow-[0_2px_0_0_hsl(var(--border))] hover:bg-muted/70 hover:border-primary/35",
            "active:translate-y-[1px] active:shadow-none active:bg-primary/10 transition-all duration-100",
            "disabled:opacity-50 disabled:pointer-events-none cursor-pointer"
          )}
        >
          0
        </button>

        <button
          type="button"
          onClick={onSubmit}
          disabled={!canSubmit}
          aria-label="Unlock terminal"
          className={cn(
            "h-12 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 transition-all duration-150 cursor-pointer",
            canSubmit
              ? "bg-primary text-primary-foreground shadow-[0_4px_16px_hsl(var(--primary)/0.3)] hover:brightness-105 active:scale-[0.97]"
              : "bg-muted text-muted-foreground/50 border border-border/60 cursor-not-allowed"
          )}
        >
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <span>Go</span>
              <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
