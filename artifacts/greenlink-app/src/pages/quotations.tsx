import { useState, useMemo, useRef, useCallback } from "react";
import { useListProducts } from "@workspace/api-client-react";
import { formatKES } from "@/lib/format";
import { format, addDays } from "date-fns";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Plus, Search, X, Printer, Trash2, FileText, Receipt,
  ChevronLeft, CheckCircle2, Clock, Send, XCircle,
  Edit3, Package, Phone, MapPin, User, Calendar,
  StickyNote, Tag, ChevronDown, Loader2, ArrowRight, Share2, MessageCircle,
  Leaf, Building2, Mail, Globe,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const shopId = () => localStorage.getItem("greenlink_shopId") || "";
const shopName = () => localStorage.getItem("greenlink_shopName") || "Shop";

// ── API base + auth ─────────────────────────────────────────────────────────────
// Works locally (relative → Vite proxy → localhost:8080) and on Vercel
// (absolute → CF Worker via VITE_API_BASE_URL).
const API = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/+$/, "");
const authHeaders = () => ({
  "Content-Type": "application/json",
  Authorization: `Bearer ${localStorage.getItem("greenlink_token") ?? ""}`,
});

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, { ...init, headers: authHeaders() });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
  return data as T;
}

// ── Types ──────────────────────────────────────────────────────────────────────
interface QuoteItem {
  id?: string;
  productId?: string;
  productName: string;
  unit: string;
  unitPrice: number;
  qty: number;
  total: number;
}

interface Quotation {
  id: string;
  shop_id: string;
  quote_number: string;
  type: "quotation" | "invoice";
  customer_name: string;
  customer_phone: string;
  customer_address: string;
  status: string;
  valid_until: string | null;
  notes: string | null;
  subtotal: number;
  discount: number;
  total: number;
  created_by: string;
  created_at: string;
  updated_at: string;
  items?: QuoteItem[];
}

// ── API helpers ────────────────────────────────────────────────────────────────
const fetchQuotations = (type?: string): Promise<Quotation[]> => {
  const params = new URLSearchParams({ shopId: shopId() });
  if (type) params.set("type", type);
  return apiFetch<Quotation[]>(`/api/quotations?${params}`);
};

const fetchQuotation = (id: string): Promise<Quotation> =>
  apiFetch<Quotation>(`/api/quotations/${id}`);

const createQuotation = (data: any): Promise<Quotation> =>
  apiFetch<Quotation>("/api/quotations", {
    method: "POST",
    body: JSON.stringify({ ...data, shopId: shopId() }),
  });

