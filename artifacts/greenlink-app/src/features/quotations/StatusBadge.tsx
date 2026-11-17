import { cn } from "@/lib/utils";
import { STATUS_META, type Quotation } from "@/lib/quotation-utils";

export function StatusBadge({ status }: { status: Quotation["status"] }) {
  const m = STATUS_META[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide px-2.5 py-0.5 rounded-full border",
        m.color,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full shrink-0", m.dot)} />
      {m.label}
    </span>
  );
}
