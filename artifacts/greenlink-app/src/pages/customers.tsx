import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { formatKES } from "@/lib/format";
import {
  Search, UserPlus, Phone, Mail, Users, Wallet,
  ShoppingBag, ChevronRight, Pencil, Trash2, X,
  TrendingUp, AlertCircle, ArrowLeft, CalendarClock,
} from "lucide-react";
import { toast } from "sonner";
import { useDebounce } from "@/hooks/use-debounce";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

const shopId = () => localStorage.getItem("greenlink_shopId") || "";
const isOwner = () => localStorage.getItem("greenlink_role") === "owner";

function fetchCustomers(q?: string) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  return customFetch<any[]>(`/api/customers?${params}`);
}
function fetchCustomer(id: string) {
  return customFetch<any>(`/api/customers/${id}`);
}
function createCustomer(data: any) {
  return customFetch<any>("/api/customers", { method: "POST", body: JSON.stringify(data) });
}
function updateCustomer(id: string, data: any) {
  return customFetch<any>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) });
}
function deleteCustomer(id: string) {
  return customFetch<any>(`/api/customers/${id}`, { method: "DELETE" });
}

function StatusBadge({ balance }: { balance: number }) {
  if (balance <= 0)
    return <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/20 text-[10px]">No debt</Badge>;
  if (balance < 1000)
    return <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/20 text-[10px]">KES {balance.toLocaleString()}</Badge>;
  return <Badge className="bg-red-500/15 text-red-400 border-red-500/20 text-[10px]">KES {balance.toLocaleString()} owed</Badge>;
}

