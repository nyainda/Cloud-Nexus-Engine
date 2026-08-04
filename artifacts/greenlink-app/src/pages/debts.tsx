import React, { useState, useMemo, useEffect } from "react";
import { useListDebts, useRecordDebtPayment, useGetDebt, getListDebtsQueryKey, getListSalesQueryKey, customFetch } from "@workspace/api-client-react";
import { enqueueMutation } from "@/lib/offline-queue";
import { useQueryClient } from "@tanstack/react-query";
import { CustomerAutocomplete, toTitleCase, type SelectedCustomer } from "@/components/customer-autocomplete";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatKES } from "@/lib/format";
import {
  Search, Users, Phone, CalendarClock, CheckCircle2, Wallet,
  MessageCircle, AlertTriangle, Clock, TrendingDown, History,
  ChevronDown, ChevronUp, ChevronRight, Banknote, User2, Trash2, Send, BadgeCheck,
  ShoppingBasket, Package, Download, UserPlus, Save, X,
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { format, formatDistanceToNow, differenceInDays } from "date-fns";
import { cn } from "@/lib/utils";

function PaymentDialog({ debt }: { debt: any }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const recordPayment = useRecordDebtPayment();
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const userName = localStorage.getItem("greenlink_userName") || "";
  const paidPct = debt.totalAmount > 0
    ? Math.round(((debt.totalAmount - debt.balance) / debt.totalAmount) * 100)
    : 0;

  const handlePayment = () => {
    const paid = Number(amount);
    if (!paid || paid <= 0 || submitting) return;

    // Guard against double-tap immediately
    setSubmitting(true);

    const exactKey = getListDebtsQueryKey({ shopId });
    const snapshot = qc.getQueryData(exactKey);

    // Optimistic update — instant, no await
    qc.cancelQueries({ queryKey: exactKey });
    qc.setQueryData(exactKey, (old: any) => {
      if (!Array.isArray(old)) return old;
      return old.map(d => {
        if (d.id !== debt.id) return d;
        const newBalance = Math.max(0, d.balance - paid);
        return { ...d, balance: newBalance, status: newBalance === 0 ? "paid" : newBalance < d.totalAmount ? "partial" : d.status };
      });
    });

    // Close instantly — don't wait for network
    setOpen(false);
    setAmount("");
    setSubmitting(false);

    // If offline, queue the payment and return — sync will fire on reconnect
    if (!navigator.onLine) {
      enqueueMutation("debt_payment", shopId, { debtId: debt.id, amount: paid, recordedBy: userName });
      toast.success("Payment saved offline — will sync on reconnect");
      return;
    }

    toast.success("Payment recorded!");

    // Fire network request in the background.
    // ⚠️ Do NOT call invalidateQueries on success — it triggers a refetch that can
    // return stale cached data and revert the optimistic update. The optimistic patch
    // above is already authoritative; the 20-second refetchInterval will sync eventually.
    recordPayment.mutateAsync({ debtId: debt.id, data: { amount: paid, recordedBy: userName } })
      .then(() => {
        // Server confirmed — safe to refetch and get any concurrent updates
        qc.invalidateQueries({ queryKey: exactKey });
      })
      .catch(() => {
        qc.setQueryData(exactKey, snapshot);
        toast.error("Payment failed — please retry");
      });
  };

  const quickAmounts = [
    { label: "25%", value: (debt.balance * 0.25).toFixed(0) },
    { label: "Half", value: (debt.balance * 0.5).toFixed(0) },
    { label: "Full", value: debt.balance.toString() },
  ];

  return (
    <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setAmount(""); }}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs px-3 font-semibold bg-primary hover:bg-primary/90 text-primary-foreground">
          <Wallet className="w-3.5 h-3.5 mr-1" />Record Payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Record Payment</DialogTitle>
        </DialogHeader>

        <div className="bg-muted/40 rounded-xl p-4 border border-border space-y-3">
          <div className="flex items-center gap-3">
            <div className={cn(
              "w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
              "bg-destructive/15 text-destructive"
            )}>
              {debt.customerName.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="font-bold text-foreground">{debt.customerName}</p>
              {debt.customerPhone && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Phone className="h-3 w-3" />{debt.customerPhone}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>Paid {paidPct}%</span>
              <span>Balance: <span className="text-destructive font-bold font-mono">{formatKES(debt.balance)}</span></span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">
              Total: {formatKES(debt.totalAmount)}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs uppercase tracking-wider font-bold">Payment Amount (KES)</Label>
          <Input
            type="number"
            className="h-14 text-2xl font-bold font-mono text-center"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            max={debt.balance}
            autoFocus
          />
          <div className="grid grid-cols-3 gap-2">
            {quickAmounts.map(q => (
              <Button
                key={q.label}
                variant="outline"
                size="sm"
                className="h-9 text-xs font-semibold"
                onClick={() => setAmount(q.value)}
              >
                {q.label}
                <span className="ml-1 text-[10px] text-muted-foreground font-mono">
                  {formatKES(Number(q.value))}
                </span>
              </Button>
            ))}
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={handlePayment}
            disabled={!amount || Number(amount) <= 0 || Number(amount) > debt.balance || submitting}
            className="px-8 min-w-[140px]"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
                Recording…
              </span>
            ) : "Confirm Payment"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mark as Paid button ───────────────────────────────────────────────────────
function MarkPaidButton({ debt }: { debt: any }) {
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  if (debt.status === "paid") return null;

  const handle = async () => {
    if (loading) return;
    setLoading(true);
    const exactKey = getListDebtsQueryKey({ shopId });
    const snapshot = qc.getQueryData(exactKey);
    const now = new Date().toISOString();
    qc.setQueryData(exactKey, (old: any) =>
      Array.isArray(old)
        ? old.map(d => d.id === debt.id ? { ...d, status: "paid", balance: 0, paidAt: now } : d)
        : old
    );
    toast.success(`${debt.customerName} marked as paid`);
    try {
      await customFetch(`/api/debts/${debt.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status: "paid" }),
      });
    } catch {
      qc.setQueryData(exactKey, snapshot);
      toast.error("Failed to mark paid — please retry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={loading}
      className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-xs font-semibold transition-colors disabled:opacity-50"
      title="Mark debt as fully paid"
    >
      <BadgeCheck className="h-3.5 w-3.5" />
      {loading ? "…" : "Mark Paid"}
    </button>
  );
}

// ─── Delete debt dialog ────────────────────────────────────────────────────────
function DeleteDebtDialog({ debt, onDeleted }: { debt: any; onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  const handleDelete = async () => {
    setLoading(true);
    const exactKey = getListDebtsQueryKey({ shopId });
    const snapshot = qc.getQueryData(exactKey);

    // Remove from debts cache instantly — no waiting for network
    qc.setQueryData(exactKey, (old: any) =>
      Array.isArray(old) ? old.filter((d: any) => d.id !== debt.id) : old
    );
    setOpen(false);
    onDeleted();

    try {
      await customFetch(`/api/debts/${debt.id}`, { method: "DELETE" });
      toast.success(`Debt for ${debt.customerName} deleted`);
      // Sync sales history so the linked sale no longer shows as a live debt
      qc.invalidateQueries({ queryKey: getListSalesQueryKey() });
    } catch {
      // Rollback
      qc.setQueryData(exactKey, snapshot);
      toast.error("Failed to delete — please retry");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive transition-colors"
          title="Delete debt"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-4 w-4 text-destructive" />
            Delete Debt Record
          </DialogTitle>
        </DialogHeader>

        <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-4 space-y-1">
          <p className="text-sm font-bold text-foreground">{debt.customerName}</p>
          {debt.customerPhone && (
            <p className="text-xs text-muted-foreground">{debt.customerPhone}</p>
          )}
          <p className="text-sm font-bold font-mono text-destructive">{formatKES(debt.totalAmount)}</p>
          <p className="text-[10px] text-muted-foreground">
            Created {format(new Date(debt.createdAt), "d MMM yyyy")}
          </p>
        </div>

        <p className="text-sm text-muted-foreground">
          Use this for <span className="font-semibold text-foreground">returned goods</span> or <span className="font-semibold text-foreground">data entry mistakes</span>. This permanently removes the debt and all its payment records.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={loading}>Cancel</Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={loading}
            className="px-8"
          >
            {loading ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Debt PDF download — premium dark-header design ────────────────────────
async function downloadDebtPdf(debtId: string, shopId: string) {
  toast.loading("Generating statement…", { id: "debt-pdf" });
  try {
    const [shopsData, debt] = await Promise.all([
      customFetch<any[]>("/api/shops"),
      customFetch<any>(`/api/debts/${debtId}`),
    ]);
    const shops: any[] = Array.isArray(shopsData) ? shopsData : [];
    const shop = shops.find((s: any) => s.id === shopId)
      ?? shops.find((s: any) => s.id === debt?.shopId)
      ?? shops[0]
      ?? { name: "GreenLink", id: shopId };
    const payments: any[] = debt?.payments ?? [];
    const items: any[]    = debt?.items    ?? [];
    const totalPaid = (debt?.totalAmount ?? 0) - (debt?.balance ?? 0);
    const openedDate = format(new Date(debt?.createdAt), "dd MMM yyyy");
    const daysOpen   = differenceInDays(new Date(), new Date(debt?.createdAt));
    const generatedAt = format(new Date(), "dd MMM yyyy, h:mm a");

    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const ML = 16, MR = 16;
    const CW = W - ML - MR;

    type RGB = [number, number, number];
    // Clean, print-friendly palette
    const GREEN:   RGB = [5,  150, 105];   // emerald-600
    const GRNLT:   RGB = [209, 250, 229];  // emerald-100
    const SLATE:   RGB = [30,  41,  59];   // slate-800
    const WHITE:   RGB = [255, 255, 255];
    const LGRAY:   RGB = [248, 250, 252];  // slate-50
    const MGRAY:   RGB = [100, 116, 139];  // slate-500
    const BORD:    RGB = [226, 232, 240];  // slate-200
    const RED:     RGB = [220,  38,  38];  // red-600
    const ORANGE:  RGB = [234,  88,  12];  // orange-600

    const isPaid    = debt?.status === "paid";
    const isPartial = debt?.status === "partial";
    const statusColor: RGB = isPaid ? GREEN : isPartial ? ORANGE : RED;
    const statusLabel = isPaid ? "PAID IN FULL" : isPartial ? "PARTIALLY PAID" : "OUTSTANDING";

    // ── Load shop logo ─────────────────────────────────────────────────────
    const shopIsGreenlink = !(shop?.id ?? "").includes("sunrise") && !(shop?.name ?? "").toLowerCase().includes("sunrise");
    const logoUrl = shopIsGreenlink ? "/logo-greenlink.jpg" : "/logo-sunrise.jpg";
    let logoBase64 = "";
    let logoNatW = 0;
    let logoNatH = 0;
    try {
      const resp = await fetch(logoUrl);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      await new Promise<void>(resolve => {
        const img = new Image();
        img.onload  = () => { logoNatW = img.naturalWidth; logoNatH = img.naturalHeight; resolve(); };
        img.onerror = () => resolve();
        img.src = blobUrl;
      });
      URL.revokeObjectURL(blobUrl);
      logoBase64 = await new Promise<string>(resolve => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
    } catch { /* logo optional */ }

    // ── Shared page chrome ─────────────────────────────────────────────────
    function drawHeader(isFirst: boolean) {
      doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, "F");
      // Top green stripe
      doc.setFillColor(...GREEN); doc.rect(0, 0, W, 3, "F");

      if (isFirst) {
        // Logo
        const LOGO_H = 18;
        if (logoBase64 && logoNatW > 0) {
          const scale = Math.min(40 / logoNatW, LOGO_H / logoNatH);
          const dW = logoNatW * scale, dH = logoNatH * scale;
          doc.addImage(logoBase64, "JPEG", ML, 7, dW, dH);
        }
        // Shop name
        doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(...SLATE);
        doc.text(shop?.name ?? "Our Shop", ML, 12);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7.5); doc.setTextColor(...MGRAY);
        let sx = 17;
        if (shop?.address)       { doc.text(shop.address,       ML, sx); sx += 4; }
        if (shop?.ownerWhatsapp) { doc.text(shop.ownerWhatsapp, ML, sx); sx += 4; }
        if (shop?.email)         { doc.text(shop.email,         ML, sx); }

        // Document type — right
        doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...GREEN);
        doc.text("DEBT STATEMENT", W - MR, 10, { align: "right" });
        doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...SLATE);
        doc.text(`#${(debt?.id ?? "").slice(0,8).toUpperCase()}`, W - MR, 18, { align: "right" });
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MGRAY);
        doc.text(`Generated: ${generatedAt}`, W - MR, 23, { align: "right" });

        // Divider
        doc.setDrawColor(...BORD); doc.setLineWidth(0.4);
        doc.line(ML, 28, W - MR, 28);
      } else {
        // Compact continuation header
        doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MGRAY);
        const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
        doc.text(`${shop?.name ?? ""}  ·  #${(debt?.id ?? "").slice(0,8).toUpperCase()}  ·  ${debt?.customerName ?? ""}  ·  continued`, ML, 9);
        doc.text(`Page ${pg}`, W - MR, 9, { align: "right" });
        doc.setDrawColor(...BORD); doc.setLineWidth(0.3);
        doc.line(ML, 12, W - MR, 12);
      }
    }

    function drawFooter() {
      doc.setDrawColor(...BORD); doc.setLineWidth(0.3);
      doc.line(ML, H - 12, W - MR, H - 12);
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(...MGRAY);
      doc.text("This statement is generated for record-keeping purposes only.", ML, H - 7);
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...GREEN);
      doc.text(shop?.name ?? "", W - MR, H - 7, { align: "right" });
    }

    function sectionLabel(sy: number, label: string) {
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...GREEN);
      doc.text(label, ML, sy);
      doc.setDrawColor(...GRNLT); doc.setLineWidth(0.6);
      doc.line(ML, sy + 1.5, W - MR, sy + 1.5);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PAGE 1
    // ══════════════════════════════════════════════════════════════════════
    drawHeader(true);
    let y = 34;

    // ── Customer + summary two-column block ───────────────────────────────
    const LBW = (CW - 5) / 2;
    const RBW = CW - LBW - 5;
    const LBX = ML, RBX = ML + LBW + 5;
    const CARD_H = 36;

    // Customer card — white with green left border
    doc.setFillColor(...LGRAY); doc.setDrawColor(...BORD); doc.setLineWidth(0.3);
    doc.roundedRect(LBX, y, LBW, CARD_H, 1.5, 1.5, "FD");
    doc.setFillColor(...GREEN); doc.roundedRect(LBX, y, 3.5, CARD_H, 1.5, 1.5, "F");
    doc.rect(LBX + 3.5, y, 3, CARD_H, "F"); // square off right side of stripe

    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...MGRAY);
    doc.text("CUSTOMER", LBX + 8, y + 7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...SLATE);
    doc.text(debt?.customerName ?? "—", LBX + 8, y + 16, { maxWidth: LBW - 12 });
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MGRAY);
    if (debt?.customerPhone) { doc.text(debt.customerPhone, LBX + 8, y + 23); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MGRAY);
    doc.text(`Opened: ${openedDate}  ·  ${daysOpen}d ago`, LBX + 8, y + 29);
    // Status pill
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...statusColor);
    doc.text(`● ${statusLabel}`, LBX + 8, y + 35);

    // Summary card — green-tinted
    doc.setFillColor(...GRNLT); doc.setDrawColor(167, 243, 208); doc.setLineWidth(0.3);
    doc.roundedRect(RBX, y, RBW, CARD_H, 1.5, 1.5, "FD");

    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...GREEN);
    doc.text("DEBT SUMMARY", RBX + 6, y + 7);

    const summaryRows = [
      { label: "Total Debt",  value: `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`, color: SLATE   },
      { label: "Amount Paid", value: `KES ${totalPaid.toLocaleString("en-KE")}`,                color: GREEN   },
      { label: "Balance Due", value: `KES ${(debt?.balance ?? 0).toLocaleString("en-KE")}`,     color: isPaid ? GREEN : statusColor },
    ];
    summaryRows.forEach((row, i) => {
      const ry = y + 14 + i * 7.5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...MGRAY);
      doc.text(row.label, RBX + 6, ry);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...(row.color as RGB));
      doc.text(row.value, RBX + RBW - 5, ry, { align: "right" });
    });

    y += CARD_H + 10;

    // ── Items table ───────────────────────────────────────────────────────
    if (items.length > 0) {
      sectionLabel(y, "ITEMS — LINKED SALE");
      y += 6;
      autoTable(doc, {
        startY: y, margin: { left: ML, right: MR, bottom: 16 },
        showHead: "firstPage",
        head: [["#", "Product / Description", "Qty", "Unit Price (KES)", "Total (KES)"]],
        body: items.map((it: any, i: number) => [
          String(i + 1),
          it.productName ?? it.name ?? "—",
          String(it.qty ?? it.quantity ?? 1),
          Number(it.unitPrice ?? 0).toLocaleString("en-KE"),
          Number(it.totalPrice ?? it.total ?? 0).toLocaleString("en-KE"),
        ]),
        headStyles: { fillColor: SLATE, textColor: WHITE, fontStyle: "bold", fontSize: 7.5,
          cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
        bodyStyles: { fontSize: 8, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
          textColor: SLATE, lineColor: BORD, lineWidth: 0.2 },
        alternateRowStyles: { fillColor: LGRAY },
        columnStyles: {
          0: { cellWidth: 14, halign: "center", fontStyle: "bold", textColor: MGRAY },
          1: { cellWidth: "auto" },
          2: { cellWidth: 14, halign: "right" },
          3: { cellWidth: 36, halign: "right", textColor: MGRAY },
          4: { cellWidth: 38, halign: "right", fontStyle: "bold", textColor: GREEN },
        },
        tableLineColor: BORD, tableLineWidth: 0.2,
        didDrawPage: (data: any) => { if (data.pageNumber > 1) drawHeader(false); },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // ── Payment history ───────────────────────────────────────────────────
    sectionLabel(y, "PAYMENT HISTORY");
    y += 6;

    type HistRow = { cells: string[]; isOpened: boolean };
    const histRows: HistRow[] = [];
    histRows.push({
      cells: [format(new Date(debt?.createdAt), "dd MMM yyyy, HH:mm"), "System", "Debt Opened",
        `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`,
        `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`],
      isOpened: true,
    });
    let running = debt?.totalAmount ?? 0;
    for (const p of payments) {
      running -= p.amount;
      histRows.push({
        cells: [format(new Date(p.paidAt), "dd MMM yyyy, HH:mm"), p.recordedBy || "—", "Payment Received",
          `KES ${Number(p.amount).toLocaleString("en-KE")}`,
          `KES ${Math.max(0, running).toLocaleString("en-KE")}`],
        isOpened: false,
      });
    }
    if (histRows.length === 1) {
      histRows.push({ cells: ["—", "—", "No payments recorded yet", "—", "—"], isOpened: false });
    }

    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR, bottom: 16 },
      showHead: "firstPage",
      head: [["Date & Time", "Recorded By", "Description", "Amount (KES)", "Balance (KES)"]],
      body: histRows.map(r => r.cells),
      headStyles: { fillColor: SLATE, textColor: WHITE, fontStyle: "bold", fontSize: 7.5,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
      bodyStyles: { fontSize: 8, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
        textColor: SLATE, lineColor: BORD, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: LGRAY },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 28 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 34, halign: "right" },
        4: { cellWidth: 36, halign: "right", fontStyle: "bold" },
      },
      didParseCell: (data: any) => {
        if (data.section !== "body") return;
        const row = histRows[data.row.index];
        if (!row) return;
        if (row.isOpened) { data.cell.styles.textColor = [100, 116, 139]; data.cell.styles.fontStyle = "italic"; }
        else if (data.column.index === 3) { data.cell.styles.textColor = GREEN; data.cell.styles.fontStyle = "bold"; }
        else if (data.column.index === 4) { data.cell.styles.textColor = isPaid ? GREEN : statusColor; }
      },
      didDrawPage: (data: any) => { if (data.pageNumber > 1) drawHeader(false); },
      tableLineColor: BORD, tableLineWidth: 0.2,
    });
    y = (doc as any).lastAutoTable.finalY + 8;

    // ── Clean summary bar ─────────────────────────────────────────────────
    const BS_H = 18;
    if (y + BS_H > H - 20) { doc.addPage(); drawHeader(false); y = 18; }

    doc.setFillColor(...LGRAY); doc.setDrawColor(...BORD); doc.setLineWidth(0.3);
    doc.roundedRect(ML, y, CW, BS_H, 2, 2, "FD");
    // Green left accent
    doc.setFillColor(...GREEN); doc.roundedRect(ML, y, 4, BS_H, 2, 2, "F");
    doc.rect(ML + 4, y, 2, BS_H, "F");

    const cols3 = [
      { label: "TOTAL DEBT",  value: `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`, vc: SLATE },
      { label: "PAID",        value: `KES ${totalPaid.toLocaleString("en-KE")}`,                vc: GREEN },
      { label: "BALANCE DUE", value: `KES ${(debt?.balance ?? 0).toLocaleString("en-KE")}`,     vc: isPaid ? GREEN : statusColor },
    ];
    const colW = CW / 3;
    cols3.forEach((col, i) => {
      const cx = ML + colW * i + colW / 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...GREEN);
      doc.text(col.label, cx, y + 6, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...(col.vc as RGB));
      doc.text(col.value, cx, y + 13, { align: "center" });
      if (i < 2) {
        doc.setDrawColor(...BORD); doc.setLineWidth(0.3);
        doc.line(ML + colW * (i + 1), y + 3, ML + colW * (i + 1), y + BS_H - 3);
      }
    });

    // Footer on all pages
    const numPages = (doc as any).internal.getNumberOfPages();
    for (let p = 1; p <= numPages; p++) { doc.setPage(p); drawFooter(); }

    const safeName = (debt?.customerName ?? "customer").replace(/[^a-z0-9]/gi, "_");
    doc.save(`DebtStatement_${safeName}_${format(new Date(), "yyyyMMdd")}.pdf`);
    toast.success("Statement downloaded!", { id: "debt-pdf" });
  } catch (err) {
    console.error("Debt PDF error:", err);
    toast.error("Failed to generate statement", { id: "debt-pdf" });
  }
}