const updateQuotation = (id: string, data: any): Promise<Quotation> =>
  apiFetch<Quotation>(`/api/quotations/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });

const deleteQuotation = (id: string): Promise<void> =>
  apiFetch<void>(`/api/quotations/${id}`, { method: "DELETE" });

// ── Status badge ───────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; className: string; icon: React.ElementType }> = {
    draft:    { label: "Draft",    className: "bg-muted/60 text-muted-foreground border-border", icon: Edit3 },
    sent:     { label: "Sent",     className: "bg-blue-500/10 text-blue-400 border-blue-500/20", icon: Send },
    accepted: { label: "Accepted", className: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20", icon: CheckCircle2 },
    declined: { label: "Declined", className: "bg-destructive/10 text-destructive border-destructive/20", icon: XCircle },
    expired:  { label: "Expired",  className: "bg-orange-500/10 text-orange-400 border-orange-500/20", icon: Clock },
    paid:     { label: "Paid",     className: "bg-primary/10 text-primary border-primary/20", icon: CheckCircle2 },
  };
  const c = cfg[status] ?? cfg.draft;
  const Icon = c.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border", c.className)}>
      <Icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

// ── Convert to Invoice dialog ───────────────────────────────────────────────────
function ConvertToInvoiceDialog({
  quotation,
  onConverted,
}: {
  quotation: Quotation;
  onConverted: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [markAccepted, setMarkAccepted] = useState(true);
  const qc = useQueryClient();

  const convertMutation = useMutation({
    mutationFn: async () => {
      const invoice = await createQuotation({
        shopId: quotation.shop_id,
        type: "invoice",
        customerName: quotation.customer_name,
        customerPhone: quotation.customer_phone,
        customerAddress: quotation.customer_address,
        notes: quotation.notes ?? undefined,
        discount: quotation.discount,
        items: (quotation.items ?? []).map(i => ({
          productId: i.productId,
          productName: i.productName,
          unit: i.unit,
          unitPrice: i.unitPrice,
          qty: i.qty,
        })),
      });
      if (markAccepted) await updateQuotation(quotation.id, { status: "accepted" });
      return invoice;
    },
    onSuccess: (invoice) => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success(`Invoice ${invoice.quote_number} created!`);
      setOpen(false);
      onConverted(invoice.id);
    },
    onError: () => toast.error("Conversion failed — try again"),
  });

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); }}>
      <DialogTrigger asChild>
        <button className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all active:scale-[0.98] shadow-md shadow-primary/15">
          <Receipt className="h-4 w-4" />
          Convert to Invoice
          <ArrowRight className="h-3.5 w-3.5 opacity-60" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden border-border">
        <DialogHeader className="sr-only"><DialogTitle>Convert to Invoice</DialogTitle></DialogHeader>

        {/* Visual transform header */}
        <div className="px-6 pt-6 pb-5 border-b border-border/60 bg-gradient-to-br from-card to-muted/10">
          <div className="flex items-center gap-3 mb-5">
            {/* Source card */}
            <div className="flex-1 rounded-xl border border-border bg-muted/40 p-3.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">From</p>
              <FileText className="h-6 w-6 text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-[10px] font-bold font-mono text-foreground">{quotation.quote_number}</p>
              <p className="text-[9px] text-muted-foreground/40 mt-0.5">Quotation</p>
            </div>
            {/* Arrow */}
            <div className="w-9 h-9 rounded-full bg-primary/15 border border-primary/30 flex items-center justify-center shrink-0">
              <ArrowRight className="h-4 w-4 text-primary" />
            </div>
            {/* Destination card */}
            <div className="flex-1 rounded-xl border border-primary/30 bg-primary/8 p-3.5 text-center">
              <p className="text-[9px] font-bold uppercase tracking-widest text-primary/70 mb-2">To</p>
              <Receipt className="h-6 w-6 text-primary mx-auto mb-2" />
              <p className="text-[10px] font-bold font-mono text-primary">INV-####</p>
              <p className="text-[9px] text-primary/40 mt-0.5">Invoice</p>
            </div>
          </div>
          <p className="text-sm font-bold text-foreground">Convert to Invoice</p>
          <p className="text-[11px] text-muted-foreground/70 mt-1 leading-relaxed">
            A new invoice is created with all items and customer details copied across.
          </p>
        </div>

        {/* Details */}
        <div className="px-6 py-4 space-y-3">
          <div className="rounded-xl border border-border bg-muted/20 overflow-hidden divide-y divide-border/50">
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><User className="h-3 w-3" />Customer</span>
              <span className="font-semibold text-foreground truncate max-w-[150px]">{quotation.customer_name}</span>
            </div>
            <div className="flex items-center justify-between px-4 py-2.5 text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5"><Package className="h-3 w-3" />Items</span>
              <span className="font-semibold text-foreground">{quotation.items?.length ?? 0} line items</span>
            </div>
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Total</span>
              <span className="font-bold font-mono text-primary text-sm">{formatKES(quotation.total)}</span>
            </div>
          </div>

          {/* Toggle */}
          <button
            type="button"
            onClick={() => setMarkAccepted(m => !m)}
            className={cn(
              "w-full flex items-center gap-3 px-4 py-3 rounded-xl border transition-all text-left",
              markAccepted ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/20 border-border/50 hover:bg-muted/30"
            )}
          >
            <div className={cn(
              "w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all",
              markAccepted ? "bg-emerald-500 border-emerald-500" : "border-border/60 bg-transparent"
            )}>
              {markAccepted && <CheckCircle2 className="h-3 w-3 text-white" />}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">Mark quotation as Accepted</p>
              <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                Updates {quotation.quote_number} status automatically
              </p>
            </div>
          </button>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 flex gap-2.5">
          <button
            onClick={() => setOpen(false)}
            className="h-11 px-5 rounded-xl bg-muted text-muted-foreground text-sm font-semibold hover:bg-muted/70 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => convertMutation.mutate()}
            disabled={convertMutation.isPending}
            className="flex-1 h-11 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2 shadow-md shadow-primary/15"
          >
            {convertMutation.isPending
              ? <><Loader2 className="h-4 w-4 animate-spin" />Creating…</>
              : <><Receipt className="h-4 w-4" />Create Invoice</>
            }
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Print view ─────────────────────────────────────────────────────────────────
function printQuotation(q: Quotation) {
  const shop = shopName();
  const docType = q.type === "invoice" ? "INVOICE" : "QUOTATION";
  const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${docType} ${q.quote_number}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Arial', sans-serif; font-size: 13px; color: #111; background: #fff; padding: 32px; max-width: 700px; margin: 0 auto; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; border-bottom: 3px solid #C8FF00; padding-bottom: 20px; }
  .shop-name { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; }
  .doc-type { font-size: 28px; font-weight: 900; color: #888; letter-spacing: 0.05em; text-align: right; }
  .doc-num { font-size: 14px; color: #555; font-weight: 600; text-align: right; margin-top: 4px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 28px; }
  .meta-block h3 { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 6px; }
  .meta-block p { font-size: 13px; font-weight: 600; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
  thead th { background: #0A0A0A; color: #C8FF00; padding: 10px 12px; text-align: left; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
  thead th:last-child, thead th:nth-last-child(2), thead th:nth-last-child(3) { text-align: right; }
  tbody td { padding: 10px 12px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: middle; }
  tbody td:last-child, tbody td:nth-last-child(2), tbody td:nth-last-child(3) { text-align: right; font-family: monospace; }
  tbody tr:hover { background: #f9f9f9; }
  .totals { margin-left: auto; width: 260px; }
  .total-row { display: flex; justify-content: space-between; padding: 6px 0; font-size: 13px; }
  .total-row.grand { border-top: 2px solid #0A0A0A; margin-top: 8px; padding-top: 12px; font-size: 16px; font-weight: 800; }
  .notes { margin-top: 28px; padding: 14px 16px; background: #f5f5f5; border-radius: 6px; font-size: 12px; line-height: 1.6; color: #444; }
  .notes strong { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #888; margin-bottom: 4px; }
  .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #ddd; text-align: center; font-size: 11px; color: #999; }
  @media print { body { padding: 24px; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <div class="shop-name">${shop}</div>
    <div style="color:#666;font-size:12px;margin-top:4px;">Retail Operations</div>
  </div>
  <div>
    <div class="doc-type">${docType}</div>
    <div class="doc-num">${q.quote_number}</div>
  </div>
</div>
<div class="meta">
  <div class="meta-block">
    <h3>Bill To</h3>
    <p>${q.customer_name}</p>
    ${q.customer_phone ? `<p style="color:#555">${q.customer_phone}</p>` : ""}
    ${q.customer_address ? `<p style="color:#555">${q.customer_address}</p>` : ""}
  </div>
  <div class="meta-block" style="text-align:right">
    <h3>Details</h3>
    <p>Date: ${format(new Date(q.created_at), "d MMM yyyy")}</p>
    ${q.valid_until ? `<p>Valid until: ${format(new Date(q.valid_until), "d MMM yyyy")}</p>` : ""}
    <p style="margin-top:8px"><span style="background:#0A0A0A;color:#C8FF00;padding:3px 8px;border-radius:4px;font-size:11px;font-weight:700">${(q.status || "draft").toUpperCase()}</span></p>
  </div>
</div>
<table>
  <thead>
    <tr>
      <th style="width:40px">#</th>
      <th>Description</th>
      <th>Unit</th>
      <th>Qty</th>
      <th>Unit Price</th>
      <th>Total</th>
    </tr>
  </thead>
  <tbody>
    ${(q.items || []).map((item, i) => `
    <tr>
      <td style="color:#888">${i + 1}</td>
      <td>${item.productName}</td>
      <td style="color:#888">${item.unit}</td>
      <td style="text-align:right">${item.qty}</td>
      <td>${formatKES(item.unitPrice)}</td>
      <td><strong>${formatKES(item.total)}</strong></td>
    </tr>`).join("")}
  </tbody>
</table>
<div class="totals">
  <div class="total-row"><span>Subtotal</span><span>${formatKES(q.subtotal)}</span></div>
  ${q.discount > 0 ? `<div class="total-row" style="color:#e55"><span>Discount</span><span>- ${formatKES(q.discount)}</span></div>` : ""}
  <div class="total-row grand"><span>TOTAL</span><span>${formatKES(q.total)}</span></div>
</div>
${q.notes ? `<div class="notes"><strong>Notes</strong>${q.notes}</div>` : ""}
<div class="footer">Generated by GreenLink OS · ${format(new Date(), "d MMM yyyy, h:mm a")}</div>
</body>
</html>`;
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(html);
    win.document.close();
    win.onload = () => { win.focus(); win.print(); };
  }
}

