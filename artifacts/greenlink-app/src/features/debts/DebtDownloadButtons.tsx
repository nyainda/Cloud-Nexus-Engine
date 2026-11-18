import { useState } from "react";
import { Download } from "lucide-react";
import { type CustomerGroup } from "@/lib/debt-utils";
import { downloadDebtPdf, downloadCustomerPdf } from "@/lib/debt-pdf";

export function DebtDownloadButton({ debt }: { debt: any }) {
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

export function CustomerDownloadButton({ group }: { group: CustomerGroup }) {
  const [loading, setLoading] = useState(false);
  const shopId = localStorage.getItem("greenlink_shopId") || "";
  if (!group.debts.some((debt: any) => debt.status !== "cancelled")) return null;
  return (
    <button
      onClick={async (e) => {
        e.stopPropagation();
        if (loading) return;
        setLoading(true);
        try {
          await downloadCustomerPdf(group, shopId);
        } finally {
          setLoading(false);
        }
      }}
      disabled={loading}
      className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-semibold transition-colors disabled:opacity-50"
      title="Download all debt records for this customer"
    >
      {loading ? (
        <span className="w-3 h-3 rounded-full border border-primary border-t-transparent animate-spin" />
      ) : (
        <Download className="h-3 w-3" />
      )}
      All PDF
    </button>
  );
}
