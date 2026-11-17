import { useState } from "react";
import {
  ChevronLeft,
  Download,
  FileText,
  Loader2,
  MessageCircle,
  Printer,
} from "lucide-react";
import { format } from "date-fns";
import {
  getQuotationShopName,
  KES,
  STATUS_META,
  type Quotation,
} from "@/lib/quotation-utils";
import { downloadPdf, shareWhatsApp } from "@/lib/quotation-pdf";

export function PrintView({
  quotation,
  shop,
  onClose,
}: {
  quotation: Quotation;
  shop: any;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);
  const shopDisplayName = getQuotationShopName(shop);

  const handleDownload = async () => {
    setDownloading(true);
    await downloadPdf(quotation, shop);
    setDownloading(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/95 flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 bg-[#0A0A0A] shrink-0 flex-wrap">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/80 text-xs font-semibold hover:bg-white/20 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back
        </button>
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-xs font-black text-[#C8FF00] font-mono">
            {quotation.quoteNumber}
          </span>
          <span className="hidden sm:inline text-xs text-white/60 truncate">
            · {quotation.customerName}
          </span>
        </div>
        <div className="flex-1" />
        <button
          onClick={() =>
            shareWhatsApp(
              quotation,
              shop,
              quotation.invoiceNumber ? "invoice" : "quotation",
            )
          }
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#25D366]/20 text-[#25D366] border border-[#25D366]/30 text-xs font-bold hover:bg-[#25D366]/30 transition-colors"
        >
          <MessageCircle className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">WhatsApp</span>
        </button>
        {quotation.invoiceNumber && (
          <button
            onClick={() => downloadPdf(quotation, shop, "invoice")}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-xs font-bold hover:bg-emerald-500/30 transition-colors"
          >
            <FileText className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Invoice PDF</span>
          </button>
        )}
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#C8FF00] text-[#0A0A0A] text-xs font-black hover:bg-[#C8FF00]/90 disabled:opacity-60 transition-colors"
        >
          {downloading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Download className="h-3.5 w-3.5" />
          )}
          {downloading ? "Generating…" : "Download PDF"}
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white/10 text-white/80 text-xs font-semibold hover:bg-white/20 transition-colors"
        >
          <Printer className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Print</span>
        </button>
      </div>

      {/* Document */}
      <div className="flex-1 overflow-y-auto px-3 py-6 sm:px-6">
        <div
          id="quote-doc"
          className="mx-auto bg-white text-gray-900 shadow-2xl overflow-hidden"
          style={{
            fontFamily: "'DM Sans', sans-serif",
            maxWidth: "760px",
            borderRadius: "16px",
          }}
        >
          {/* ── Premium header ── */}
          <div style={{ background: "#0A0A0A", padding: "0" }}>
            <div style={{ height: "4px", background: "#C8FF00" }} />
            <div
              style={{
                padding: "28px 36px 26px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                gap: "20px",
                flexWrap: "wrap",
              }}
            >
              <div style={{ flex: 1, minWidth: "180px" }}>
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 900,
                    letterSpacing: "0.25em",
                    color: "#C8FF00",
                    textTransform: "uppercase",
                    marginBottom: "8px",
                    margin: "0 0 8px",
                  }}
                >
                  Official Quotation
                </p>
                <h1
                  style={{
                    fontSize: "24px",
                    fontWeight: 900,
                    color: "#fff",
                    margin: "0 0 8px",
                    letterSpacing: "-0.02em",
                    lineHeight: 1.1,
                  }}
                >
                  {shopDisplayName}
                </h1>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "3px",
                  }}
                >
                  {shop?.address && (
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                      {shop.address}
                    </span>
                  )}
                  {shop?.ownerWhatsapp && (
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                      {shop.ownerWhatsapp}
                    </span>
                  )}
                  {shop?.email && (
                    <span style={{ fontSize: "11px", color: "#9ca3af" }}>
                      {shop.email}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 800,
                    color: "#C8FF00",
                    letterSpacing: "0.2em",
                    textTransform: "uppercase",
                    margin: "0 0 6px",
                  }}
                >
                  QUOTATION
                </p>
                <p
                  style={{
                    fontSize: "26px",
                    fontWeight: 900,
                    color: "#ffffff",
                    fontFamily: "monospace",
                    margin: "0 0 10px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {quotation.quoteNumber}
                </p>
                <p
                  style={{
                    fontSize: "11px",
                    color: "#9ca3af",
                    margin: "2px 0",
                  }}
                >
                  Date: {format(new Date(quotation.createdAt), "dd MMM yyyy")}
                </p>
                {quotation.validUntil && (
                  <p
                    style={{
                      fontSize: "11px",
                      color: "#9ca3af",
                      margin: "2px 0",
                    }}
                  >
                    Valid Until:{" "}
                    {format(new Date(quotation.validUntil), "dd MMM yyyy")}
                  </p>
                )}
                <span
                  style={{
                    display: "inline-block",
                    marginTop: "10px",
                    fontSize: "9px",
                    fontWeight: 800,
                    textTransform: "uppercase",
                    letterSpacing: "0.12em",
                    padding: "4px 12px",
                    borderRadius: "20px",
                    background:
                      quotation.status === "accepted"
                        ? "rgba(34,197,94,0.15)"
                        : quotation.status === "rejected"
                          ? "rgba(239,68,68,0.15)"
                          : "rgba(255,255,255,0.08)",
                    color:
                      quotation.status === "accepted"
                        ? "#4ade80"
                        : quotation.status === "rejected"
                          ? "#f87171"
                          : quotation.status === "sent"
                            ? "#60a5fa"
                            : "#9ca3af",
                    border: `1px solid ${quotation.status === "accepted" ? "rgba(34,197,94,0.3)" : quotation.status === "rejected" ? "rgba(239,68,68,0.3)" : "rgba(255,255,255,0.1)"}`,
                  }}
                >
                  {STATUS_META[quotation.status].label}
                </span>
              </div>
            </div>
          </div>

          {/* ── Bill To ── */}
          <div style={{ padding: "24px 36px 0" }}>
            <div
              style={{
                display: "flex",
                alignItems: "stretch",
                gap: "0",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                overflow: "hidden",
                marginBottom: "24px",
              }}
            >
              <div
                style={{ width: "4px", background: "#C8FF00", flexShrink: 0 }}
              />
              <div style={{ padding: "14px 18px", flex: 1 }}>
                <p
                  style={{
                    fontSize: "9px",
                    fontWeight: 900,
                    letterSpacing: "0.2em",
                    color: "#94a3b8",
                    textTransform: "uppercase",
                    margin: "0 0 8px",
                  }}
                >
                  Bill To
                </p>
                <p
                  style={{
                    fontSize: "17px",
                    fontWeight: 800,
                    color: "#0f172a",
                    margin: "0 0 5px",
                  }}
                >
                  {quotation.customerName}
                </p>
                <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
                  {quotation.customerPhone && (
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {quotation.customerPhone}
                    </span>
                  )}
                  {quotation.customerEmail && (
                    <span style={{ fontSize: "12px", color: "#64748b" }}>
                      {quotation.customerEmail}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ── Items table ── */}
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: "13px",
                marginBottom: "20px",
              }}
            >
              <thead>
                <tr style={{ background: "#0A0A0A" }}>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "4%",
                    }}
                  >
                    #
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                    }}
                  >
                    Product / Description
                  </th>
                  <th
                    style={{
                      textAlign: "center",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "9%",
                    }}
                  >
                    Unit
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "8%",
                    }}
                  >
                    Qty
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "17%",
                    }}
                  >
                    Unit Price
                  </th>
                  <th
                    style={{
                      textAlign: "right",
                      padding: "10px 10px",
                      fontSize: "8px",
                      fontWeight: 900,
                      textTransform: "uppercase",
                      letterSpacing: "0.15em",
                      color: "#C8FF00",
                      width: "18%",
                    }}
                  >
                    Total (KES)
                  </th>
                </tr>
                <tr>
                  <td
                    colSpan={6}
                    style={{ height: "2px", background: "#C8FF00", padding: 0 }}
                  />
                </tr>
              </thead>
              <tbody>
                {quotation.items.map((item, i) => (
                  <tr
                    key={i}
                    style={{ background: i % 2 === 0 ? "#fff" : "#f9fafb" }}
                  >
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "center",
                        fontSize: "10px",
                        fontWeight: 800,
                        color: "#94a3b8",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {i + 1}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        fontWeight: 600,
                        color: "#0f172a",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {item.productName}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "center",
                        color: "#64748b",
                        fontSize: "11px",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {item.unit || "unit"}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "right",
                        color: "#374151",
                        fontFamily: "monospace",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {item.qty}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "right",
                        color: "#475569",
                        fontFamily: "monospace",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {KES(item.unitPrice)}
                    </td>
                    <td
                      style={{
                        padding: "11px 10px",
                        textAlign: "right",
                        fontWeight: 800,
                        color: "#0f172a",
                        fontFamily: "monospace",
                        borderBottom: "1px solid #f1f5f9",
                      }}
                    >
                      {KES(item.total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* ── Totals ── */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                marginBottom: "24px",
              }}
            >
              <div style={{ width: "260px" }}>
                {quotation.discountAmount > 0 && (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 12px",
                        fontSize: "13px",
                        color: "#64748b",
                        background: "#f8fafc",
                        borderRadius: "6px 6px 0 0",
                      }}
                    >
                      <span>Subtotal</span>
                      <span style={{ fontFamily: "monospace" }}>
                        {KES(quotation.subtotal)}
                      </span>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        padding: "6px 12px",
                        fontSize: "13px",
                        color: "#dc2626",
                        background: "#fef2f2",
                      }}
                    >
                      <span>Discount</span>
                      <span style={{ fontFamily: "monospace" }}>
                        − {KES(quotation.discountAmount)}
                      </span>
                    </div>
                  </>
                )}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "#0A0A0A",
                    borderRadius:
                      quotation.discountAmount > 0 ? "0 0 10px 10px" : "10px",
                  }}
                >
                  <span
                    style={{
                      fontSize: "11px",
                      fontWeight: 900,
                      color: "#C8FF00",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                    }}
                  >
                    Total Due
                  </span>
                  <span
                    style={{
                      fontSize: "18px",
                      fontWeight: 900,
                      color: "#fff",
                      fontFamily: "monospace",
                    }}
                  >
                    {KES(quotation.total)}
                  </span>
                </div>
              </div>
            </div>

            {/* ── Notes ── */}
            {quotation.notes && (
              <div
                style={{
                  display: "flex",
                  gap: "0",
                  border: "1px solid #e2e8f0",
                  borderRadius: "10px",
                  overflow: "hidden",
                  marginBottom: "20px",
                }}
              >
                <div
                  style={{ width: "4px", background: "#C8FF00", flexShrink: 0 }}
                />
                <div
                  style={{
                    padding: "12px 16px",
                    flex: 1,
                    background: "#f8fafc",
                  }}
                >
                  <p
                    style={{
                      fontSize: "9px",
                      fontWeight: 900,
                      letterSpacing: "0.2em",
                      color: "#94a3b8",
                      textTransform: "uppercase",
                      margin: "0 0 7px",
                    }}
                  >
                    Notes &amp; Terms
                  </p>
                  <p
                    style={{
                      fontSize: "12px",
                      color: "#475569",
                      whiteSpace: "pre-wrap",
                      lineHeight: 1.7,
                      margin: 0,
                    }}
                  >
                    {quotation.notes}
                  </p>
                </div>
              </div>
            )}

            {/* ── Footer ── */}
            <div
              style={{
                borderTop: "2px solid #C8FF00",
                paddingTop: "14px",
                paddingBottom: "24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: "8px",
              }}
            >
              <p
                style={{
                  fontSize: "10px",
                  color: "#94a3b8",
                  lineHeight: 1.6,
                  margin: 0,
                }}
              >
                Valid{" "}
                {quotation.validUntil
                  ? `until ${format(new Date(quotation.validUntil), "dd MMMM yyyy")}`
                  : "for 30 days from issue"}{" "}
                · Prices subject to availability
              </p>
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 800,
                  color: "#0f172a",
                  margin: 0,
                }}
              >
                {shopDisplayName}
              </p>
            </div>
          </div>
        </div>
        <div className="h-8" />
      </div>

      <style>{`
        @media print {
          body > * { display: none !important; }
          #quote-doc { display: block !important; }
          * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
