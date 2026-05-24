import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { formatKES } from "@/lib/format";
import {
  RotateCcw, Plus, X, CheckCircle2, XCircle, Clock,
  AlertTriangle, Package, ChevronDown, ChevronUp,
  User2, Phone, FileText, Banknote,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { useListProducts } from "@workspace/api-client-react";

const shopId = () => localStorage.getItem("greenlink_shopId") || "";
const isOwner = () => localStorage.getItem("greenlink_role") === "owner";
const role = () => localStorage.getItem("greenlink_role") || "cashier";

const REASONS = [
  { value: "customer_complaint", label: "Customer complaint" },
  { value: "damaged", label: "Damaged goods" },
  { value: "wrong_item", label: "Wrong item delivered" },
  { value: "expired", label: "Expired product" },
  { value: "other", label: "Other" },
];

const CONDITIONS = [
  { value: "resaleable", label: "Resaleable", desc: "Good condition — stock restored", color: "text-emerald-400" },
  { value: "damaged", label: "Damaged", desc: "Cannot resell — stock NOT restored", color: "text-amber-400" },
  { value: "expired", label: "Expired", desc: "Past expiry — stock NOT restored", color: "text-red-400" },
];

function fetchReturns(status?: string) {
  const params = new URLSearchParams();
  if (status && status !== "all") params.set("status", status);
  return customFetch<any[]>(`/api/returns?${params}`);
}
function createReturn(data: any) {
  return customFetch<any>("/api/returns", { method: "POST", body: JSON.stringify(data) });
}
function approveReturn(id: string) {
  return customFetch<any>(`/api/returns/${id}/approve`, { method: "PATCH", body: "{}" });
}
function rejectReturn(id: string, notes?: string) {
  return customFetch<any>(`/api/returns/${id}/reject`, { method: "PATCH", body: JSON.stringify({ notes }) });
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-amber-500/15 text-amber-400 border-amber-500/20",
    approved: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20",
    rejected: "bg-red-500/15 text-red-400 border-red-500/20",
  };
  const icons: Record<string, React.ReactNode> = {
    pending: <Clock className="h-2.5 w-2.5" />,
    approved: <CheckCircle2 className="h-2.5 w-2.5" />,
    rejected: <XCircle className="h-2.5 w-2.5" />,
  };
  return (
    <Badge className={cn("text-[10px] flex items-center gap-1", map[status] ?? map.pending)}>
      {icons[status]}
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </Badge>
  );
}

interface ReturnItemDraft {
  productId?: string;
  productName: string;
  qty: number;
  unitPrice: number;
  condition: "resaleable" | "damaged" | "expired";
}

function CreateReturnDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState("customer_complaint");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ReturnItemDraft[]>([]);
  const [productSearch, setProductSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualPrice, setManualPrice] = useState("");

  const { data: products = [] } = useListProducts(
    { shopId: shopId(), limit: 3000 },
    { query: { staleTime: 60_000 } },
  );

  const createMut = useMutation({
    mutationFn: createReturn,
    onSuccess: () => {
      toast.success("Return submitted for approval");
      qc.invalidateQueries({ queryKey: ["returns"] });
      onClose();
    },
    onError: (err: any) => toast.error(err?.message ?? "Failed to create return"),
  });

  const filteredProducts = productSearch.trim()
    ? (products as any[])
        .filter((p) => p.canonicalName.toLowerCase().includes(productSearch.toLowerCase()))
        .slice(0, 15)
    : [];

  const addProductItem = (p: any) => {
    if (items.find((i) => i.productId === p.id)) { toast.info("Already added"); return; }
    setItems((prev) => [...prev, {
      productId: p.id, productName: p.canonicalName,
      qty: 1, unitPrice: p.sellingPrice ?? 0, condition: "resaleable",
    }]);
    setProductSearch(""); setShowPicker(false);
  };

  const addManualItem = () => {
    if (!manualName.trim()) { toast.error("Enter product name"); return; }
    setItems((prev) => [...prev, {
      productName: manualName.trim(), qty: 1,
      unitPrice: parseFloat(manualPrice) || 0, condition: "resaleable",
    }]);
    setManualName(""); setManualPrice("");
  };

  const updateItem = (idx: number, patch: Partial<ReturnItemDraft>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const totalRefund = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);

  const handleSubmit = () => {
    if (items.length === 0) { toast.error("Add at least one item"); return; }
    createMut.mutate({
      reason, customerName: customerName || undefined,
      customerPhone: customerPhone || undefined, notes: notes || undefined,
      items: items.map(({ productId, productName, qty, unitPrice, condition }) => ({
        productId, productName, qty, unitPrice, condition,
      })),
    });
  };

  return (
    <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
      {/* Reason */}
      <div className="space-y-1.5">
        <Label>Return Reason *</Label>
        <div className="grid grid-cols-1 gap-1.5">
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              onClick={() => setReason(r.value)}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all text-left",
                reason === r.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border text-muted-foreground hover:border-border/80"
              )}
            >
              {reason === r.value ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> : <div className="w-3.5 h-3.5 rounded-full border-2 border-current shrink-0" />}
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Customer info */}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label className="text-xs">Customer Name</Label>
          <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Optional" className="h-8 text-sm" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Phone</Label>
          <Input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="Optional" className="h-8 text-sm" type="tel" />
        </div>
      </div>

      {/* Items */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <Label>Items to Return *</Label>
          <button type="button" onClick={() => setShowPicker((v) => !v)} className="text-xs text-primary hover:underline flex items-center gap-1">
            <Plus className="h-3 w-3" /> From stock
          </button>
        </div>

        {showPicker && (
          <div className="bg-muted/40 border border-border rounded-xl p-3 mb-2 space-y-2">
            <Input autoFocus placeholder="Search products…" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} className="h-8 text-sm" />
            <div className="space-y-1 max-h-36 overflow-y-auto">
              {filteredProducts.map((p: any) => (
                <button key={p.id} type="button" onClick={() => addProductItem(p)} className="w-full flex items-center justify-between px-2 py-1.5 rounded-lg hover:bg-primary/10 text-left transition-colors">
                  <span className="text-xs font-medium truncate">{p.canonicalName}</span>
                  <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{formatKES(p.sellingPrice ?? 0)}</span>
                </button>
              ))}
              {filteredProducts.length === 0 && productSearch.trim() && (
                <p className="text-xs text-muted-foreground text-center py-2">No products found</p>
              )}
            </div>
          </div>
        )}

        {/* Manual item entry */}
        <div className="flex items-center gap-2 mb-2">
          <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder="Item name (manual)" className="h-8 text-xs flex-1" />
          <Input value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="Price" type="number" className="h-8 text-xs w-24" />
          <Button type="button" size="sm" variant="outline" className="h-8 px-2 shrink-0" onClick={addManualItem}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="space-y-2">
          {items.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-3 border border-dashed border-border rounded-xl">
              No items — add from stock or enter manually
            </p>
          )}
          {items.map((item, idx) => (
            <div key={idx} className="bg-card border border-border rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                <p className="text-xs font-semibold flex-1 truncate">{item.productName}</p>
                <button type="button" onClick={() => removeItem(idx)} className="text-muted-foreground hover:text-destructive transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-muted-foreground">Qty</Label>
                  <input
                    type="number" min="0.1" step="0.1" value={item.qty}
                    onChange={(e) => updateItem(idx, { qty: parseFloat(e.target.value) || 1 })}
                    className="w-14 h-6 text-center text-xs bg-muted border border-border rounded font-mono"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Label className="text-[10px] text-muted-foreground">Unit price</Label>
                  <input
                    type="number" min="0" value={item.unitPrice}
                    onChange={(e) => updateItem(idx, { unitPrice: parseFloat(e.target.value) || 0 })}
                    className="w-20 h-6 text-center text-xs bg-muted border border-border rounded font-mono"
                  />
                </div>
                <span className="text-xs font-mono text-primary ml-auto">{formatKES(item.qty * item.unitPrice)}</span>
              </div>
              {/* Condition */}
              <div className="flex gap-1.5">
                {CONDITIONS.map((cond) => (
                  <button
                    key={cond.value}
                    type="button"
                    onClick={() => updateItem(idx, { condition: cond.value as any })}
                    className={cn(
                      "flex-1 text-[10px] font-medium px-2 py-1 rounded-lg border transition-all",
                      item.condition === cond.value
                        ? `border-current ${cond.color} bg-current/10`
                        : "border-border text-muted-foreground hover:border-border/60"
                    )}
                  >
                    {cond.label}
                  </button>
                ))}
              </div>
              <p className={cn("text-[10px]", CONDITIONS.find(c => c.value === item.condition)?.color)}>
                {CONDITIONS.find(c => c.value === item.condition)?.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any additional details…" rows={2} />
      </div>

      {/* Total */}
      {items.length > 0 && (
        <div className="bg-primary/10 border border-primary/20 rounded-xl px-4 py-3 flex items-center justify-between">
          <span className="text-sm font-semibold text-primary">Total Refund</span>
          <span className="text-lg font-black font-mono text-primary">{formatKES(totalRefund)}</span>
        </div>
      )}

      {/* Submit */}
      <div className="flex gap-2 pt-1">
        <Button variant="outline" onClick={onClose} disabled={createMut.isPending} className="flex-1">Cancel</Button>
        <Button
          onClick={handleSubmit}
          disabled={items.length === 0 || createMut.isPending}
          className="flex-1 bg-primary text-primary-foreground"
        >
          {createMut.isPending ? "Submitting…" : "Submit for Approval"}
        </Button>
      </div>
    </div>
  );
}

function ReturnCard({ ret, onApprove, onReject, approving, rejecting }: {
  ret: any;
  onApprove: () => void;
  onReject: () => void;
  approving: boolean;
  rejecting: boolean;
}) {
  const [expanded, setExpanded] = useState(ret.status === "pending");
  const resaleableItems = ret.items?.filter((i: any) => i.condition === "resaleable") ?? [];
  const reasonLabel = REASONS.find((r) => r.value === ret.reason)?.label ?? ret.reason;

  return (
    <div className={cn(
      "bg-card border rounded-xl overflow-hidden transition-colors",
      ret.status === "pending" ? "border-amber-500/30" : "border-border"
    )}>
      <div className="flex items-start gap-3 px-4 py-3">
        <div className={cn(
          "w-9 h-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5",
          ret.status === "pending" ? "bg-amber-500/15" :
          ret.status === "approved" ? "bg-emerald-500/15" : "bg-red-500/15"
        )}>
          <RotateCcw className={cn(
            "h-4 w-4",
            ret.status === "pending" ? "text-amber-400" :
            ret.status === "approved" ? "text-emerald-400" : "text-red-400"
          )} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-black font-mono text-muted-foreground">{ret.returnNumber}</span>
            <StatusBadge status={ret.status} />
          </div>
          <p className="text-sm font-bold text-foreground mt-0.5 truncate">
            {ret.customerName || "Walk-in customer"}
          </p>
          <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
            <span>{reasonLabel}</span>
            <span>·</span>
            <span>{ret.items?.length ?? 0} item{ret.items?.length !== 1 ? "s" : ""}</span>
            <span>·</span>
            <span>{format(new Date(ret.createdAt), "dd MMM · HH:mm")}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <span className="text-sm font-black font-mono text-primary">{formatKES(ret.totalRefund)}</span>
          <button onClick={() => setExpanded((v) => !v)} className="p-1 rounded hover:bg-muted/60 text-muted-foreground transition-colors ml-1">
            {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border px-4 py-3 space-y-3">
          {/* Items */}
          <div className="space-y-1.5">
            {ret.items?.map((item: any) => (
              <div key={item.id} className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">×{item.qty}</span>
                <span className="text-xs flex-1 truncate">{item.productName}</span>
                <Badge className={cn(
                  "text-[9px]",
                  item.condition === "resaleable" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                  item.condition === "damaged" ? "bg-amber-500/15 text-amber-400 border-amber-500/20" :
                  "bg-red-500/15 text-red-400 border-red-500/20"
                )}>
                  {item.condition}
                </Badge>
                <span className="text-xs font-mono text-muted-foreground">{formatKES(item.total)}</span>
              </div>
            ))}
          </div>

          {resaleableItems.length > 0 && ret.status === "pending" && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-400">
              ✓ {resaleableItems.length} resaleable item{resaleableItems.length !== 1 ? "s" : ""} — stock will be restored on approval
            </div>
          )}
          {resaleableItems.length > 0 && ret.status === "approved" && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2 text-xs text-emerald-400">
              ✓ Stock restored for {resaleableItems.length} resaleable item{resaleableItems.length !== 1 ? "s" : ""}
            </div>
          )}

          {ret.notes && (
            <p className="text-xs text-muted-foreground bg-muted/40 rounded-lg px-3 py-2">{ret.notes}</p>
          )}

          {/* Owner actions */}
          {isOwner() && ret.status === "pending" && (
            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-red-500/30 text-red-400 hover:bg-red-500/10 hover:border-red-500/50"
                onClick={onReject}
                disabled={rejecting || approving}
              >
                {rejecting ? "Rejecting…" : <><XCircle className="h-3.5 w-3.5 mr-1" /> Reject</>}
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-emerald-500 hover:bg-emerald-600 text-white"
                onClick={onApprove}
                disabled={approving || rejecting}
              >
                {approving ? "Approving…" : <><CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Approve</>}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function Returns() {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionId, setActionId] = useState<string | null>(null);

  const { data: returnList = [], isLoading } = useQuery({
    queryKey: ["returns", statusFilter],
    queryFn: () => fetchReturns(statusFilter),
    staleTime: 30_000,
  });

  const approveMut = useMutation({
    mutationFn: approveReturn,
    onSuccess: () => { toast.success("Return approved — stock restored"); qc.invalidateQueries({ queryKey: ["returns"] }); },
    onError: (err: any) => toast.error(err?.message ?? "Failed to approve"),
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectReturn(id),
    onSuccess: () => { toast.success("Return rejected"); qc.invalidateQueries({ queryKey: ["returns"] }); },
    onError: () => toast.error("Failed to reject"),
  });

  const pending = (returnList as any[]).filter((r) => r.status === "pending").length;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black font-display leading-tight">Returns</h1>
            <p className="text-xs text-muted-foreground">
              {pending > 0 ? (
                <span className="text-amber-400 font-semibold">{pending} pending approval</span>
              ) : (
                `${(returnList as any[]).length} total`
              )}
            </p>
          </div>
          <Button size="sm" className="h-9 gap-1.5 bg-primary text-primary-foreground" onClick={() => setCreating(true)}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-1.5">
          {[
            { value: "all", label: "All" },
            { value: "pending", label: "Pending" },
            { value: "approved", label: "Approved" },
            { value: "rejected", label: "Rejected" },
          ].map((f) => (
            <button
              key={f.value}
              onClick={() => setStatusFilter(f.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all",
                statusFilter === f.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2.5">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : (returnList as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center mt-4">
            <RotateCcw className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-semibold text-muted-foreground">
              {statusFilter !== "all" ? `No ${statusFilter} returns` : "No returns yet"}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1">Returns submitted by cashiers appear here for owner approval</p>
          </div>
        ) : (
          (returnList as any[]).map((ret) => (
            <ReturnCard
              key={ret.id}
              ret={ret}
              onApprove={() => approveMut.mutate(ret.id)}
              onReject={() => rejectMut.mutate(ret.id)}
              approving={approveMut.isPending && approveMut.variables === ret.id}
              rejecting={rejectMut.isPending && rejectMut.variables === ret.id}
            />
          ))
        )}
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><RotateCcw className="h-4 w-4" /> New Return</DialogTitle></DialogHeader>
          <CreateReturnDialog onClose={() => setCreating(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
