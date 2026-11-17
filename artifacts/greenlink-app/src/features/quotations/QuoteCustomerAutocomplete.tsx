import { useState, useMemo, useRef, useEffect } from "react";
import { customFetch } from "@workspace/api-client-react";
import { User } from "lucide-react";

export function QuoteCustomerAutocomplete({
  value,
  onChange,
  shopId,
  placeholder,
}: {
  value: string;
  onChange: (v: string, phone?: string) => void;
  shopId: string;
  placeholder?: string;
}) {
  const [customers, setCustomers] = useState<
    Array<{ customer_name: string; customer_phone: string }>
  >([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    customFetch(`/api/quotation-customers?shopId=${shopId}`)
      .then((d: any) => setCustomers(Array.isArray(d) ? d : []))
      .catch(() => {});
  }, [shopId]);

  useEffect(() => {
    const fn = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, []);

  const matches = useMemo(() => {
    const q = value.trim().toLowerCase();
    if (!q) return customers.slice(0, 8);
    return customers
      .filter((c) => c.customer_name.toLowerCase().includes(q))
      .slice(0, 8);
  }, [customers, value]);

  return (
    <div ref={ref} className="relative">
      <div className="relative">
        <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/40 pointer-events-none" />
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder ?? "Search or type customer name"}
          className="w-full h-10 pl-9 pr-3 bg-muted/40 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/30 focus:border-primary/40"
        />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-1 bg-card border border-border rounded-xl shadow-2xl z-50 overflow-hidden">
          {matches.map((c, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => {
                onChange(c.customer_name, c.customer_phone);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/60 flex items-center gap-2 border-b border-border/30 last:border-0"
            >
              <User className="h-3 w-3 text-muted-foreground/40 shrink-0" />
              <span className="font-semibold text-foreground">
                {c.customer_name}
              </span>
              {c.customer_phone && (
                <span className="text-xs text-muted-foreground/50 ml-auto font-mono">
                  {c.customer_phone}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