function DebtDownloadButton({ debt }: { debt: any }) {
  const [loading, setLoading] = useState(false);
  const shopId = localStorage.getItem("greenlink_shopId") || "";

  const handle = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await downloadDebtPdf(debt.id, shopId);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={handle}
      disabled={loading}
      title="Download debt statement PDF"
      className="flex items-center gap-1 h-8 px-3 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-50"
    >
      {loading ? (
        <span className="w-3 h-3 rounded-full border border-primary border-t-transparent animate-spin" />
      ) : (
        <Download className="h-3 w-3" />
      )}
      PDF
    </button>
  );
}

// ─── Debt Detail Panel (right-side two-pane) ──────────────────────────────
type DetailTab = "overview" | "payments" | "items";

function DebtDetailPanel({
  debt,
  isOwner,
  onClose,
}: {
  debt: any;
  isOwner: boolean;
  onClose: () => void;
}) {
  const [detailTab, setDetailTab] = useState<DetailTab>("overview");
  const { data, isLoading } = useGetDebt(debt.id, { query: { staleTime: 30_000 } });
  const payments: any[] = (data as any)?.payments ?? [];
  const items: any[]    = (data as any)?.items    ?? [];

  const isPaid    = debt.status === "paid";
  const isPartial = debt.status === "partial";
  const totalPaid = (debt.totalAmount ?? 0) - (debt.balance ?? 0);
  const paidPct   = debt.totalAmount > 0 ? Math.round((totalPaid / debt.totalAmount) * 100) : 0;
  const daysOpen  = differenceInDays(new Date(), new Date(debt.createdAt));
  const isOverdue = !isPaid && daysOpen > 30;

  const statusLabel = isPaid ? "PAID" : isPartial ? "PARTIAL" : "UNPAID";
  const statusBadgeCss = isPaid
    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
    : isOverdue
    ? "bg-red-500/15 text-red-400 border-red-500/25"
    : isPartial
    ? "bg-orange-500/15 text-orange-400 border-orange-500/25"
    : "bg-destructive/15 text-destructive border-destructive/25";
  const statusColor = isPaid ? "text-emerald-400" : isOverdue ? "text-red-400" : isPartial ? "text-orange-400" : "text-destructive";
  const avatarBg    = isPaid ? "bg-emerald-500/15 text-emerald-400" : isOverdue ? "bg-red-500/15 text-red-400" : isPartial ? "bg-orange-500/15 text-orange-400" : "bg-destructive/15 text-destructive";

  const initials = debt.customerName.split(" ").map((w: string) => w[0] ?? "").slice(0, 2).join("").toUpperCase();

  const tabs = [
    { id: "overview"  as DetailTab, label: "Overview" },
    { id: "payments"  as DetailTab, label: isLoading ? "Payments" : `Payments (${payments.length})` },
    { id: "items"     as DetailTab, label: isLoading ? "Items"    : `Items (${items.length})` },
  ];

  return (
    <div className="flex flex-col h-full bg-card">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-bold font-mono text-foreground truncate">
            Debt #{debt.id.slice(0, 8).toUpperCase()}
          </span>
          <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide border shrink-0", statusBadgeCss)}>
            {statusLabel}
          </span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 ml-2"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setDetailTab(t.id)}
            className={cn(
              "flex-1 py-2.5 text-xs font-semibold transition-colors border-b-2 -mb-px",
              detailTab === t.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">

        {/* ── Overview ── */}
        {detailTab === "overview" && (
          <div className="p-4 space-y-4">
            {/* Customer block */}
            <div className="flex items-center gap-3">
              <div className={cn("w-12 h-12 rounded-2xl flex items-center justify-center text-base font-bold shrink-0", avatarBg)}>
                {initials}
              </div>
              <div className="min-w-0">
                <p className="font-bold text-foreground">{toTitleCase(debt.customerName)}</p>
                {debt.customerPhone ? (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Phone className="h-3 w-3 shrink-0" />{debt.customerPhone}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground/30 mt-0.5 italic">No phone number</p>
                )}
                <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                  {daysOpen}d ago{isOverdue && <span className="text-red-400 font-semibold"> · Overdue</span>}
                </p>
              </div>
            </div>

            {/* Amounts 2×2 */}
            <div className="grid grid-cols-2 gap-2.5">
              <div className="bg-muted/30 rounded-xl p-3 border border-border/40">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Total Amount</p>
                <p className="text-sm font-bold font-mono text-foreground">{formatKES(debt.totalAmount)}</p>
              </div>
              <div className="bg-emerald-500/5 rounded-xl p-3 border border-emerald-500/15">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Amount Paid</p>
                <p className="text-sm font-bold font-mono text-emerald-400">{formatKES(totalPaid)}</p>
              </div>
              <div className={cn("rounded-xl p-3 border", isPaid ? "bg-emerald-500/5 border-emerald-500/15" : "bg-destructive/5 border-destructive/15")}>
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Balance Due</p>
                <p className={cn("text-sm font-bold font-mono", statusColor)}>{formatKES(debt.balance)}</p>
              </div>
              <div className="bg-muted/30 rounded-xl p-3 border border-border/40">
                <p className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">Status</p>
                <span className={cn("text-xs font-bold", statusColor)}>{statusLabel}</span>
              </div>
            </div>

            {/* Progress */}
            {!isPaid && (
              <div>
                <div className="flex justify-between text-[10px] mb-1.5 text-muted-foreground">
                  <span>Paid {paidPct}%</span>
                  <span className="font-mono">{formatKES(totalPaid)} / {formatKES(debt.totalAmount)}</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={cn("h-full rounded-full transition-all", isPartial ? "bg-orange-400" : "bg-primary")}
                    style={{ width: `${paidPct}%` }}
                  />
                </div>
              </div>
            )}

            {/* Metadata rows */}
            <div className="rounded-xl border border-border overflow-hidden">
              {[
                { label: "Debt Ref",   value: debt.id.slice(0, 8).toUpperCase() },
                { label: "Sale ID",    value: debt.saleId ? debt.saleId.slice(0, 14) + "…" : "—" },
                { label: "Created At", value: format(new Date(debt.createdAt), "d MMM yyyy, HH:mm") },
                ...(debt.paidAt ? [{ label: "Paid At", value: format(new Date(debt.paidAt), "d MMM yyyy") }] : []),
                ...(debt.notes ? [{ label: "Notes", value: debt.notes }] : []),
              ].map((row, i) => (
                <div key={row.label} className={cn("flex items-start gap-3 px-3 py-2.5", i > 0 && "border-t border-border/60")}>
                  <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground w-[68px] shrink-0 mt-0.5 leading-relaxed">{row.label}</span>
                  <span className="text-xs text-foreground font-mono break-all">{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Payments ── */}
        {detailTab === "payments" && (
          <div className="p-4 space-y-2">
            {isLoading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map((i) => <div key={i} className="h-16 bg-muted/40 rounded-xl" />)}
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 p-3 rounded-xl bg-destructive/5 border border-destructive/20">
                  <div className="w-8 h-8 rounded-full bg-destructive/15 flex items-center justify-center shrink-0">
                    <Banknote className="h-3.5 w-3.5 text-destructive" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold">Debt Opened</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(debt.createdAt), "d MMM yyyy, HH:mm")}</p>
                  </div>
                  <p className="text-xs font-bold font-mono text-destructive shrink-0">{formatKES(debt.totalAmount)}</p>
                </div>

                {payments.length === 0 && (
                  <p className="text-xs text-muted-foreground/40 text-center py-6 italic">No payments recorded yet</p>
                )}

                {payments.map((p: any, i: number) => (
                  <div key={p.id ?? i} className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-xs font-semibold">Payment Received</p>
                        {p.recordedBy && (
                          <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                            <User2 className="h-2.5 w-2.5" />{p.recordedBy}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{format(new Date(p.paidAt), "d MMM yyyy, HH:mm")}</p>
                    </div>
                    <p className="text-xs font-bold font-mono text-emerald-400 shrink-0">+{formatKES(p.amount)}</p>
                  </div>
                ))}

                <div className="mt-1 p-3 rounded-xl bg-muted/30 border border-border flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground/60">Balance</p>
                    <p className={cn("text-sm font-bold font-mono", debt.balance === 0 ? "text-emerald-400" : statusColor)}>
                      {formatKES(debt.balance)}
                    </p>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Items ── */}
        {detailTab === "items" && (
          <div className="p-4">
            {isLoading ? (
              <div className="space-y-2 animate-pulse">
                {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted/40 rounded-xl" />)}
              </div>
            ) : items.length === 0 ? (
              <p className="text-xs text-muted-foreground/40 text-center py-8 italic">No items linked to this debt</p>
            ) : (
              <div className="space-y-2">
                <div className="rounded-xl border border-border overflow-hidden">
                  <div className="grid grid-cols-[1fr_32px_minmax(90px,auto)_minmax(90px,auto)] bg-muted/50 border-b border-border">
                    <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground">Product</div>
                    <div className="px-1 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-right">Qty</div>
                    <div className="px-2 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-right">Unit</div>
                    <div className="px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-muted-foreground text-right">Total</div>
                  </div>
                  {items.map((item: any, i: number) => (
                    <div key={i} className={cn("grid grid-cols-[1fr_32px_minmax(90px,auto)_minmax(90px,auto)] items-center", i > 0 && "border-t border-border/50")}>
                      <div className="px-3 py-2.5 text-xs font-medium truncate">{item.productName}</div>
                      <div className="px-1 py-2.5 text-xs text-right text-muted-foreground">{item.qty ?? item.quantity}</div>
                      <div className="px-2 py-2.5 text-xs text-right text-muted-foreground font-mono whitespace-nowrap">{formatKES(item.unitPrice)}</div>
                      <div className="px-3 py-2.5 text-xs text-right font-bold font-mono text-primary whitespace-nowrap">{formatKES(item.totalPrice ?? item.total)}</div>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-primary/10 border border-primary/20">
                  <span className="text-xs font-bold">Total</span>
                  <span className="text-sm font-bold font-mono text-primary">{formatKES(debt.totalAmount)}</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Actions footer */}
      <div className="border-t border-border p-3 shrink-0 space-y-2">
        <div className="flex gap-2 flex-wrap">
          {!isPaid && <PaymentDialog debt={debt} />}
          <DebtDownloadButton debt={debt} />
          {isOwner && !isPaid && <MarkPaidButton debt={debt} />}
          {isOwner && <DeleteDebtDialog debt={debt} onDeleted={onClose} />}
        </div>
        {debt.customerPhone && !isPaid && (
          <a
            href={`https://wa.me/${debt.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${debt.customerName}, you have an outstanding balance of ${formatKES(debt.balance)} at our shop. Please settle at your earliest convenience. Thank you!`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 w-full h-8 rounded-xl border border-[#25D366]/30 text-[#25D366] bg-[#25D366]/5 hover:bg-[#25D366]/15 text-xs font-semibold transition-colors"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            Send WhatsApp Reminder
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Legacy panel kept for internal use only ──────────────────────────────
function DebtHistoryPanel({ debtId }: { debtId: string }) {
  const { data, isLoading } = useGetDebt(debtId, { query: { enabled: !!debtId } });

  if (isLoading) {
    return (
      <div className="px-4 py-4 space-y-2 animate-pulse">
        {[1, 2].map(i => (
          <div key={i} className="flex gap-3 items-center">
            <div className="w-8 h-8 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-1">
              <div className="h-3 w-24 bg-muted rounded" />
              <div className="h-2 w-16 bg-muted rounded" />
            </div>
            <div className="h-3 w-16 bg-muted rounded" />
          </div>
        ))}
      </div>
    );
  }

  const payments = (data as any)?.payments || [];
  const items: { productName: string; quantity: number; unitPrice: number; totalPrice: number; discount?: number | null }[] = (data as any)?.items || [];

  return (
    <div className="border-t border-border/30 bg-muted/10 px-4 py-4 space-y-4">

      {/* Products taken */}
      {items.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-2 flex items-center gap-1.5">
            <ShoppingBasket className="h-3 w-3" />Items Taken
          </p>
          <div className="rounded-xl border border-border/40 overflow-hidden bg-background/40">
            {items.map((item, i) => (
              <div
                key={i}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5",
                  i > 0 && "border-t border-border/30"
                )}
              >
                <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                  <Package className="h-3.5 w-3.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{item.productName}</p>
                  <p className="text-[10px] text-muted-foreground/60 font-mono">
                    {item.quantity} × {formatKES(item.unitPrice)}
                    {item.discount ? <span className="ml-1.5 text-orange-400">−{item.discount}%</span> : null}
                  </p>
                </div>
                <p className="text-xs font-bold font-mono text-foreground shrink-0">{formatKES(item.totalPrice)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
      <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/50 mb-3">
        Payment Timeline
      </p>

      {/* Original debt row */}
      <div className="relative pl-7 pb-3 overflow-hidden">
        <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-destructive/15 border border-destructive/30 flex items-center justify-center">
          <Banknote className="h-2.5 w-2.5 text-destructive" />
        </div>
        {payments.length > 0 && <div className="absolute left-2.5 top-5 w-px bottom-0 bg-border/40" />}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-foreground">Debt opened</p>
            <p className="text-[10px] text-muted-foreground/60">
              {data ? format(new Date((data as any).createdAt), "d MMM yyyy, HH:mm") : "—"}
            </p>
          </div>
          <p className="text-xs font-bold text-destructive font-mono">{formatKES((data as any)?.totalAmount ?? 0)}</p>
        </div>
      </div>

      {/* Payment rows */}
      {payments.map((payment: any, i: number) => (
        <div key={payment.id} className="relative pl-7 pb-3 overflow-hidden">
          <div className="absolute left-0 top-1 w-5 h-5 rounded-full bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center">
            <CheckCircle2 className="h-2.5 w-2.5 text-emerald-400" />
          </div>
          {i < payments.length - 1 && <div className="absolute left-2.5 top-5 w-px bottom-0 bg-border/40" />}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-foreground">Payment received</p>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-[10px] text-muted-foreground/60">
                  {format(new Date(payment.paidAt), "d MMM yyyy, HH:mm")}
                </p>
                {payment.recordedBy && (
                  <p className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
                    <User2 className="h-2 w-2" />{payment.recordedBy}
                  </p>
                )}
              </div>
            </div>
            <p className="text-xs font-bold text-emerald-400 font-mono">+{formatKES(payment.amount)}</p>
          </div>
        </div>
      ))}

      {payments.length === 0 && (
        <p className="text-xs text-muted-foreground/40 pl-7 italic">No payments recorded yet</p>
      )}

      {/* Summary */}
      <div className="mt-2 pt-3 border-t border-border/30 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground/50">Balance remaining</p>
          <p className={cn("text-sm font-bold font-mono", (data as any)?.balance === 0 ? "text-emerald-400" : "text-destructive")}>
            {formatKES((data as any)?.balance ?? 0)}
          </p>
        </div>
      </div>
      </div>
    </div>
  );
}

type DebtTab = "unpaid" | "partial" | "overdue" | "paid" | "all";

interface CustomerGroup {
  key: string;
  customerName: string;
  customerPhone: string;
  debts: any[];
  activeDebts: any[];
  totalBalance: number;
  totalAmount: number;
  worstStatus: "unpaid" | "partial" | "paid";
  isOverdue: boolean;
}

// ── Add Debt Dialog ───────────────────────────────────────────────────────────
function AddDebtDialog({ shopId, onAdded }: { shopId: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => { setCustomerName(""); setCustomerPhone(""); setAmount(""); setNotes(""); };

  const handleSave = async () => {
    const name = toTitleCase(customerName);
    if (!name) { toast.error("Customer name required"); return; }
    const total = parseFloat(amount);
    if (!total || total <= 0) { toast.error("Enter a valid amount"); return; }

    setSaving(true);
    try {
      await customFetch("/api/debts", {
        method: "POST",
        body: JSON.stringify({
          shopId,
          customerName: name,
          customerPhone: customerPhone.trim(),
          totalAmount: total,
          notes: notes.trim() || undefined,
        }),
      });
      toast.success(`Debt of ${amount} recorded for ${name}`);
      onAdded();
      setOpen(false);
      reset();
    } catch {
      toast.error("Failed to record debt — please retry");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90 transition-colors"
      >
        <UserPlus className="h-3.5 w-3.5" />
        New Debt
      </button>

      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); reset(); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="h-4 w-4 text-primary" />
              Record a Debt
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Customer name *</Label>
              <CustomerAutocomplete
                shopId={shopId}
                value={customerName}
                onChange={(v) => { setCustomerName(v); }}
                onSelect={(c: SelectedCustomer) => {
                  setCustomerName(c.name);
                  if (c.phone) setCustomerPhone(c.phone);
                }}
                showBalanceWarning
                selectedBalance={undefined}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Phone (optional)</Label>
              <div className="relative">
                <User2 className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="tel"
                  placeholder="+254 7XX XXX XXX"
                  value={customerPhone}
                  onChange={e => setCustomerPhone(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 pl-9 pr-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Amount (KES) *</Label>
              <input
                type="number"
                min={1}
                placeholder="e.g. 1500"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                className="flex h-9 w-full rounded-md border border-border/60 bg-muted/30 px-3 py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/60"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs font-bold uppercase tracking-wider">Notes (optional)</Label>
              <textarea
                rows={2}
                placeholder="What is this debt for?"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <DialogFooter>
            <button
              onClick={() => { setOpen(false); reset(); }}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!customerName.trim() || !amount || saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {saving ? (
                <span className="w-3.5 h-3.5 rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              Record Debt
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function Debts() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role   = localStorage.getItem("greenlink_role")   || "";
  const isOwner = role === "owner";

  const [search, setSearch]             = useState("");
  const debouncedSearch                 = useDebounce(search, 100);
  const [tab, setTab]                   = useState<DebtTab>("unpaid");
  const [selectedDebt, setSelectedDebt] = useState<any>(null);
  const [bulkRemindOpen, setBulkRemindOpen] = useState(false);

  const qc = useQueryClient();

  const { data: allDebts, isLoading } = useListDebts(
    { shopId },
    { query: { enabled: !!shopId, refetchInterval: 5_000, refetchIntervalInBackground: true } }
  );

  // Keep selectedDebt in sync when data refreshes
  useEffect(() => {
    if (selectedDebt && allDebts) {
      const fresh = (allDebts as any[]).find((d: any) => d.id === selectedDebt.id);
      if (fresh) setSelectedDebt(fresh);
    }
  }, [allDebts]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const debts = (allDebts || []) as any[];
    const active  = debts.filter((d: any) => d.status !== "paid");
    const overdue = active.filter((d: any) => differenceInDays(new Date(), new Date(d.createdAt)) > 30);
    const partial = debts.filter((d: any) => d.status === "partial");
    const paid    = debts.filter((d: any) => d.status === "paid");
    const unpaid  = debts.filter((d: any) => d.status === "unpaid");
    return {
      totalBalance:  active.reduce((s: number, d: any)  => s + (d.balance     || 0), 0),
      totalDebt:     debts.reduce((s: number, d: any)   => s + (d.totalAmount || 0), 0),
      activeCount:   active.length,
      overdueCount:  overdue.length,
      overdueBalance: overdue.reduce((s: number, d: any) => s + (d.balance || 0), 0),
      overdueWithPhone: overdue.filter((d: any) => d.customerPhone),
      partialCount:  partial.length,
      partialBalance: partial.reduce((s: number, d: any) => s + (d.balance || 0), 0),
      paidCount:     paid.length,
      paidTotal:     paid.reduce((s: number, d: any)    => s + (d.totalAmount || 0), 0),
      unpaidCount:   unpaid.length,
      totalCount:    debts.length,
    };
  }, [allDebts]);

  const filtered = useMemo(() => {
    const debts = (allDebts || []) as any[];
    let list = debts;
    if (tab === "overdue") {
      list = debts.filter((d: any) => d.status !== "paid" && differenceInDays(new Date(), new Date(d.createdAt)) > 30);
    } else if (tab !== "all") {
      list = debts.filter((d: any) => d.status === tab);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter((d: any) =>
        d.customerName.toLowerCase().includes(q) ||
        (d.customerPhone || "").includes(q)
      );
    }
    return [...list].sort((a: any, b: any) => b.balance - a.balance);
  }, [allDebts, tab, debouncedSearch]);

  const grouped = useMemo(() => {
    const map = new Map<string, {
      key: string;
      customerName: string;
      customerPhone: string;
      debts: any[];
      activeDebts: any[];
      totalAmount: number;
      totalBalance: number;
      worstStatus: "unpaid" | "partial" | "paid";
      isOverdue: boolean;
    }>();

    for (const debt of filtered) {
      const key = debt.customerName?.toLowerCase().trim() || "unknown";
      if (!map.has(key)) {
        map.set(key, {
          key,
          customerName: debt.customerName || "Unknown",
          customerPhone: debt.customerPhone || "",
          debts: [],
          activeDebts: [],
          totalAmount: 0,
          totalBalance: 0,
          worstStatus: "paid",
          isOverdue: false,
        });
      }
      const g = map.get(key)!;
      g.debts.push(debt);
      g.totalAmount += debt.totalAmount || 0;
      g.totalBalance += debt.balance || 0;
      if (debt.status !== "paid") {
        g.activeDebts.push(debt);
        const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
        if (daysAgo > 30) g.isOverdue = true;
      }
      const statusRank = { unpaid: 2, partial: 1, paid: 0 } as Record<string, number>;
      if ((statusRank[debt.status] ?? 0) > (statusRank[g.worstStatus] ?? 0)) {
        g.worstStatus = debt.status as "unpaid" | "partial" | "paid";
      }
      // prefer a phone number if not set yet
      if (!g.customerPhone && debt.customerPhone) g.customerPhone = debt.customerPhone;
    }

    return Array.from(map.values());
  }, [filtered]);

  const TABS: { value: DebtTab; label: string; count: number }[] = [
    { value: "unpaid",  label: "Unpaid",       count: stats.unpaidCount  },
    { value: "partial", label: "Partial",      count: stats.partialCount },
    { value: "overdue", label: "Overdue 30d+", count: stats.overdueCount },
    { value: "paid",    label: "Paid",         count: stats.paidCount    },
    { value: "all",     label: "All",          count: stats.totalCount   },
  ];

  const STAT_CARDS = [
    { label: "Total Debt", value: formatKES(stats.totalBalance), sub: `Across ${stats.activeCount} records`,  Icon: TrendingDown,  iconBg: "bg-destructive/15",                                                iconColor: "text-destructive",                                                valueCss: "text-destructive"      },
    { label: "Overdue",    value: formatKES(stats.overdueBalance), sub: `${stats.overdueCount} records`,      Icon: Clock,         iconBg: stats.overdueCount > 0 ? "bg-orange-500/15"  : "bg-muted/30",    iconColor: stats.overdueCount > 0 ? "text-orange-400"  : "text-muted-foreground/30", valueCss: stats.overdueCount > 0 ? "text-orange-400"  : "text-muted-foreground/30" },
    { label: "Partial",    value: formatKES(stats.partialBalance), sub: `${stats.partialCount} records`,      Icon: AlertTriangle, iconBg: stats.partialCount > 0 ? "bg-yellow-500/15"  : "bg-muted/30",    iconColor: stats.partialCount > 0 ? "text-yellow-400" : "text-muted-foreground/30", valueCss: stats.partialCount > 0 ? "text-yellow-400" : "text-muted-foreground/30" },
    { label: "Paid",       value: formatKES(stats.paidTotal),     sub: `${stats.paidCount} records`,          Icon: CheckCircle2,  iconBg: "bg-emerald-500/15",                                               iconColor: "text-emerald-400",                                                valueCss: "text-emerald-400"      },
  ];

  return (
    <div className="flex h-full overflow-hidden">

      {/* ── Left panel ──────────────────────────────────────────────── */}
      <div className={cn(
        "flex flex-col min-w-0 overflow-hidden transition-all duration-200",
        selectedDebt ? "hidden lg:flex lg:flex-1" : "flex-1"
      )}>

      {/* Sticky header */}
      <div className="shrink-0 border-b border-border bg-card/98 backdrop-blur-sm">
        {/* Title + actions */}
        <div className="flex items-center justify-between px-4 pt-4 pb-3 gap-3">
          <div>
            <h1 className="text-lg font-bold font-display tracking-tight">Manage Debts</h1>
            <p className="text-xs text-muted-foreground mt-0.5">Track customer debts and payments</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {stats.overdueWithPhone.length > 0 && (
              <button
                onClick={() => setBulkRemindOpen(true)}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/25 text-[#25D366] text-xs font-semibold hover:bg-[#25D366]/20 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
                Remind
                <span className="bg-[#25D366]/20 text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                  {stats.overdueWithPhone.length}
                </span>
              </button>
            )}
            <AddDebtDialog shopId={shopId} onAdded={() => qc.invalidateQueries({ queryKey: getListDebtsQueryKey() })} />
          </div>
        </div>

        {/* Search + filter row */}
        <div className="px-4 pb-2 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search by customer name or phone…"
              className="pl-9 h-9 text-sm bg-muted/40 border-border/60 rounded-xl"
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1.5 px-4 pb-3 overflow-x-auto scrollbar-hide">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => { setTab(t.value); setSelectedDebt(null); }}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap",
                tab === t.value
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted/60 text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
              {t.count > 0 && (
                <span className={cn(
                  "text-[10px] font-bold tabular-nums",
                  tab === t.value ? "text-primary-foreground/70" : "text-muted-foreground/60"
                )}>
                  {t.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>{/* end sticky header */}

      {/* ── Stats cards ──────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-2.5 px-4 py-3 border-b border-border/60">
        {STAT_CARDS.map(({ label, value, sub, Icon, iconBg, iconColor, valueCss }) => (
          <div key={label} className="flex items-center gap-3 rounded-xl bg-card border border-border/50 px-3 py-2.5">
            <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center shrink-0", iconBg)}>
              <Icon className={cn("h-4 w-4", iconColor)} />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
              <p className={cn("text-sm font-bold font-mono leading-tight truncate", valueCss)}>{value}</p>
              <p className="text-[10px] text-muted-foreground/50 truncate">{sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Table area ───────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* Column headers — hidden on mobile */}
        {!isLoading && filtered.length > 0 && (
          <div className="hidden sm:grid grid-cols-[auto_1fr_110px_100px_110px_32px] items-center px-4 py-2 border-b border-border/50 bg-muted/20 sticky top-0 z-10">
            <div className="w-9 mr-3" />
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right pr-4">Total Amount</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground text-right pr-4">Balance</div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Status</div>
            <div />
          </div>
        )}

        {/* Loading skeletons */}
        {isLoading ? (
          <div className="divide-y divide-border/40">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                <div className="w-9 h-9 rounded-xl bg-muted/60 shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-32 bg-muted/60 rounded-full" />
                  <div className="h-2.5 w-24 bg-muted/40 rounded-full" />
                </div>
                <div className="hidden sm:block h-3.5 w-20 bg-muted/40 rounded-full" />
                <div className="h-3.5 w-16 bg-muted/50 rounded-full" />
                <div className="hidden sm:block h-6 w-16 bg-muted/30 rounded-full" />
              </div>
            ))}
          </div>

        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 text-emerald-500/20" />
            <p className="text-sm font-semibold">
              {tab === "paid" ? "No paid debts yet" : "All clear!"}
            </p>
            <p className="text-xs opacity-50 text-center px-8">
              {search ? `No results for "${search}"` : `No ${tab !== "all" ? tab + " " : ""}debts found.`}
            </p>
          </div>

        ) : (
          <div className="divide-y divide-border/40">
            {filtered.map((debt: any) => {
              const isPaid    = debt.status === "paid";
              const isPartial = debt.status === "partial";
              const daysAgo   = differenceInDays(new Date(), new Date(debt.createdAt));
              const isOverdue = !isPaid && daysAgo > 30;
              const isSelected = selectedDebt?.id === debt.id;

              const avatarBg =
                isPaid    ? "bg-emerald-500/15 text-emerald-400" :
                isOverdue ? "bg-red-500/15 text-red-400" :
                isPartial ? "bg-orange-500/15 text-orange-400" :
                            "bg-destructive/15 text-destructive";

              const balanceCss =
                isPaid    ? "text-emerald-400" :
                isOverdue ? "text-red-400" :
                isPartial ? "text-orange-400" :
                            "text-destructive";

              const statusBadge =
                isPaid    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25" :
                isOverdue ? "bg-red-500/15 text-red-400 border-red-500/25" :
                isPartial ? "bg-orange-500/15 text-orange-400 border-orange-500/25" :
                            "bg-destructive/15 text-destructive border-destructive/25";

              const statusLabel =
                isOverdue ? "Overdue" :
                isPaid    ? "Paid" :
                isPartial ? "Partial" :
                            "Unpaid";

              const initials = debt.customerName
                .split(" ").map((w: string) => w[0] ?? "").slice(0, 2).join("").toUpperCase();

              const totalPaid = (debt.totalAmount ?? 0) - (debt.balance ?? 0);

              return (
                <div
                  key={debt.id}
                  onClick={() => setSelectedDebt(isSelected ? null : debt)}
                  className={cn(
                    "group cursor-pointer transition-colors",
                    "flex sm:grid sm:grid-cols-[auto_1fr_110px_100px_110px_32px] items-center gap-3 px-4 py-3",
                    isSelected
                      ? "bg-primary/8 border-l-2 border-l-primary"
                      : "hover:bg-muted/30 border-l-2 border-l-transparent"
                  )}
                >
                  {/* Avatar */}
                  <div className={cn("w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0", avatarBg)}>
                    {initials}
                  </div>

                  {/* Name + phone */}
                  <div className="flex-1 sm:flex-none min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate leading-snug">{toTitleCase(debt.customerName)}</p>
                    {debt.customerPhone ? (
                      <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                        <Phone className="h-2.5 w-2.5 shrink-0" />{debt.customerPhone}
                      </p>
                    ) : (
                      <p className="text-[11px] text-muted-foreground/30 mt-0.5 italic">No phone</p>
                    )}
                  </div>

                  {/* Total amount — hidden on mobile */}
                  <div className="hidden sm:block text-right pr-4">
                    <p className="text-sm font-semibold font-mono text-foreground">{formatKES(debt.totalAmount)}</p>
                    <p className="text-[10px] text-muted-foreground/50">Paid: {formatKES(totalPaid)}</p>
                  </div>

                  {/* Balance */}
                  <div className="text-right pr-4 shrink-0">
                    <p className={cn("text-sm font-bold font-mono", balanceCss)}>{formatKES(debt.balance)}</p>
                  </div>

                  {/* Status badge */}
                  <div className="hidden sm:flex items-center">
                    <span className={cn("text-[10px] font-bold px-2 py-0.5 rounded-full border uppercase tracking-wide", statusBadge)}>
                      {statusLabel}
                    </span>
                  </div>

                  {/* Arrow */}
                  <div className="hidden sm:flex items-center justify-center">
                    <ChevronRight className={cn("h-4 w-4 transition-colors", isSelected ? "text-primary" : "text-muted-foreground/30 group-hover:text-muted-foreground")} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Row count */}
        {!isLoading && filtered.length > 0 && (
          <p className="text-[11px] text-muted-foreground/40 text-center py-4">
            Showing {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </p>
        )}
      </div>

      </div>{/* end left panel */}

      {/* ── Right: detail panel (desktop) ────────────────────────────── */}
      {selectedDebt && (
        <div className="hidden lg:flex flex-col w-[420px] xl:w-[460px] shrink-0 border-l border-border">
          <DebtDetailPanel
            debt={selectedDebt}
            isOwner={isOwner}
            onClose={() => setSelectedDebt(null)}
          />
        </div>
      )}

      {/* ── Mobile: full-screen overlay panel ────────────────────────── */}
      {selectedDebt && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedDebt(null)} />
          <div className="relative bg-card rounded-t-2xl flex flex-col shadow-2xl" style={{ maxHeight: "92dvh" }}>
            <div className="w-10 h-1 bg-muted-foreground/20 rounded-full mx-auto mt-2.5 mb-1 shrink-0" />
            <DebtDetailPanel
              debt={selectedDebt}
              isOwner={isOwner}
              onClose={() => setSelectedDebt(null)}
            />
          </div>
        </div>
      )}

      {/* ── Bulk WhatsApp remind dialog ───────────────────────────────── */}
      {bulkRemindOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setBulkRemindOpen(false)}>
          <div className="absolute inset-0 bg-black/60" />
          <div
            className="relative bg-card border border-border rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-xl"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="font-bold text-sm text-foreground flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-[#25D366]" />
                  WhatsApp Reminders
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  {stats.overdueWithPhone.length} overdue customer{stats.overdueWithPhone.length !== 1 ? "s" : ""} with phone numbers
                </p>
              </div>
              <button onClick={() => setBulkRemindOpen(false)} className="text-muted-foreground/50 hover:text-foreground p-1">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-3 space-y-2">
              {stats.overdueWithPhone.map((debt: any) => {
                const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
                const msg = `Hi ${debt.customerName}, you have an outstanding balance of ${formatKES(debt.balance)} at our shop (${daysAgo} days overdue). Please settle at your earliest convenience. Thank you!`;
                const waUrl = `https://wa.me/${debt.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
                return (
                  <a key={debt.id} href={waUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-muted/40 hover:bg-[#25D366]/10 border border-border/50 hover:border-[#25D366]/30 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-destructive/15 flex items-center justify-center shrink-0 text-sm font-bold text-destructive">
                      {debt.customerName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{debt.customerName}</p>
                      <p className="text-[11px] text-muted-foreground">
                        <span className="font-mono font-bold text-destructive">{formatKES(debt.balance)}</span>
                        {" · "}{daysAgo}d overdue
                      </p>
                    </div>
                    <MessageCircle className="h-4 w-4 text-[#25D366] shrink-0" />
                  </a>
                );
              })}
            </div>
            <div className="px-4 py-3 border-t border-border">
              <p className="text-[10px] text-muted-foreground/50 text-center">
                Tap a customer to open WhatsApp with a pre-filled message
              </p>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
