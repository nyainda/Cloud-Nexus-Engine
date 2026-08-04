import { useState, useEffect, useRef } from "react";
import { customFetch } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useDebounce } from "@/hooks/use-debounce";
import { User2, Phone, Star, AlertTriangle } from "lucide-react";
import { formatKES } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface CrmEntry {
  id: string | null;
  name: string;
  phone: string;
  email: string | null;
  registered: boolean;
  totalBalance: number;
  totalOwed: number;
  debtCount: number;
  activeCount: number;
}

export interface SelectedCustomer {
  name: string;
  phone: string;
  totalBalance: number;
  registered: boolean;
}

/** Normalize to Title Case with trim */
export function toTitleCase(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

interface Props {
  shopId: string;
  value: string;
  onChange: (v: string) => void;
  /** Called when user picks an existing customer from the dropdown */
  onSelect: (customer: SelectedCustomer) => void;
  placeholder?: string;
  className?: string;
  /** Show the selected customer's outstanding balance below the input */
  showBalanceWarning?: boolean;
  selectedBalance?: number;
}

export function CustomerAutocomplete({
  shopId,
  value,
  onChange,
  onSelect,
  placeholder = "e.g. John Kamau",
  className,
  showBalanceWarning = false,
  selectedBalance,
}: Props) {
  const [open, setOpen] = useState(false);
  const debouncedValue = useDebounce(value, 300);
  const ref = useRef<HTMLDivElement>(null);

  const { data: suggestions } = useQuery<CrmEntry[]>({
    queryKey: ["/api/crm", shopId, debouncedValue],
    queryFn: () =>
      customFetch<CrmEntry[]>(
        `/api/crm?shopId=${encodeURIComponent(shopId)}&q=${encodeURIComponent(debouncedValue)}`
      ),
    enabled: !!shopId && debouncedValue.length >= 2,
    staleTime: 60_000,
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const hasSuggestions = open && !!suggestions && suggestions.length > 0;

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Input */}
      <div className="relative">
        <User2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 pl-9 pr-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
        />
      </div>

      {/* Balance warning */}
      {showBalanceWarning && selectedBalance != null && selectedBalance > 0 && (
        <div className="flex items-center gap-1.5 mt-1.5 px-2 py-1.5 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
          <p className="text-[11px] font-semibold text-destructive">
            Already owes {formatKES(selectedBalance)} — confirm before adding more debt
          </p>
        </div>
      )}

      {/* Dropdown */}
      {hasSuggestions && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-xl overflow-hidden max-h-56 overflow-y-auto">
          {suggestions!.map((s, i) => (
            <button
              key={s.id ?? `u-${i}`}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect({
                  name: s.name,
                  phone: s.phone || "",
                  totalBalance: s.totalBalance,
                  registered: s.registered,
                });
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-muted/60 transition-colors flex items-center gap-2.5 border-b border-border/30 last:border-0"
            >
              {/* Avatar */}
              <div
                className={cn(
                  "w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-xs font-bold",
                  s.totalBalance > 0
                    ? "bg-destructive/15 text-destructive"
                    : "bg-primary/10 text-primary"
                )}
              >
                {s.name.charAt(0).toUpperCase()}
              </div>

              {/* Name + phone */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold truncate">{s.name}</p>
                  {s.registered && (
                    <Star className="h-2.5 w-2.5 text-primary fill-primary shrink-0" />
                  )}
                </div>
                {s.phone && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone className="h-2.5 w-2.5" />
                    {s.phone}
                  </p>
                )}
              </div>

              {/* Outstanding badge */}
              {s.totalBalance > 0 && (
                <span className="text-[9px] font-bold font-mono text-destructive bg-destructive/10 border border-destructive/20 px-1.5 py-0.5 rounded-full shrink-0 whitespace-nowrap">
                  {formatKES(s.totalBalance)} owed
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
