import { useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  Edit2,
  Eye,
  FileText,
  Loader2,
  MessageCircle,
  MoreVertical,
  Phone,
  ShoppingCart,
  Trash2,
} from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { KES, STATUS_META, type Quotation } from "@/lib/quotation-utils";
import { shareWhatsApp } from "@/lib/quotation-pdf";
import { StatusBadge } from "./StatusBadge";

export function QuotationCard({
  q,
  shop,
  onEdit,
  onPrint,
  onStatusChange,
  onDelete,
  onDownloadPdf,
  onConvertToSale,
  onInvoice,
  invoiceBusy,
}: {
  q: Quotation;
  shop: any;
  onEdit: () => void;
  onPrint: () => void;
  onStatusChange: (s: Quotation["status"]) => void;
  onDelete: () => void;
  onDownloadPdf: () => void;
  onConvertToSale: () => void;
  onInvoice: () => void;
  invoiceBusy: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const isOverdue =
    Boolean(q.validUntil) &&
    new Date(q.validUntil!) < new Date() &&
    q.status !== "expired" &&
    q.status !== "rejected" &&
    q.status !== "accepted";

  const stripeColor = q.invoiceNumber
    ? "border-l-emerald-500"
    : q.status === "accepted"
      ? "border-l-emerald-500"
      : q.status === "sent"
        ? "border-l-sky-500"
        : q.status === "rejected"
          ? "border-l-rose-500"
          : q.status === "expired"
            ? "border-l-amber-500"
            : "border-l-border";

  return (
    <article
      className={cn(
        "quotation-card group overflow-hidden rounded-2xl border border-border/80 border-l-4 bg-card transition-colors duration-150 hover:border-primary/40",
        stripeColor,
      )}
    >
      <div className="grid grid-cols-[minmax(0,1.65fr)_minmax(145px,.85fr)_auto] gap-x-5 gap-y-3 px-4 sm:px-5 py-4 max-xl:grid-cols-[minmax(0,1fr)_auto] max-xl:gap-x-3">
        {/* Identity & Metadata */}
        <div className="min-w-0">
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex items-center rounded-lg bg-primary/10 border border-primary/20 px-2 py-0.5 font-mono text-[11px] font-bold tracking-tight text-primary">
              {q.quoteNumber}
            </span>
            <StatusBadge status={q.status} />
            {q.invoiceNumber && (
              <span
                data-testid={`text-invoice-number-${q.id}`}
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/12 px-2.5 py-0.5 font-mono text-[10px] font-bold text-emerald-700 dark:text-emerald-400"
              >
                <FileText className="h-2.5 w-2.5" />
                {q.invoiceNumber}
              </span>
            )}
            {isOverdue && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/25 bg-amber-500/12 px-2 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
                <Clock className="h-2.5 w-2.5" />
                Past due
              </span>
            )}
          </div>

          <p className="truncate text-sm sm:text-[15px] font-bold tracking-tight text-foreground">
            {q.customerName}
          </p>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            {q.customerPhone && (
              <span className="inline-flex items-center gap-1 font-mono">
                <Phone className="h-3 w-3 opacity-70" />
                {q.customerPhone}
              </span>
            )}
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3 opacity-70" />
              {format(new Date(q.createdAt), "dd MMM yyyy")}
            </span>
            {q.validUntil && (
              <span
                className={cn(
                  isOverdue &&
                    "text-amber-700 dark:text-amber-400 font-semibold",
                )}
              >
                Valid till {format(new Date(q.validUntil), "dd MMM yyyy")}
              </span>
            )}
          </div>

          {q.notes && (
            <p className="mt-1.5 truncate text-[11px] italic text-muted-foreground/90 max-w-xl">
              &ldquo;{q.notes}&rdquo;
            </p>
          )}
        </div>

        {/* Financial Total */}
        <div className="flex flex-col justify-center border-l border-border/70 pl-5 max-xl:col-start-2 max-xl:row-start-1 max-xl:border-0 max-xl:pl-0 max-xl:text-right">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Quote Total
          </span>
          <span className="mt-1 font-mono text-base sm:text-lg font-bold tracking-tight text-foreground tabular-nums">
            {KES(q.total)}
          </span>
          <span className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
            {q.items.length} item{q.items.length !== 1 ? "s" : ""}
            {q.discountAmount > 0 && (
              <span className="text-rose-600 dark:text-rose-400 font-medium">
                {" "}
                · −{KES(q.discountAmount)}
              </span>
            )}
          </span>
        </div>

        {/* Actions */}
        <div className="flex flex-wrap items-center justify-end gap-1.5 border-l border-border/70 pl-4 max-xl:col-span-2 max-xl:justify-between max-xl:border-0 max-xl:border-t max-xl:border-border/60 max-xl:pt-3 max-xl:pl-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={onConvertToSale}
              title="Load items into POS cart"
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-primary/30 bg-primary/10 px-3 text-[11px] font-bold text-primary transition-colors hover:bg-primary/20"
            >
              <ShoppingCart className="h-3.5 w-3.5" /> Sell
            </button>
            <button
              type="button"
              data-testid={`button-invoice-${q.id}`}
              onClick={onInvoice}
              disabled={invoiceBusy}
              title={
                q.invoiceNumber
                  ? "Download issued invoice"
                  : q.status === "accepted"
                    ? "Issue an invoice from this accepted quotation"
                    : "Accept this quotation and issue its invoice"
              }
              className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 text-[11px] font-bold text-emerald-700 dark:text-emerald-400 transition-colors hover:bg-emerald-500/18 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {invoiceBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <FileText className="h-3.5 w-3.5" />
              )}
              {invoiceBusy
                ? "Issuing…"
                : q.invoiceNumber
                  ? "Invoice PDF"
                  : q.status === "accepted"
                    ? "Make invoice"
                    : "Accept & invoice"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((value) => !value)}
              aria-expanded={expanded}
              className="inline-flex h-8 items-center gap-1 rounded-xl border border-border/70 bg-muted/40 px-2.5 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted"
            >
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
              {expanded ? "Hide" : `Items (${q.items.length})`}
            </button>
          </div>

          <div className="flex items-center gap-1 rounded-xl border border-border/60 bg-muted/25 p-0.5">
            <button
              type="button"
              onClick={() =>
                shareWhatsApp(q, shop, q.invoiceNumber ? "invoice" : "quotation")
              }
              className="flex h-7 w-7 items-center justify-center rounded-lg text-emerald-600 dark:text-[#25D366] transition-colors hover:bg-emerald-500/12"
              title={
                q.invoiceNumber
                  ? "Share invoice via WhatsApp"
                  : "Share quotation via WhatsApp"
              }
              aria-label={
                q.invoiceNumber
                  ? "Share invoice via WhatsApp"
                  : "Share quotation via WhatsApp"
              }
            >
              <MessageCircle className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onDownloadPdf}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-primary"
              title="Download Quote PDF"
              aria-label="Download PDF"
            >
              <Download className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onPrint}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              title="Print / Full Preview"
              aria-label="Preview quotation"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onEdit}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-primary/12 hover:text-primary"
              title={
                q.invoiceNumber
                  ? "Edit quotation (issued invoice stays archived)"
                  : "Edit quotation"
              }
              aria-label="Edit quotation"
              data-testid={`button-edit-quotation-${q.id}`}
            >
              <Edit2 className="h-3.5 w-3.5" />
            </button>
            {!q.invoiceNumber && (
              <>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setMenuOpen((value) => !value)}
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-lg transition-colors",
                      menuOpen
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                    title="Change status"
                    aria-label="Change quotation status"
                    aria-expanded={menuOpen}
                  >
                    <MoreVertical className="h-3.5 w-3.5" />
                  </button>
                  {menuOpen && (
                    <>
                      <div
                        className="fixed inset-0 z-30"
                        onClick={() => setMenuOpen(false)}
                      />
                      <div className="absolute right-0 top-full z-40 mt-1.5 w-48 overflow-hidden rounded-2xl border border-border bg-card py-1.5 shadow-2xl">
                        <p className="border-b border-border/60 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                          Update status
                        </p>
                        {(
                          [
                            "draft",
                            "sent",
                            "accepted",
                            "rejected",
                            "expired",
                          ] as const
                        )
                          .filter((status) => status !== q.status)
                          .map((status) => (
                            <button
                              key={status}
                              type="button"
                              onClick={() => {
                                onStatusChange(status);
                                setMenuOpen(false);
                              }}
                              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-foreground transition-colors hover:bg-muted"
                            >
                              <span
                                className={cn(
                                  "h-2 w-2 rounded-full",
                                  STATUS_META[status].dot,
                                )}
                              />
                              Mark as {STATUS_META[status].label}
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  onClick={onDelete}
                  className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/12 hover:text-rose-600 dark:hover:text-rose-400"
                  title="Delete quotation"
                  aria-label="Delete quotation"
                  data-testid={`button-delete-quotation-${q.id}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border/70 bg-muted/20">
          <div className="grid grid-cols-[minmax(0,1fr)_58px_112px_112px] gap-3 border-b border-border/60 px-4 sm:px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground max-sm:grid-cols-[minmax(0,1fr)_48px_90px]">
            <span>Product</span>
            <span className="text-right">Qty</span>
            <span className="text-right max-sm:hidden">Unit Price</span>
            <span className="text-right">Line Total</span>
          </div>
          {q.items.map((item, index) => (
            <div
              key={`${q.id}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_58px_112px_112px] items-center gap-3 border-b border-border/45 px-4 sm:px-5 py-2.5 last:border-0 max-sm:grid-cols-[minmax(0,1fr)_48px_90px]"
            >
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-foreground">
                  {item.productName}
                </p>
                <p className="text-[10px] text-muted-foreground">{item.unit}</p>
              </div>
              <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                {item.qty}
              </span>
              <span className="text-right font-mono text-xs text-muted-foreground max-sm:hidden tabular-nums">
                {KES(item.unitPrice)}
              </span>
              <span className="text-right font-mono text-xs font-semibold text-foreground tabular-nums">
                {KES(item.total)}
              </span>
            </div>
          ))}
          {q.discountAmount > 0 && (
            <div className="flex justify-between border-t border-border/50 px-4 sm:px-5 py-2 text-xs">
              <span className="text-muted-foreground">Discount applied</span>
              <span className="font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums">
                −{KES(q.discountAmount)}
              </span>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-primary/20 bg-primary/8 px-4 sm:px-5 py-2.5">
            <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
              Quote Total
            </span>
            <span className="font-mono text-sm font-bold text-primary tabular-nums">
              {KES(q.total)}
            </span>
          </div>
        </div>
      )}
    </article>
  );
}