function CustomerForm({
  initial,
  onSave,
  onCancel,
  loading,
}: {
  initial?: any;
  onSave: (data: any) => void;
  onCancel: () => void;
  loading: boolean;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [phone, setPhone] = useState(initial?.phone ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label>Full Name *</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. John Kamau" />
      </div>
      <div className="space-y-1.5">
        <Label>Phone Number</Label>
        <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+254700..." type="tel" />
      </div>
      <div className="space-y-1.5">
        <Label>Email (optional)</Label>
        <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="john@example.com" type="email" />
      </div>
      <div className="space-y-1.5">
        <Label>Notes (optional)</Label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any notes about this customer..." rows={2} />
      </div>
      <DialogFooter className="gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button
          onClick={() => onSave({ name, phone, email: email || undefined, notes: notes || undefined })}
          disabled={!name.trim() || loading}
          className="bg-primary text-primary-foreground"
        >
          {loading ? "Saving…" : initial ? "Save Changes" : "Add Customer"}
        </Button>
      </DialogFooter>
    </div>
  );
}

function CustomerProfile({ customerId, onBack }: { customerId: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: customer, isLoading } = useQuery({
    queryKey: ["customer", customerId],
    queryFn: () => fetchCustomer(customerId),
    staleTime: 30_000,
  });

  const updateMut = useMutation({
    mutationFn: (data: any) => updateCustomer(customerId, data),
    onSuccess: () => {
      toast.success("Customer updated");
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["customer", customerId] });
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: () => toast.error("Failed to update customer"),
  });

  const deleteMut = useMutation({
    mutationFn: () => deleteCustomer(customerId),
    onSuccess: () => {
      toast.success("Customer deleted");
      qc.invalidateQueries({ queryKey: ["customers"] });
      onBack();
    },
    onError: () => toast.error("Failed to delete customer"),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
      </div>
    );
  }
  if (!customer) return null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground transition-colors">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <span className="text-primary font-bold text-lg">{customer.name[0].toUpperCase()}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-foreground leading-snug">{customer.name}</p>
          {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
        </div>
        {isOwner() && (
          <div className="flex gap-1">
            <button
              onClick={() => setEditing(true)}
              className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Stats strip */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: ShoppingBag, label: "Sales", value: customer.saleCount },
          { icon: TrendingUp, label: "Total Spent", value: formatKES(customer.totalSpent) },
          { icon: Wallet, label: "Debt Balance", value: formatKES(customer.debtBalance), red: customer.debtBalance > 0 },
        ].map((s) => (
          <div key={s.label} className="bg-card border border-border rounded-xl p-3 text-center">
            <s.icon className={cn("h-4 w-4 mx-auto mb-1", s.red ? "text-red-400" : "text-primary")} />
            <p className={cn("text-sm font-black font-mono", s.red ? "text-red-400" : "text-foreground")}>{s.value}</p>
            <p className="text-[10px] text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {customer.notes && (
        <div className="bg-muted/40 rounded-xl px-3 py-2 text-xs text-muted-foreground">
          {customer.notes}
        </div>
      )}

      {/* Sales history */}
      <div>
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Recent Sales</p>
        {customer.sales?.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No sales yet</p>
        ) : (
          <div className="space-y-1.5">
            {customer.sales?.slice(0, 10).map((sale: any) => (
              <div key={sale.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {format(new Date(sale.createdAt), "dd MMM yyyy · HH:mm")}
                  </p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {sale.saleType} · {sale.servedBy || "—"}
                  </p>
                </div>
                <p className="text-sm font-black font-mono text-primary">{formatKES(sale.totalAmount)}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Debts */}
      {customer.debts?.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-2">Debts</p>
          <div className="space-y-1.5">
            {customer.debts.map((debt: any) => (
              <div key={debt.id} className="flex items-center justify-between bg-card border border-border rounded-xl px-3 py-2">
                <div>
                  <p className="text-xs font-semibold text-foreground">{format(new Date(debt.createdAt), "dd MMM yyyy")}</p>
                  <Badge className={cn(
                    "text-[9px] mt-0.5",
                    debt.status === "paid" ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/20" :
                    debt.status === "partial" ? "bg-amber-500/15 text-amber-400 border-amber-500/20" :
                    "bg-red-500/15 text-red-400 border-red-500/20"
                  )}>
                    {debt.status}
                  </Badge>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black font-mono text-foreground">{formatKES(debt.totalAmount)}</p>
                  {debt.balance > 0 && <p className="text-[10px] text-red-400">KES {debt.balance.toLocaleString()} left</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit dialog */}
      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Customer</DialogTitle></DialogHeader>
          <CustomerForm
            initial={customer}
            onSave={(data) => updateMut.mutate(data)}
            onCancel={() => setEditing(false)}
            loading={updateMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Confirm delete dialog */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader><DialogTitle>Delete Customer?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently remove <span className="font-bold text-foreground">{customer.name}</span>. Their sales and debt history will be kept but unlinked.
          </p>
          <DialogFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => deleteMut.mutate()}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 250);
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const qc = useQueryClient();

  const { data: customerList = [], isLoading } = useQuery({
    queryKey: ["customers", debouncedSearch],
    queryFn: () => fetchCustomers(debouncedSearch || undefined),
    staleTime: 30_000,
  });

  const addMut = useMutation({
    mutationFn: (data: any) => createCustomer({ ...data, shopId: shopId() }),
    onSuccess: () => {
      toast.success("Customer added");
      setAdding(false);
      qc.invalidateQueries({ queryKey: ["customers"] });
    },
    onError: () => toast.error("Failed to add customer"),
  });

  if (selectedId) {
    return (
      <div className="p-4 max-w-lg mx-auto">
        <CustomerProfile customerId={selectedId} onBack={() => setSelectedId(null)} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black font-display leading-tight">Customers</h1>
            <p className="text-xs text-muted-foreground">{customerList.length} saved</p>
          </div>
          <Button
            size="sm"
            className="h-9 gap-1.5 bg-primary text-primary-foreground"
            onClick={() => setAdding(true)}
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            className="pl-9"
            placeholder="Search by name or phone…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-32">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        ) : customerList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-center">
            <Users className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <p className="font-semibold text-muted-foreground">
              {search ? "No customers found" : "No customers yet"}
            </p>
            {!search && (
              <p className="text-xs text-muted-foreground/60 mt-1">Add your regulars to track their history</p>
            )}
          </div>
        ) : (
          customerList.map((c: any) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className="w-full flex items-center gap-3 bg-card border border-border rounded-xl px-3 py-3 hover:border-primary/40 hover:bg-primary/5 transition-all text-left"
            >
              <div className="w-9 h-9 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                <span className="text-primary font-bold">{c.name[0].toUpperCase()}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{c.name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  {c.phone && (
                    <span className="text-[10px] text-muted-foreground/70 flex items-center gap-0.5">
                      <Phone className="h-2.5 w-2.5" />{c.phone}
                    </span>
                  )}
                  {c.saleCount > 0 && (
                    <span className="text-[10px] text-muted-foreground/60">{c.saleCount} sale{c.saleCount !== 1 ? "s" : ""}</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <StatusBadge balance={c.debtBalance} />
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40" />
              </div>
            </button>
          ))
        )}
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent>
          <DialogHeader><DialogTitle>New Customer</DialogTitle></DialogHeader>
          <CustomerForm
            onSave={(data) => addMut.mutate(data)}
            onCancel={() => setAdding(false)}
            loading={addMut.isPending}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
