import React, { useState, useMemo } from "react";
import { useListDebts, useRecordDebtPayment, useGetDebt, getListDebtsQueryKey, getListSalesQueryKey, customFetch } from "@workspace/api-client-react";
import { enqueueMutation } from "@/lib/offline-queue";
import { useQueryClient } from "@tanstack/react-query";
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
  ChevronDown, ChevronUp, Banknote, User2, Trash2, Send, BadgeCheck,
  ShoppingBasket, Package, Download,
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

    const { jsPDF } = await import("jspdf");
    const autoTable = (await import("jspdf-autotable")).default;
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const ML = 14, MR = 14;
    const CW = W - ML - MR;

    type RGB = [number, number, number];
    const DARK:    RGB = [10,  10,  10];
    const EMERALD: RGB = [16, 185, 129];   // #10B981
    const DKEMER:  RGB = [5,  150, 105];   // #059669
    const WHITE:   RGB = [255, 255, 255];
    const OFFWHITE:RGB = [249, 250, 251];
    const LGRAY:   RGB = [248, 250, 252];
    const MGRAY:   RGB = [100, 116, 139];
    const DKTXT:   RGB = [15,  23,  42];
    const BORD:    RGB = [220, 226, 234];
    const RED:     RGB = [185,  28,  28];
    const ORANGE:  RGB = [194,  65,  12];

    const statusColor: RGB =
      debt?.status === "paid"    ? DKEMER :
      debt?.status === "partial" ? ORANGE : RED;

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

    // ── Continuation header (pages 2+) ────────────────────────────────────
    function drawContinuationHeader() {
      doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, "F");
      doc.setFillColor(...DARK);  doc.rect(0, 0, W, 9, "F");
      doc.setFillColor(...EMERALD); doc.rect(0, 0, W, 1.8, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(180, 188, 200);
      const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
      doc.text(
        `${shop?.name ?? ""}  ·  DEBT-${(debt?.id ?? "").slice(0,8).toUpperCase()}  ·  ${debt?.customerName ?? ""}  ·  continued`,
        ML, 6.5
      );
      doc.text(`Page ${pg}`, W - MR, 6.5, { align: "right" });
    }

    // ── Footer ────────────────────────────────────────────────────────────
    function drawFooter() {
      doc.setFillColor(...DARK); doc.rect(0, H - 13, W, 13, "F");
      doc.setFillColor(...EMERALD); doc.rect(0, H - 13, W, 1.2, "F");
      doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(160, 170, 185);
      doc.text("This statement is generated for record-keeping purposes only.", ML, H - 7);
      doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...EMERALD);
      doc.text(shop?.name ?? "", W - MR, H - 7, { align: "right" });
    }

    // ── Section label ─────────────────────────────────────────────────────
    function sectionLabel(sy: number, label: string) {
      doc.setFillColor(...EMERALD); doc.rect(ML, sy - 1, 3, 5.5, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...DKTXT);
      doc.text(label, ML + 6, sy + 3.5);
    }

    // ══════════════════════════════════════════════════════════════════════
    // PAGE 1
    // ══════════════════════════════════════════════════════════════════════
    doc.setFillColor(...WHITE); doc.rect(0, 0, W, H, "F");

    // ── Dark header band ──────────────────────────────────────────────────
    const HDR_H = 46;
    doc.setFillColor(...DARK); doc.rect(0, 0, W, HDR_H, "F");
    doc.setFillColor(...EMERALD); doc.rect(0, 0, W, 2.5, "F");

    // Logo — right side of header
    const LOGO_BOX_W = 48, LOGO_BOX_H = 28;
    if (logoBase64 && logoNatW > 0 && logoNatH > 0) {
      const scale = Math.min(LOGO_BOX_W / logoNatW, LOGO_BOX_H / logoNatH);
      const dW = logoNatW * scale;
      const dH = logoNatH * scale;
      const lx = W - MR - LOGO_BOX_W + (LOGO_BOX_W - dW) / 2;
      const ly = 5 + (LOGO_BOX_H - dH) / 2;
      doc.addImage(logoBase64, "JPEG", lx, ly, dW, dH);
    }

    // Shop info left
    doc.setFont("helvetica", "bold"); doc.setFontSize(15); doc.setTextColor(...WHITE);
    doc.text(shop?.name ?? "Our Shop", ML, 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(156, 163, 175);
    let subY = 23;
    if (shop?.address)       { doc.text(shop.address,       ML, subY); subY += 4.5; }
    if (shop?.ownerWhatsapp) { doc.text(shop.ownerWhatsapp, ML, subY); subY += 4.5; }
    if (shop?.email)         { doc.text(shop.email,         ML, subY); }

    // Right meta — DEBT STATEMENT label + ref
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...EMERALD);
    doc.text("DEBT STATEMENT", W - MR, 36, { align: "right" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...WHITE);
    doc.text(`DEBT-${(debt?.id ?? "").slice(0,8).toUpperCase()}`, W - MR, 43, { align: "right" });

    // ── Customer + summary cards ──────────────────────────────────────────
    let y = HDR_H + 8;

    const LBW = (CW - 6) / 2;
    const RBW = CW - LBW - 6;
    const LBX = ML, RBX = ML + LBW + 6;
    const CARD_H = 38;

    // Customer card
    doc.setFillColor(250, 252, 255);
    doc.rect(LBX, y, LBW, CARD_H, "F");
    doc.setDrawColor(...BORD); doc.setLineWidth(0.25);
    doc.rect(LBX, y, LBW, CARD_H, "S");
    doc.setFillColor(...EMERALD); doc.rect(LBX, y, 3.5, CARD_H, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...MGRAY);
    doc.text("CUSTOMER", LBX + 8, y + 7);
    doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...DKTXT);
    doc.text(debt?.customerName ?? "—", LBX + 8, y + 16);
    doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...MGRAY);
    if (debt?.customerPhone) { doc.text(debt.customerPhone, LBX + 8, y + 23); }
    doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(100, 116, 139);
    const openedDate = format(new Date(debt?.createdAt), "dd MMM yyyy");
    const daysOpen   = differenceInDays(new Date(), new Date(debt?.createdAt));
    doc.text(`Opened: ${openedDate}`, LBX + 8, y + 30);
    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...statusColor);
    const statusLabel = debt?.status === "paid" ? "● PAID" : debt?.status === "partial" ? "● PARTIAL" : "● OUTSTANDING";
    doc.text(statusLabel, LBX + 8, y + 36);

    // Summary card — dark background
    doc.setFillColor(18, 24, 38);
    doc.rect(RBX, y, RBW, CARD_H, "F");
    doc.setFillColor(...EMERALD); doc.rect(RBX, y, 3.5, CARD_H, "F");

    doc.setFont("helvetica", "bold"); doc.setFontSize(6.5); doc.setTextColor(...EMERALD);
    doc.text("DEBT SUMMARY", RBX + 8, y + 7);

    const summaryRows = [
      { label: "Total Debt",  value: `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`, color: WHITE   },
      { label: "Amount Paid", value: `KES ${totalPaid.toLocaleString("en-KE")}`,                color: EMERALD },
      { label: "Balance Due", value: `KES ${(debt?.balance ?? 0).toLocaleString("en-KE")}`,     color: (debt?.balance ?? 0) === 0 ? EMERALD : statusColor },
    ];
    summaryRows.forEach((row, i) => {
      const ry = y + 14 + i * 7.5;
      doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(160, 170, 185);
      doc.text(row.label, RBX + 8, ry);
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor(...(row.color as RGB));
      doc.text(row.value, RBX + RBW - 5, ry, { align: "right" });
    });

    // Days outstanding badge
    doc.setFont("helvetica", "normal"); doc.setFontSize(6.5); doc.setTextColor(120, 130, 148);
    doc.text(`${daysOpen} day${daysOpen !== 1 ? "s" : ""} outstanding`, RBX + RBW - 5, y + 36, { align: "right" });

    y += CARD_H + 10;

    // ── Items table (if present) ──────────────────────────────────────────
    if (items.length > 0) {
      sectionLabel(y, "ITEMS — LINKED SALE");
      y += 8;
      autoTable(doc, {
        startY: y, margin: { left: ML, right: MR, bottom: 18 },
        showHead: "firstPage",
        head: [["#", "Product / Description", "Qty", "Unit Price (KES)", "Total (KES)"]],
        body: items.map((it: any, i: number) => [
          String(i + 1),
          it.productName ?? it.name ?? "—",
          String(it.qty ?? it.quantity ?? 1),
          Number(it.unitPrice ?? 0).toLocaleString("en-KE"),
          Number(it.totalPrice ?? it.total ?? 0).toLocaleString("en-KE"),
        ]),
        headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7.5,
          cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
        bodyStyles: { fontSize: 8, cellPadding: { top: 4, bottom: 4, left: 4, right: 4 },
          textColor: DKTXT, lineColor: BORD, lineWidth: 0.2 },
        alternateRowStyles: { fillColor: LGRAY },
        columnStyles: {
          0: { cellWidth: 10, halign: "center", fontStyle: "bold", textColor: MGRAY },
          1: { cellWidth: "auto" },
          2: { cellWidth: 14, halign: "right" },
          3: { cellWidth: 34, halign: "right", textColor: [71, 85, 105] as RGB },
          4: { cellWidth: 36, halign: "right", fontStyle: "bold" },
        },
        tableLineColor: BORD, tableLineWidth: 0.2,
        didDrawPage: () => {
          const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
          if (pg > 1) drawContinuationHeader();
        },
        didDrawCell: (data: any) => {
          if (data.row.index === -1 && data.column.index === data.table.columns.length - 1) {
            doc.setDrawColor(...EMERALD); doc.setLineWidth(1);
            doc.line(ML, data.cell.y + data.cell.height, W - MR, data.cell.y + data.cell.height);
          }
        },
      });
      y = (doc as any).lastAutoTable.finalY + 10;
    }

    // ── Payment history table ─────────────────────────────────────────────
    sectionLabel(y, "PAYMENT HISTORY");
    y += 8;

    type HistRow = { cells: string[]; isOpened: boolean };
    const histRows: HistRow[] = [];
    histRows.push({
      cells: [
        format(new Date(debt?.createdAt), "dd MMM yyyy, HH:mm"),
        "System",
        "Debt Opened",
        `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`,
        `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`,
      ],
      isOpened: true,
    });
    let running = debt?.totalAmount ?? 0;
    payments.forEach((p: any) => {
      running -= p.amount;
      histRows.push({
        cells: [
          format(new Date(p.paidAt), "dd MMM yyyy, HH:mm"),
          p.recordedBy || "—",
          "Payment Received",
          `KES ${Number(p.amount).toLocaleString("en-KE")}`,
          `KES ${Math.max(0, running).toLocaleString("en-KE")}`,
        ],
        isOpened: false,
      });
    });
    if (histRows.length === 1) {
      histRows.push({ cells: ["—", "—", "No payments recorded yet", "—", "—"], isOpened: false });
    }

    autoTable(doc, {
      startY: y, margin: { left: ML, right: MR, bottom: 18 },
      showHead: "firstPage",
      head: [["Date & Time", "Recorded By", "Description", "Amount (KES)", "Balance (KES)"]],
      body: histRows.map(r => r.cells),
      headStyles: { fillColor: DARK, textColor: WHITE, fontStyle: "bold", fontSize: 7.5,
        cellPadding: { top: 4, bottom: 4, left: 4, right: 4 } },
      bodyStyles: { fontSize: 8, cellPadding: { top: 5, bottom: 5, left: 4, right: 4 },
        textColor: DKTXT, lineColor: BORD, lineWidth: 0.2 },
      alternateRowStyles: { fillColor: LGRAY },
      columnStyles: {
        0: { cellWidth: 38 },
        1: { cellWidth: 28 },
        2: { cellWidth: "auto" },
        3: { cellWidth: 34, halign: "right" },
        4: { cellWidth: 36, halign: "right" },
      },
      didParseCell: (data: any) => {
        if (data.section !== "body") return;
        const row = histRows[data.row.index];
        if (!row) return;
        if (row.isOpened) {
          data.cell.styles.textColor = RED;
          data.cell.styles.fontStyle = "bold";
        } else if (data.column.index === 3 && row.cells[2] === "Payment Received") {
          data.cell.styles.textColor = DKEMER;
          data.cell.styles.fontStyle = "bold";
        }
      },
      didDrawPage: () => {
        const pg = (doc as any).internal.getCurrentPageInfo().pageNumber;
        if (pg > 1) drawContinuationHeader();
      },
      didDrawCell: (data: any) => {
        if (data.row.index === -1 && data.column.index === data.table.columns.length - 1) {
          doc.setDrawColor(...EMERALD); doc.setLineWidth(1);
          doc.line(ML, data.cell.y + data.cell.height, W - MR, data.cell.y + data.cell.height);
        }
      },
      tableLineColor: BORD, tableLineWidth: 0.2,
    });
    y = (doc as any).lastAutoTable.finalY + 10;

    // ── Balance summary bar ────────────────────────────────────────────────
    const BS_H = 16;
    if (y + BS_H > H - 20) { doc.addPage(); drawContinuationHeader(); y = 18; }

    const totW = CW;
    const totX = ML;
    doc.setFillColor(18, 24, 38);
    doc.roundedRect(totX, y, totW, BS_H, 2, 2, "F");
    doc.setFillColor(...EMERALD);
    doc.roundedRect(totX, y, 4, BS_H, 2, 2, "F");
    doc.rect(totX + 4, y, 4, BS_H, "F");

    const colW3 = totW / 3;
    const summaryFinal = [
      { label: "TOTAL DEBT",  value: `KES ${(debt?.totalAmount ?? 0).toLocaleString("en-KE")}`, color: WHITE   },
      { label: "AMOUNT PAID", value: `KES ${totalPaid.toLocaleString("en-KE")}`,                 color: EMERALD },
      { label: "BALANCE DUE", value: `KES ${(debt?.balance ?? 0).toLocaleString("en-KE")}`,      color: (debt?.balance ?? 0) === 0 ? EMERALD : statusColor },
    ];
    summaryFinal.forEach((col, i) => {
      const cx = totX + colW3 * i + colW3 / 2;
      doc.setFont("helvetica", "bold"); doc.setFontSize(6); doc.setTextColor(...(EMERALD as RGB));
      doc.text(col.label, cx, y + 5.5, { align: "center" });
      doc.setFont("helvetica", "bold"); doc.setFontSize(9.5); doc.setTextColor(...(col.color as RGB));
      doc.text(col.value, cx, y + 12, { align: "center" });
      if (i < 2) {
        doc.setDrawColor(35, 42, 58); doc.setLineWidth(0.3);
        doc.line(totX + colW3 * (i + 1), y + 3, totX + colW3 * (i + 1), y + BS_H - 3);
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

// ─── Payment history panel ─────────────────────────────────────────────────
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

export default function Debts() {
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  const role = localStorage.getItem("greenlink_role") || "";
  const isOwner = role === "owner";

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 100);
  const [tab, setTab] = useState<DebtTab>("unpaid");
  const [expandedCustomer, setExpandedCustomer] = useState<string | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [bulkRemindOpen, setBulkRemindOpen] = useState(false);

  const qc = useQueryClient();

  const { data: allDebts, isLoading } = useListDebts(
    { shopId },
    { query: { enabled: !!shopId, refetchInterval: 5_000, refetchIntervalInBackground: true } }
  );

  const handleDeleted = () => {
    setExpandedDebtId(null);
  };

  const stats = useMemo(() => {
    const debts = allDebts || [];
    const active = debts.filter(d => d.status !== "paid");
    const overdue = active.filter(d => differenceInDays(new Date(), new Date(d.createdAt)) > 30);
    const overdueWithPhone = overdue.filter(d => d.customerPhone);
    return {
      outstanding: active.reduce((s, d) => s + (d.balance || 0), 0),
      activeCount: active.length,
      overdueCount: overdue.length,
      overdueWithPhone,
      totalDebts: debts.length,
    };
  }, [allDebts]);

  const filtered = useMemo(() => {
    const debts = allDebts || [];
    let list = debts;
    if (tab === "overdue") {
      list = debts.filter(d => d.status !== "paid" && differenceInDays(new Date(), new Date(d.createdAt)) > 30);
    } else if (tab !== "all") {
      list = debts.filter(d => d.status === tab);
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      list = list.filter(d =>
        d.customerName.toLowerCase().includes(q) ||
        (d.customerPhone || "").includes(q)
      );
    }
    return list;
  }, [allDebts, tab, debouncedSearch]);

  // Group filtered debts by customer name
  const grouped = useMemo((): CustomerGroup[] => {
    const map = new Map<string, any[]>();
    for (const debt of filtered) {
      const key = debt.customerName.toLowerCase().trim();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(debt);
    }
    return Array.from(map.entries()).map(([key, debts]) => {
      const activeDebts = debts.filter(d => d.status !== "paid");
      const totalBalance = debts.reduce((s, d) => s + (d.balance || 0), 0);
      const totalAmount = debts.reduce((s, d) => s + (d.totalAmount || 0), 0);
      const worstStatus: "unpaid" | "partial" | "paid" =
        activeDebts.some(d => d.status === "unpaid") ? "unpaid" :
        activeDebts.some(d => d.status === "partial") ? "partial" : "paid";
      const isOverdue = activeDebts.some(d => differenceInDays(new Date(), new Date(d.createdAt)) > 30);
      const phone = debts.find(d => d.customerPhone)?.customerPhone || "";
      return { key, customerName: debts[0].customerName, customerPhone: phone, debts, activeDebts, totalBalance, totalAmount, worstStatus, isOverdue };
    }).sort((a, b) => b.totalBalance - a.totalBalance);
  }, [filtered]);

  const TABS: { value: DebtTab; label: string; count: number; color?: string }[] = [
    { value: "unpaid", label: "Unpaid", count: (allDebts || []).filter(d => d.status === "unpaid").length, color: "text-destructive" },
    { value: "partial", label: "Partial", count: (allDebts || []).filter(d => d.status === "partial").length, color: "text-orange-400" },
    { value: "overdue", label: "Overdue 30d+", count: stats.overdueCount, color: "text-red-500" },
    { value: "paid", label: "Paid", count: (allDebts || []).filter(d => d.status === "paid").length, color: "text-emerald-400" },
    { value: "all", label: "All", count: stats.totalDebts },
  ];

  return (
    <div className="flex flex-col bg-background">
      {/* Header */}
      <div className="sticky top-0 z-20 px-4 py-3 border-b border-border bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold font-display">Customer Debts</h1>
            <p className="text-xs text-muted-foreground">{grouped.length} customer{grouped.length !== 1 ? "s" : ""} · {stats.activeCount} open debt{stats.activeCount !== 1 ? "s" : ""}</p>
          </div>
          {stats.overdueWithPhone.length > 0 && (
            <button
              onClick={() => setBulkRemindOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25D366]/10 border border-[#25D366]/30 text-[#25D366] text-xs font-semibold hover:bg-[#25D366]/20 transition-colors"
            >
              <Send className="h-3.5 w-3.5" />
              Remind All
              <span className="bg-[#25D366]/20 text-[#25D366] text-[10px] font-bold px-1.5 py-0.5 rounded-full">
                {stats.overdueWithPhone.length}
              </span>
            </button>
          )}
        </div>

        {/* Bulk WhatsApp remind dialog */}
        {bulkRemindOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => setBulkRemindOpen(false)}>
            <div className="absolute inset-0 bg-black/60" />
            <div
              className="relative bg-card border border-border rounded-2xl w-full max-w-sm max-h-[80vh] flex flex-col shadow-xl"
              onClick={e => e.stopPropagation()}
            >
              {/* Dialog header */}
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
                  <ChevronDown className="h-5 w-5" />
                </button>
              </div>

              {/* Customer list */}
              <div className="overflow-y-auto flex-1 p-3 space-y-2">
                {stats.overdueWithPhone.map((debt: any) => {
                  const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
                  const msg = `Hi ${debt.customerName}, you have an outstanding balance of ${formatKES(debt.balance)} at our shop (${daysAgo} days overdue). Please settle at your earliest convenience. Thank you!`;
                  const waUrl = `https://wa.me/${debt.customerPhone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`;
                  return (
                    <a
                      key={debt.id}
                      href={waUrl}
                      target="_blank"
                      rel="noopener noreferrer"
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

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-destructive/10 border border-destructive/20 rounded-xl p-3 text-center">
            <p className="text-base font-bold font-mono text-destructive leading-tight">
              {formatKES(stats.outstanding)}
            </p>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mt-0.5 flex items-center justify-center gap-1">
              <TrendingDown className="h-3 w-3" />Outstanding
            </p>
          </div>
          <div className="bg-muted/40 border border-border/50 rounded-xl p-3 text-center">
            <p className="text-base font-bold font-mono text-foreground leading-tight">{stats.activeCount}</p>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mt-0.5 flex items-center justify-center gap-1">
              <Users className="h-3 w-3" />Customers
            </p>
          </div>
          <div className={cn(
            "border rounded-xl p-3 text-center",
            stats.overdueCount > 0
              ? "bg-red-500/10 border-red-500/20"
              : "bg-muted/40 border-border/50"
          )}>
            <p className={cn(
              "text-base font-bold font-mono leading-tight",
              stats.overdueCount > 0 ? "text-red-400" : "text-muted-foreground"
            )}>
              {stats.overdueCount}
            </p>
            <p className="text-[10px] text-muted-foreground/70 uppercase tracking-wide mt-0.5 flex items-center justify-center gap-1">
              <Clock className="h-3 w-3" />Overdue
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by name or phone…"
            className="pl-9 h-10 text-sm bg-muted/40 border-border/60 rounded-xl"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Status tabs */}
        <div className="flex gap-1.5 overflow-x-auto pb-0.5 scrollbar-hide">
          {TABS.map(t => (
            <button
              key={t.value}
              onClick={() => setTab(t.value)}
              className={cn(
                "shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all",
                tab === t.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {t.label}
              <span className={cn(
                "text-[10px] font-bold",
                tab === t.value ? "text-primary-foreground/70" : (t.color || "text-muted-foreground/50")
              )}>
                {t.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Customer list */}
      <div className="p-3 space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-border bg-card p-4 animate-pulse">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-2xl bg-muted/60 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 w-32 bg-muted/60 rounded-full" />
                  <div className="h-3 w-20 bg-muted/40 rounded-full" />
                </div>
                <div className="h-6 w-20 bg-muted/50 rounded-xl" />
              </div>
            </div>
          ))
        ) : grouped.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-52 gap-3 text-muted-foreground">
            <CheckCircle2 className="h-12 w-12 text-emerald-500/20" />
            <p className="text-sm font-semibold">
              {tab === "paid" ? "No paid debts yet" : "All clear!"}
            </p>
            <p className="text-xs opacity-50 text-center">
              {search ? `No results for "${search}"` : `No ${tab !== "all" ? tab : ""} debts found.`}
            </p>
          </div>
        ) : (
          grouped.map(group => {
            const isExpanded = expandedCustomer === group.key;
            const paidPct = group.totalAmount > 0
              ? Math.round(((group.totalAmount - group.totalBalance) / group.totalAmount) * 100)
              : 0;
            const avatarColor =
              group.worstStatus === "paid" ? "bg-emerald-500/15 text-emerald-400" :
              group.isOverdue ? "bg-red-500/15 text-red-400" :
              group.worstStatus === "partial" ? "bg-orange-500/15 text-orange-400" :
              "bg-destructive/15 text-destructive";
            const balanceColor =
              group.worstStatus === "paid" ? "text-emerald-400" :
              group.isOverdue ? "text-red-400" :
              group.worstStatus === "partial" ? "text-orange-400" :
              "text-destructive";
            const barColor =
              group.worstStatus === "paid" ? "bg-emerald-400" :
              group.isOverdue ? "bg-red-400" :
              group.worstStatus === "partial" ? "bg-orange-400" :
              "bg-primary";

            return (
              <div key={group.key} className={cn(
                "rounded-2xl border bg-card overflow-hidden transition-all",
                group.isOverdue ? "border-red-500/40" : "border-border"
              )}>
                {/* ── Customer summary row ── */}
                <div className="p-4">
                  <div className="flex items-start gap-3">
                    {/* Avatar */}
                    <div className={cn("w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-base font-bold", avatarColor)}>
                      {group.customerName.charAt(0).toUpperCase()}
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">{group.customerName}</span>
                        {group.isOverdue && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-500/15 text-red-400">Overdue</span>
                        )}
                        {group.debts.length > 1 && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            {group.debts.length} transactions
                          </span>
                        )}
                      </div>

                      {group.customerPhone && (
                        <p className="text-[11px] text-muted-foreground/60 flex items-center gap-1 mt-0.5">
                          <Phone className="h-3 w-3" />{group.customerPhone}
                        </p>
                      )}

                      {/* Progress bar */}
                      <div className="mt-2 space-y-1">
                        <div className="flex justify-between items-center">
                          <span className="text-[11px] text-muted-foreground/60">
                            {group.worstStatus === "paid" ? "Fully paid" : `${paidPct}% paid`}
                          </span>
                          <span className={cn("text-sm font-bold font-mono", balanceColor)}>
                            {group.worstStatus === "paid"
                              ? formatKES(group.totalAmount)
                              : `${formatKES(group.totalBalance)} owed`}
                          </span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${paidPct}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground/40 font-mono">
                          Total credit: {formatKES(group.totalAmount)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Actions row */}
                  <div className="flex gap-2 mt-3 flex-wrap items-center">
                    {/* Pay button — only if single active debt for simplicity */}
                    {group.activeDebts.length === 1 && group.worstStatus !== "paid" && (
                      <PaymentDialog debt={group.activeDebts[0]} />
                    )}
                    {group.customerPhone && group.worstStatus !== "paid" && (
                      <a
                        href={`https://wa.me/${group.customerPhone.replace(/\D/g, "")}?text=Hi ${encodeURIComponent(group.customerName)}, you have an outstanding balance of ${formatKES(group.totalBalance)} at our shop. Please settle at your earliest convenience. Thank you!`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <button className="flex items-center gap-1.5 h-8 px-3 rounded-xl border border-[#25D366]/30 text-[#25D366] bg-[#25D366]/5 hover:bg-[#25D366]/15 text-xs font-semibold transition-colors">
                          <MessageCircle className="w-3.5 h-3.5" />WhatsApp
                        </button>
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setExpandedCustomer(isExpanded ? null : group.key);
                        setExpandedDebtId(null);
                      }}
                      className="flex items-center gap-1.5 h-8 px-3 rounded-xl bg-muted/60 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors ml-auto"
                    >
                      {isExpanded ? "Hide" : `${group.debts.length} debt${group.debts.length !== 1 ? "s" : ""}`}
                      {isExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    </button>
                  </div>
                </div>

                {/* ── Expanded: individual debts ── */}
                {isExpanded && (
                  <div className="border-t border-border/40 divide-y divide-border/30 bg-muted/10">
                    {group.debts.map((debt, di) => {
                      const isPaid = debt.status === "paid";
                      const daysAgo = differenceInDays(new Date(), new Date(debt.createdAt));
                      const isOverdue = !isPaid && daysAgo > 30;
                      const debtPaidPct = debt.totalAmount > 0
                        ? Math.round(((debt.totalAmount - debt.balance) / debt.totalAmount) * 100)
                        : 0;
                      const items: { productName: string; quantity: number; unitPrice: number; totalPrice: number }[] = (debt as any).items || [];

                      return (
                        <div key={debt.id}>
                          <div className="px-4 py-3">
                            {/* Debt header */}
                            <div className="flex items-center justify-between mb-2">
                              <div className="flex items-center gap-2">
                                <span className={cn(
                                  "text-[9px] font-bold uppercase px-1.5 py-0.5 rounded",
                                  isPaid ? "bg-emerald-500/15 text-emerald-400" :
                                  isOverdue ? "bg-red-500/15 text-red-400" :
                                  debt.status === "partial" ? "bg-orange-500/15 text-orange-400" :
                                  "bg-destructive/15 text-destructive"
                                )}>
                                  {isOverdue ? `${daysAgo}d overdue` : debt.status}
                                </span>
                                <span className="text-[10px] text-muted-foreground/50 flex items-center gap-1">
                                  <CalendarClock className="h-2.5 w-2.5" />
                                  {format(new Date(debt.createdAt), "d MMM yyyy")}
                                </span>
                              </div>
                              <span className={cn(
                                "text-sm font-bold font-mono",
                                isPaid ? "text-emerald-400" : isOverdue ? "text-red-400" : "text-foreground"
                              )}>
                                {isPaid ? formatKES(debt.totalAmount) : `${formatKES(debt.balance)} left`}
                              </span>
                            </div>

                            {/* Mini progress */}
                            <div className="h-1 bg-muted rounded-full overflow-hidden mb-2">
                              <div className={cn(
                                "h-full rounded-full",
                                isPaid ? "bg-emerald-400" : isOverdue ? "bg-red-400" : debt.status === "partial" ? "bg-orange-400" : "bg-primary"
                              )} style={{ width: `${debtPaidPct}%` }} />
                            </div>

                            {/* Items preview */}
                            {items.length > 0 && (
                              <div className="rounded-lg border border-border/20 bg-background/40 overflow-hidden mb-2">
                                {items.slice(0, 2).map((item, i) => (
                                  <div key={i} className={cn("flex items-center gap-2 px-2.5 py-1.5", i > 0 && "border-t border-border/20")}>
                                    <Package className="h-3 w-3 text-primary/50 shrink-0" />
                                    <span className="flex-1 text-[11px] text-foreground/70 truncate">{item.productName}</span>
                                    <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">×{item.quantity}</span>
                                    <span className="text-[11px] font-bold font-mono text-foreground/60 shrink-0">{formatKES(item.totalPrice)}</span>
                                  </div>
                                ))}
                                {items.length > 2 && (
                                  <div className="px-2.5 py-1 border-t border-border/20 text-[10px] text-muted-foreground/40 text-center">
                                    +{items.length - 2} more
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Per-debt actions */}
                            <div className="flex gap-2 flex-wrap items-center">
                              {!isPaid && <PaymentDialog debt={debt} />}
                              <DebtDownloadButton debt={debt} />
                              <button
                                onClick={() => setExpandedDebtId(expandedDebtId === debt.id ? null : debt.id)}
                                className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-muted/60 hover:bg-muted text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
                              >
                                <History className="h-3 w-3" />
                                {expandedDebtId === debt.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                              {isOwner && !isPaid && <MarkPaidButton debt={debt} />}
                              {isOwner && <DeleteDebtDialog debt={debt} onDeleted={handleDeleted} />}
                            </div>
                          </div>

                          {/* Payment history panel */}
                          {expandedDebtId === debt.id && <DebtHistoryPanel debtId={debt.id} />}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