// ── Share / download as PDF ────────────────────────────────────────────────────
async function shareAsPdf(q: Quotation): Promise<void> {
  const { jsPDF } = await import("jspdf");
  const { default: autoTable } = await import("jspdf-autotable");

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const W = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const shop = shopName();
  const docType = q.type === "invoice" ? "INVOICE" : "QUOTATION";
  const DARK: [number, number, number] = [10, 10, 10];
  const LIME: [number, number, number] = [200, 255, 0];
  const GREY: [number, number, number] = [100, 100, 100];
  const L = 14; // left margin
  const R = W - 14; // right edge

  // ─── Header band ─────────────────────────────────────────────────────────
  doc.setFillColor(...DARK);
  doc.rect(0, 0, W, 30, "F");
  doc.setFillColor(...LIME);
  doc.rect(0, 30, W, 0.8, "F");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...LIME);
  doc.text(shop, L, 13);

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(160, 160, 160);
  doc.text("Retail Operations", L, 20);

  doc.setFontSize(20);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...LIME);
  doc.text(docType, R, 12, { align: "right" });
  doc.setFontSize(9.5);
  doc.setTextColor(200, 200, 200);
  doc.text(q.quote_number, R, 20, { align: "right" });

  // ─── Meta: Bill To + Details ─────────────────────────────────────────────
  let y = 42;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  doc.setTextColor(...GREY);
  doc.text("BILL TO", L, y);
  doc.text("DETAILS", W / 2 + 6, y);
  y += 5.5;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...DARK);
  doc.text(q.customer_name, L, y);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(55, 55, 55);
  doc.text(`Date: ${format(new Date(q.created_at), "d MMM yyyy")}`, W / 2 + 6, y);

  if (q.customer_phone) {
    y += 5.5;
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(q.customer_phone, L, y);
  }
  if (q.valid_until) {
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text(`Valid until: ${format(new Date(q.valid_until), "d MMM yyyy")}`, W / 2 + 6, y + (q.customer_phone ? 0 : 5.5));
    if (!q.customer_phone) y += 5.5;
  }
  if (q.customer_address) {
    y += 5.5;
    doc.setTextColor(110, 110, 110);
    doc.text(q.customer_address, L, y);
  }

  // Status pill
  const pillX = W / 2 + 6;
  const pillY = y - (q.customer_phone ? 5.5 : 0);
  doc.setFillColor(...DARK);
  doc.roundedRect(pillX, pillY + 4, 26, 5.5, 1.2, 1.2, "F");
  doc.setFontSize(7);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...LIME);
  doc.text(q.status.toUpperCase(), pillX + 13, pillY + 8.2, { align: "center" });

  y += 12;

  // ─── Line items ──────────────────────────────────────────────────────────
  autoTable(doc, {
    startY: y,
    head: [["#", "Description", "Unit", "Qty", "Unit Price", "Total"]],
    body: (q.items ?? []).map((item, i) => [
      String(i + 1),
      item.productName,
      item.unit || "—",
      String(item.qty),
      formatKES(item.unitPrice),
      formatKES(item.total),
    ]),
    theme: "plain",
    styles: { fontSize: 9, cellPadding: { top: 4, bottom: 4, left: 3, right: 3 }, textColor: [30, 30, 30] },
    headStyles: { fillColor: DARK, textColor: LIME, fontStyle: "bold", fontSize: 8, cellPadding: { top: 5, bottom: 5, left: 3, right: 3 } },
    columnStyles: {
      0: { cellWidth: 9, halign: "center", textColor: GREY },
      2: { cellWidth: 18, halign: "center", textColor: GREY },
      3: { cellWidth: 14, halign: "right" },
      4: { cellWidth: 30, halign: "right" },
      5: { cellWidth: 32, halign: "right", fontStyle: "bold" },
    },
    alternateRowStyles: { fillColor: [248, 248, 248] },
    margin: { left: L, right: L },
  });

  y = (doc as any).lastAutoTable.finalY + 10;

  // ─── Totals block ────────────────────────────────────────────────────────
  const totW = 78;
  const totX = R - totW;

  if (q.discount > 0) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(80, 80, 80);
    doc.text("Subtotal", totX, y);
    doc.text(formatKES(q.subtotal), R, y, { align: "right" });
    y += 6;
    doc.setTextColor(200, 50, 50);
    doc.text("Discount", totX, y);
    doc.text(`- ${formatKES(q.discount)}`, R, y, { align: "right" });
    y += 4;
    doc.setDrawColor(210, 210, 210);
    doc.line(totX, y, R, y);
    y += 5;
  }

  doc.setFillColor(...DARK);
  doc.roundedRect(totX - 4, y - 4, totW + 4, 12.5, 2, 2, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(170, 170, 170);
  doc.text("TOTAL", totX, y + 4);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...LIME);
  doc.text(formatKES(q.total), R - 2, y + 4.5, { align: "right" });
  y += 20;

  // ─── Notes ───────────────────────────────────────────────────────────────
  if (q.notes) {
    const noteLines = doc.splitTextToSize(q.notes as string, R - L - 12);
    const noteH = noteLines.length * 5.5 + 14;
    doc.setFillColor(246, 246, 246);
    doc.roundedRect(L, y, R - L, noteH, 2, 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7);
    doc.setTextColor(...GREY);
    doc.text("NOTES", L + 6, y + 6);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(60, 60, 60);
    doc.text(noteLines, L + 6, y + 12);
    y += noteH + 8;
  }

  // ─── Footer ──────────────────────────────────────────────────────────────
  doc.setDrawColor(220, 220, 220);
  doc.line(L, pageH - 16, R, pageH - 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(160, 160, 160);
  doc.text(
    `${shop} · ${docType} ${q.quote_number} · Generated ${format(new Date(), "d MMM yyyy, h:mm a")}`,
    W / 2, pageH - 10, { align: "center" }
  );

  // ─── Share or download ───────────────────────────────────────────────────
  const filename = `${docType}-${q.quote_number.replace(/\//g, "-")}.pdf`;
  const blob = doc.output("blob");
  const file = new File([blob], filename, { type: "application/pdf" });

  if (navigator.canShare?.({ files: [file] })) {
    await navigator.share({ files: [file], title: `${shop} — ${q.quote_number}` });
  } else {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}

// ── Product picker ─────────────────────────────────────────────────────────────
function ProductPicker({ onAdd }: { onAdd: (item: QuoteItem) => void }) {
  const [q, setQ] = useState("");
  const { data } = useListProducts(
    { shopId: shopId(), limit: 3000 },
    { query: { staleTime: 5 * 60_000 } }
  );
  const products = data?.products ?? [];

  const filtered = useMemo(() => {
    if (!q.trim()) return products.slice(0, 30);
    const lower = q.toLowerCase();
    return products.filter(p =>
      p.canonicalName?.toLowerCase().includes(lower) ||
      p.category?.toLowerCase().includes(lower) ||
      p.sku?.toLowerCase().includes(lower)
    ).slice(0, 50);
  }, [products, q]);

  return (
    <div className="flex flex-col h-full">
      <div className="relative shrink-0 mb-2">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Search products…"
          className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/40 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
          autoFocus
        />
        {q && (
          <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto min-h-0 -mx-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-1 text-muted-foreground">
            <Package className="h-5 w-5 opacity-30" />
            <p className="text-xs">No products found</p>
          </div>
        ) : (
          <div className="space-y-1 px-1">
            {filtered.map(p => (
              <button
                key={p.id}
                onClick={() => onAdd({
                  productId: p.id,
                  productName: p.canonicalName ?? p.sku ?? p.id,
                  unit: p.unit ?? "unit",
                  unitPrice: p.sellingPrice ?? 0,
                  qty: 1,
                  total: p.sellingPrice ?? 0,
                })}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-card hover:bg-muted/60 border border-border/40 hover:border-primary/30 transition-all text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
                  <Package className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold truncate">{p.canonicalName}</p>
                  <p className="text-[10px] text-muted-foreground">{p.category ?? "General"}{p.unit && p.unit !== "unit" ? ` · ${p.unit}` : ""}</p>
                </div>
                <span className="text-xs font-bold font-mono text-primary shrink-0">{formatKES(p.sellingPrice ?? 0)}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Builder form ───────────────────────────────────────────────────────────────
interface BuilderProps {
  docType: "quotation" | "invoice";
  initial?: Quotation | null;
  onSaved: (q: Quotation) => void;
  onCancel: () => void;
}

function QuoteBuilder({ docType, initial, onSaved, onCancel }: BuilderProps) {
  const qc = useQueryClient();
  const [customerName, setCustomerName] = useState(initial?.customer_name ?? "");
  const [customerPhone, setCustomerPhone] = useState(initial?.customer_phone ?? "");
  const [customerAddress, setCustomerAddress] = useState(initial?.customer_address ?? "");
  const [validUntil, setValidUntil] = useState(
    initial?.valid_until ?? format(addDays(new Date(), 14), "yyyy-MM-dd")
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [discount, setDiscount] = useState(initial?.discount ?? 0);
  const [items, setItems] = useState<QuoteItem[]>(initial?.items ?? []);
  const [showProducts, setShowProducts] = useState(!initial && items.length === 0);
  const [itemsCollapsed, setItemsCollapsed] = useState(false);

  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const total = Math.max(0, subtotal - discount);

  const addItem = useCallback((item: QuoteItem) => {
    setItems(prev => {
      const existing = prev.findIndex(i => i.productId === item.productId && item.productId);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = {
          ...updated[existing],
          qty: updated[existing].qty + 1,
          total: (updated[existing].qty + 1) * updated[existing].unitPrice,
        };
        return updated;
      }
      return [...prev, item];
    });
  }, []);

  const updateItem = (idx: number, field: "qty" | "unitPrice", val: number) => {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it;
      const qty = field === "qty" ? val : it.qty;
      const unitPrice = field === "unitPrice" ? val : it.unitPrice;
      return { ...it, qty, unitPrice, total: qty * unitPrice };
    }));
  };

  const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        shopId: shopId(),
        type: docType,
        customerName: customerName.trim(),
        customerPhone: customerPhone.trim(),
        customerAddress: customerAddress.trim(),
        validUntil,
        notes,
        discount,
        items: items.map(it => ({
          productId: it.productId ?? undefined,
          productName: (it.productName ?? "").trim() || it.productId ?? "Product",
          unit: it.unit ?? "unit",
          unitPrice: it.unitPrice,
          qty: it.qty,
        })),
      };
      if (initial) return updateQuotation(initial.id, payload);
      return createQuotation(payload);
    },
    onSuccess: (saved) => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success(`${docType === "invoice" ? "Invoice" : "Quotation"} saved!`);
      onSaved(saved);
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save — ${msg}`);
    },
  });

  const isValid = customerName.trim() && items.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={onCancel} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-bold font-display">
            {initial ? "Edit" : "New"} {docType === "invoice" ? "Invoice" : "Quotation"}
          </h2>
          {initial && <p className="text-[10px] text-muted-foreground">{initial.quote_number}</p>}
        </div>
        <button
          onClick={() => saveMutation.mutate()}
          disabled={!isValid || saveMutation.isPending}
          className={cn(
            "flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all",
            isValid && !saveMutation.isPending
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "bg-muted text-muted-foreground cursor-not-allowed"
          )}
        >
          {saveMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Save
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="flex flex-col lg:flex-row h-full">
          {/* Left: Product picker */}
          <div className={cn(
            "border-b lg:border-b-0 lg:border-r border-border shrink-0",
            showProducts ? "flex flex-col" : "hidden lg:flex lg:flex-col",
            "lg:w-80 p-4"
          )}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Products</p>
              <button onClick={() => setShowProducts(false)} className="lg:hidden text-muted-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0" style={{ height: showProducts ? "40dvh" : "auto" }}>
              <ProductPicker onAdd={item => { addItem(item); }} />
            </div>
          </div>

          {/* Right: Quote details */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto min-h-0">
            {/* Customer */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer Details</p>
              <div className="space-y-2">
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={customerName}
                    onChange={e => setCustomerName(e.target.value)}
                    placeholder="Customer name *"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={customerPhone}
                    onChange={e => setCustomerPhone(e.target.value)}
                    placeholder="Phone number"
                    type="tel"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    value={customerAddress}
                    onChange={e => setCustomerAddress(e.target.value)}
                    placeholder="Address (optional)"
                    className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => setItemsCollapsed(c => !c)}
                  className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ChevronDown className={cn("h-3 w-3 transition-transform duration-200", itemsCollapsed && "-rotate-90")} />
                  Items ({items.length}){items.length > 0 && itemsCollapsed && <span className="text-primary font-mono normal-case tracking-normal ml-1">· {formatKES(subtotal)}</span>}
                </button>
                <button
                  onClick={() => setShowProducts(true)}
                  className="flex items-center gap-1 text-xs font-bold text-primary bg-primary/10 px-3 py-1.5 rounded-lg hover:bg-primary/20 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add product
                </button>
              </div>

              {!itemsCollapsed && items.length === 0 ? (
                <button
                  onClick={() => setShowProducts(true)}
                  className="w-full flex flex-col items-center gap-2 py-8 border border-dashed border-border rounded-xl text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                >
                  <Plus className="h-5 w-5" />
                  <p className="text-xs font-medium">Click to add products</p>
                </button>
              ) : !itemsCollapsed ? (
                <div className="space-y-2">
                  {items.map((item, idx) => (
                    <div key={idx} className="bg-card border border-border rounded-xl p-3">
                      <div className="flex items-start gap-2 mb-2">
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{item.productName}</p>
                          <p className="text-[10px] text-muted-foreground">{item.unit}</p>
                        </div>
                        <button
                          onClick={() => removeItem(idx)}
                          className="h-6 w-6 flex items-center justify-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Unit Price</p>
                          <div className="flex items-center gap-1 bg-muted/40 rounded-lg px-2 py-1.5">
                            <span className="text-[10px] text-muted-foreground">KES</span>
                            <input
                              type="number"
                              value={item.unitPrice}
                              onChange={e => updateItem(idx, "unitPrice", parseFloat(e.target.value) || 0)}
                              className="flex-1 min-w-0 bg-transparent text-xs font-mono font-bold focus:outline-none"
                            />
                          </div>
                        </div>
                        <div className="w-24">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Qty</p>
                          <div className="flex items-center bg-muted/40 rounded-lg">
                            <button
                              onClick={() => updateItem(idx, "qty", Math.max(0.5, item.qty - (item.qty % 1 === 0 ? 1 : 0.5)))}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
                            >−</button>
                            <input
                              type="number"
                              value={item.qty}
                              onChange={e => updateItem(idx, "qty", parseFloat(e.target.value) || 0)}
                              className="flex-1 min-w-0 bg-transparent text-xs font-mono font-bold text-center focus:outline-none"
                            />
                            <button
                              onClick={() => updateItem(idx, "qty", item.qty + 1)}
                              className="w-7 h-7 flex items-center justify-center text-muted-foreground hover:text-foreground"
                            >+</button>
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-[9px] text-muted-foreground mb-0.5">Total</p>
                          <p className="text-xs font-bold font-mono text-primary">{formatKES(item.total)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  <button
                    onClick={() => setShowProducts(true)}
                    className="lg:hidden w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-border rounded-xl text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-all"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add more products
                  </button>
                </div>
              ) : null}
            </div>

            {/* Discount + Valid until + Notes */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Details</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Tag className="h-3 w-3" /> Discount (KES)
                  </p>
                  <input
                    type="number"
                    value={discount}
                    onChange={e => setDiscount(parseFloat(e.target.value) || 0)}
                    min={0}
                    className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground mb-1 flex items-center gap-1">
                    <Calendar className="h-3 w-3" /> Valid Until
                  </p>
                  <input
                    type="date"
                    value={validUntil}
                    onChange={e => setValidUntil(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <div className="relative">
                <StickyNote className="absolute left-3 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Notes / terms (optional)"
                  rows={2}
                  className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted/30 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all resize-none"
                />
              </div>
            </div>

            {/* Totals summary */}
            {items.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatKES(subtotal)}</span>
                </div>
                {discount > 0 && (
                  <div className="flex justify-between text-xs text-destructive">
                    <span>Discount</span>
                    <span className="font-mono">− {formatKES(discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold border-t border-border pt-2 mt-1">
                  <span>TOTAL</span>
                  <span className="font-mono text-primary text-base">{formatKES(total)}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail view ────────────────────────────────────────────────────────────────
function QuoteDetail({ id, onBack, onEdit, onConverted }: {
  id: string;
  onBack: () => void;
  onEdit: (q: Quotation) => void;
  onConverted: (id: string) => void;
}) {
  const [isSharing, setIsSharing] = useState(false);
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const qc = useQueryClient();
  const { data: q, isLoading } = useQuery({
    queryKey: ["quotations", id],
    queryFn: () => fetchQuotation(id),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateQuotation(id, { status }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success("Status updated");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteQuotation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quotations"] });
      toast.success("Deleted");
      onBack();
    },
  });

  if (isLoading) return (
    <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
      <Loader2 className="h-6 w-6 animate-spin" />
    </div>
  );
  if (!q) return null;

  const statusOptions = q.type === "invoice"
    ? ["draft", "sent", "paid"]
    : ["draft", "sent", "accepted", "declined", "expired"];

  const shop = shopName();
  const docType = q.type === "invoice" ? "INVOICE" : "QUOTATION";
  const whatsappPhone = q.customer_phone?.replace(/\D/g, "");
  const whatsappMsg = encodeURIComponent(
    `Hello ${q.customer_name},\nThank you for choosing ${shop}.\n\nYour ${q.type} *${q.quote_number}* is ready.\nTotal: *${formatKES(q.total)}*\n\nPlease let us know if you have any questions.`
  );

  const totalQty = (q.items ?? []).reduce((s, i) => s + i.qty, 0);
  const isInvoice = q.type === "invoice";
  const billLabel = isInvoice ? "Bill To" : "Quote For";

  return (
    <div className="flex flex-col h-full">
      {/* App nav */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-card shrink-0">
        <button onClick={onBack} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold font-display">{q.quote_number}</h2>
            <StatusBadge status={q.status} />
          </div>
          <p className="text-[10px] text-muted-foreground">{q.customer_name}</p>
        </div>
        <button onClick={() => onEdit(q)} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
          <Edit3 className="h-4 w-4" />
        </button>
        <button onClick={() => { if (confirm("Delete this document?")) deleteMutation.mutate(); }} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-3">

        {/* ── Document Card ───────────────────────────────────────────── */}
        <div className="rounded-2xl overflow-hidden border border-zinc-200 shadow-xl bg-white text-zinc-900">

          {/* Green header */}
          <div className="bg-[#1a5c2a] px-5 py-4">
            <div className="flex items-start justify-between">
              {/* Logo + brand */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[#C8FF00] rounded-xl flex items-center justify-center shrink-0">
                  <Leaf className="h-5 w-5 text-[#1a5c2a]" />
                </div>
                <div>
                  <p className="text-white font-black text-base leading-none tracking-tight">{shop}</p>
                  <p className="text-green-300 text-[10px] mt-0.5">Farm Supplies &amp; Services Ltd</p>
                  <p className="text-green-400/80 text-[9px] italic mt-0.5">Smart. Reliable. Profitable.</p>
                </div>
              </div>
              {/* Doc type + number */}
              <div className="text-right">
                <p className="text-[#C8FF00] text-2xl font-black tracking-widest leading-none">{docType}</p>
                <p className="text-green-300 text-[11px] font-mono mt-1"># {q.quote_number}</p>
              </div>
            </div>
          </div>

          {/* Date / status bar */}
          <div className="bg-green-50 border-b border-green-100 px-5 py-2 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Calendar className="h-3 w-3 text-zinc-400" />
              <span>Date: <strong>{format(new Date(q.created_at), "d MMM yyyy")}</strong></span>
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
              <Clock className="h-3 w-3 text-zinc-400" />
              <span>{format(new Date(q.created_at), "h:mm a")}</span>
            </div>
            {q.valid_until && (
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-600">
                <Calendar className="h-3 w-3 text-zinc-400" />
                <span>Valid until: <strong>{format(new Date(q.valid_until), "d MMM yyyy")}</strong></span>
              </div>
            )}
            <div className="ml-auto">
              <StatusBadge status={q.status} />
            </div>
          </div>

          {!isInvoice && (
            <div className="bg-amber-50 border-b border-amber-100 px-5 py-1.5">
              <p className="text-[10px] text-amber-700 italic text-center">This is not a tax invoice</p>
            </div>
          )}

          {/* Bill To / Prepared By */}
          <div className="px-5 py-4 grid grid-cols-2 gap-4 border-b border-zinc-100">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-400 mb-2 flex items-center gap-1">
                <User className="h-2.5 w-2.5" />{billLabel}
              </p>
              <p className="text-sm font-bold text-zinc-900 leading-snug">{q.customer_name}</p>
              {q.customer_phone && (
                <p className="text-xs text-zinc-500 mt-1 flex items-center gap-1">
                  <Phone className="h-2.5 w-2.5 shrink-0" />{q.customer_phone}
                </p>
              )}
              {q.customer_address && (
                <p className="text-xs text-zinc-400 mt-0.5 flex items-center gap-1">
                  <MapPin className="h-2.5 w-2.5 shrink-0" />{q.customer_address}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[9px] font-black uppercase tracking-[0.15em] text-zinc-400 mb-2 flex items-center gap-1 justify-end">
                <Building2 className="h-2.5 w-2.5" />{isInvoice ? "Served By" : "Prepared By"}
              </p>
              {q.created_by ? (
                <p className="text-xs font-semibold text-zinc-700">{q.created_by}</p>
              ) : (
                <p className="text-xs text-zinc-400">—</p>
              )}
              <p className="text-[10px] text-zinc-400 mt-2">{isInvoice ? "Payment Method" : "Payment Terms"}</p>
              <p className="text-xs font-medium text-zinc-600 mt-0.5">Cash on Delivery</p>
            </div>
          </div>

          {/* Products table */}
          <div>
            <table className="w-full">
              <thead>
                <tr className="bg-[#1a5c2a]">
                  <th className="pl-4 pr-2 py-2 text-left text-[8px] font-black uppercase tracking-widest text-green-400 w-7">#</th>
                  <th className="px-2 py-2 text-left text-[8px] font-black uppercase tracking-widest text-[#C8FF00]">Product</th>
                  <th className="px-2 py-2 text-right text-[8px] font-black uppercase tracking-widest text-green-400 w-10">Qty</th>
                  <th className="px-2 py-2 text-right text-[8px] font-black uppercase tracking-widest text-green-400 w-20">Unit Price</th>
                  <th className="pl-2 pr-4 py-2 text-right text-[8px] font-black uppercase tracking-widest text-[#C8FF00] w-20">Total</th>
                </tr>
              </thead>
              <tbody>
                {(q.items ?? []).map((item, i) => (
                  <tr key={i} className={cn("border-t border-zinc-100", i % 2 === 1 && "bg-zinc-50/70")}>
                    <td className="pl-4 pr-2 py-2.5 text-[10px] text-zinc-400">{i + 1}</td>
                    <td className="px-2 py-2.5">
                      <p className="text-xs font-semibold text-zinc-800 leading-snug">{item.productName}</p>
                      <p className="text-[9px] text-zinc-400 mt-0.5">{item.unit !== "unit" ? item.unit : ""}</p>
                    </td>
                    <td className="px-2 py-2.5 text-right text-xs font-mono text-zinc-600">{item.qty}</td>
                    <td className="px-2 py-2.5 text-right text-xs font-mono text-zinc-500">{formatKES(item.unitPrice)}</td>
                    <td className="pl-2 pr-4 py-2.5 text-right text-xs font-bold font-mono text-zinc-900">{formatKES(item.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Order summary + payment summary side by side */}
          <div className="border-t border-zinc-200 grid grid-cols-2 gap-0">
            {/* Left: Order summary */}
            <div className="px-4 py-3 border-r border-zinc-200 bg-zinc-50">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500 mb-2">Order Summary</p>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>Items</span>
                  <span className="font-mono font-semibold">{q.items?.length ?? 0}</span>
                </div>
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>Total Qty</span>
                  <span className="font-mono font-semibold">{totalQty}</span>
                </div>
              </div>
            </div>
            {/* Right: Payment summary */}
            <div className="px-4 py-3 bg-white">
              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-zinc-500 mb-2">Payment Summary</p>
              <div className="space-y-1">
                <div className="flex justify-between text-[10px] text-zinc-600">
                  <span>Subtotal</span>
                  <span className="font-mono">{formatKES(q.subtotal)}</span>
                </div>
                {q.discount > 0 && (
                  <div className="flex justify-between text-[10px] text-red-500">
                    <span>Discount</span>
                    <span className="font-mono">− {formatKES(q.discount)}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Total row */}
          <div className="bg-[#1a5c2a] px-5 py-3 flex items-center justify-between">
            <span className="text-green-300 text-xs font-black uppercase tracking-widest">Total</span>
            <span className="text-[#C8FF00] text-2xl font-black font-mono">{formatKES(q.total)}</span>
          </div>

          {/* Notes */}
          {q.notes && (
            <div className="bg-green-50 border-t border-green-100 px-5 py-3">
              <p className="text-[9px] font-black uppercase tracking-widest text-zinc-400 mb-1">Notes</p>
              <p className="text-[11px] text-zinc-600 leading-relaxed">{q.notes}</p>
            </div>
          )}

          {/* Footer */}
          <div className="bg-zinc-900 px-5 py-2.5 flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-3 flex-wrap">
              {q.customer_phone && (
                <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                  <Phone className="h-2.5 w-2.5 text-[#C8FF00]" />{q.customer_phone}
                </span>
              )}
              <span className="flex items-center gap-1 text-[10px] text-zinc-400">
                <Globe className="h-2.5 w-2.5 text-[#C8FF00]" />www.greenlink.co.ke
              </span>
            </div>
            <span className="text-[9px] text-zinc-500">Powered by GreenLink POS</span>
          </div>
        </div>

        {/* ── Status ───────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Change Status</p>
          <div className="flex flex-wrap gap-2">
            {statusOptions.map(s => (
              <button
                key={s}
                disabled={q.status === s || statusMutation.isPending}
                onClick={() => statusMutation.mutate(s)}
                className={cn(
                  "px-3 py-1.5 rounded-xl text-xs font-bold border transition-all",
                  q.status === s
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-muted/40 border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                )}
              >
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* ── Actions ──────────────────────────────────────────────── */}
        <div className="space-y-2.5 pb-4">
          {whatsappPhone && (
            <a
              href={`https://wa.me/${whatsappPhone}?text=${whatsappMsg}`}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#25D366] text-white text-sm font-bold hover:bg-[#20c05c] transition-colors shadow-sm"
            >
              <MessageCircle className="h-4 w-4" />
              Share via WhatsApp
            </a>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => printQuotation(q)}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted/60 transition-colors"
            >
              <Printer className="h-4 w-4" />
              Print
            </button>
            <button
              onClick={async () => {
                setIsSharing(true);
                try { await shareAsPdf(q); }
                catch (e: unknown) {
                  const msg = e instanceof Error ? e.message : String(e);
                  if (!msg.includes("AbortError") && !msg.includes("cancel")) toast.error("Could not share PDF");
                }
                finally { setIsSharing(false); }
              }}
              disabled={isSharing}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border border-border bg-card text-sm font-bold hover:bg-muted/60 transition-colors disabled:opacity-60"
            >
              {isSharing ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</> : <><Share2 className="h-4 w-4" />Download PDF</>}
            </button>
          </div>

          {q.type === "quotation" && (
            <ConvertToInvoiceDialog quotation={q} onConverted={onConverted} />
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────────
type View =
  | { kind: "list" }
  | { kind: "build"; docType: "quotation" | "invoice"; editing: Quotation | null }
  | { kind: "detail"; id: string };

export default function QuotationsPage() {
  const [view, setView] = useState<View>({ kind: "list" });
  const [activeTab, setActiveTab] = useState<"quotation" | "invoice">("quotation");

  const { data: quotes = [], isLoading } = useQuery<Quotation[]>({
    queryKey: ["quotations", activeTab],
    queryFn: () => fetchQuotations(activeTab),
    staleTime: 30_000,
  });

  if (view.kind === "build") {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <QuoteBuilder
          docType={view.docType}
          initial={view.editing}
          onSaved={saved => setView({ kind: "detail", id: saved.id })}
          onCancel={() => setView({ kind: "list" })}
        />
      </div>
    );
  }

  if (view.kind === "detail") {
    return (
      <div className="flex flex-col min-h-full bg-background">
        <QuoteDetail
          id={view.id}
          onBack={() => setView({ kind: "list" })}
          onEdit={q => setView({ kind: "build", docType: q.type, editing: q })}
          onConverted={newId => setView({ kind: "detail", id: newId })}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card shrink-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold font-display flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Quotes & Invoices
            </h1>
            <p className="text-xs text-muted-foreground">{quotes.length} document{quotes.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setView({ kind: "build", docType: "quotation", editing: null })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-card border border-border text-xs font-bold hover:bg-muted/60 transition-colors"
            >
              <FileText className="h-3.5 w-3.5 text-muted-foreground" />
              Quote
            </button>
            <button
              onClick={() => setView({ kind: "build", docType: "invoice", editing: null })}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold hover:bg-primary/90 transition-colors"
            >
              <Receipt className="h-3.5 w-3.5" />
              Invoice
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3 bg-muted/40 rounded-xl p-1">
          {(["quotation", "invoice"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold transition-all",
                activeTab === tab
                  ? "bg-card text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "quotation" ? <FileText className="h-3.5 w-3.5" /> : <Receipt className="h-3.5 w-3.5" />}
              {tab === "quotation" ? "Quotations" : "Invoices"}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0 p-4">
        {isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : quotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground">
            {activeTab === "quotation"
              ? <FileText className="h-12 w-12 opacity-10" />
              : <Receipt className="h-12 w-12 opacity-10" />}
            <div className="text-center">
              <p className="text-sm font-semibold">No {activeTab === "quotation" ? "quotations" : "invoices"} yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">Create your first one above</p>
            </div>
            <button
              onClick={() => setView({ kind: "build", docType: activeTab, editing: null })}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-bold hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              New {activeTab === "quotation" ? "Quotation" : "Invoice"}
            </button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {quotes.map(q => (
              <button
                key={q.id}
                onClick={() => setView({ kind: "detail", id: q.id })}
                className="w-full bg-card border border-border rounded-2xl p-4 text-left hover:border-primary/40 hover:shadow-md transition-all group active:scale-[0.99]"
              >
                <div className="flex items-start gap-3">
                  {/* Icon */}
                  <div className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                    q.type === "invoice"
                      ? "bg-primary/10 group-hover:bg-primary/20"
                      : "bg-muted/60 group-hover:bg-muted"
                  )}>
                    {q.type === "invoice"
                      ? <Receipt className="h-4.5 w-4.5 text-primary" />
                      : <FileText className="h-4.5 w-4.5 text-muted-foreground" />}
                  </div>

                  {/* Middle */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-black font-mono text-muted-foreground tracking-wide">{q.quote_number}</span>
                      <StatusBadge status={q.status} />
                    </div>
                    <p className="text-sm font-bold text-foreground truncate leading-snug">{q.customer_name}</p>
                    {q.customer_phone && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5 flex items-center gap-1">
                        <Phone className="h-2.5 w-2.5 shrink-0" />{q.customer_phone}
                      </p>
                    )}
                  </div>

                  {/* Amount + date */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-black font-mono text-primary">{formatKES(q.total)}</p>
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(q.created_at), "d MMM yyyy")}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
