import { useState, useEffect } from "react";
import { formatQty, roundQty } from "@/lib/format";
import { cn } from "@/lib/utils";

// ── QtyTextInput (prevents 5.0000000 float noise & cursor jumps on decimals) ──
export function QtyTextInput({
  value,
  min,
  max,
  isDecimal,
  onChange,
  inputRef,
  className,
}: {
  value: number;
  min: number;
  max: number;
  isDecimal: boolean;
  onChange: (next: number) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [draft, setDraft] = useState(() => formatQty(value));

  useEffect(() => {
    if (!focused) {
      setDraft(formatQty(value));
    }
  }, [value, focused]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (isDecimal) {
      if (!/^\d*\.?\d{0,3}$/.test(raw)) return;
    } else {
      if (!/^\d*$/.test(raw)) return;
    }
    setDraft(raw);
    if (raw === "" || raw === ".") return;
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= min) {
      onChange(roundQty(Math.min(parsed, max)));
    }
  };

  const commitDraft = () => {
    setFocused(false);
    const parsed = Number(draft);
    if (!Number.isFinite(parsed) || parsed < min) {
      setDraft(formatQty(value));
      return;
    }
    const clamped = roundQty(Math.min(Math.max(min, parsed), max));
    onChange(clamped);
    setDraft(formatQty(clamped));
  };

  return (
    <input
      ref={inputRef}
      type="text"
      size={4}
      inputMode={isDecimal ? "decimal" : "numeric"}
      value={focused ? draft : formatQty(value)}
      onFocus={e => {
        setFocused(true);
        setDraft(formatQty(value));
        setTimeout(() => e.target.select(), 0);
      }}
      onBlur={commitDraft}
      onChange={handleChange}
      onKeyDown={e => {
        if (e.key === "Enter") {
          e.currentTarget.blur();
        }
      }}
      className={cn("min-w-0", className)}
    />
  );
}
