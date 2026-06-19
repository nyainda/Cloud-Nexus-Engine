import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth, requireOwner } from "../middleware/auth";
import { sales, saleItems, debts, debtPayments, products } from "@workspace/db/schema";

const adminRouter = new Hono<AppEnv>();

// ── Full financial export — owner only ───────────────────────────────────────
// Returns all sales, line items, debts, and debt payments for the shop as JSON.
// Financial records are never pruned, so this always produces a complete ledger.
// Cloudflare D1 caps individual query results at ~10 000 rows; we paginate in
// 2 000-row pages to stay safely under that limit even for busy shops.
adminRouter.get("/admin/export", requireAuth, requireOwner, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  if (!shopId) return c.json({ error: "shopId required" }, 400);

  const PAGE = 2000;

  // ── Sales (paginated) ─────────────────────────────────────────────────────
  const allSales: any[] = [];
  let offset = 0;
  while (true) {
    const page = await db.select().from(sales)
      .where(eq(sales.shopId, shopId))
      .limit(PAGE).offset(offset).all();
    allSales.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  // ── Sale items (paginated) ────────────────────────────────────────────────
  const allSaleItems: any[] = [];
  offset = 0;
  while (true) {
    const page = await db.select().from(saleItems).limit(PAGE).offset(offset).all();
    allSaleItems.push(...page);
    if (page.length < PAGE) break;
    offset += PAGE;
  }

  // ── Debts (all — typically small) ────────────────────────────────────────
  const allDebts = await db.select().from(debts)
    .where(eq(debts.shopId, shopId)).all();

  // ── Debt payments ─────────────────────────────────────────────────────────
  const allDebtPayments = await db.select().from(debtPayments).all();

  // ── Products snapshot ─────────────────────────────────────────────────────
  const allProducts = await db.select({
    id: products.id,
    canonicalName: products.canonicalName,
    sku: products.sku,
    category: products.category,
    unit: products.unit,
    purchasePrice: products.purchasePrice,
    sellingPrice: products.sellingPrice,
    stockQty: products.stockQty,
    isActive: products.isActive,
    expiryDate: products.expiryDate,
  }).from(products).where(eq(products.shopId, shopId)).all();

  const payload = {
    exportedAt: new Date().toISOString(),
    shopId,
    summary: {
      salesCount: allSales.length,
      saleItemsCount: allSaleItems.length,
      debtsCount: allDebts.length,
      debtPaymentsCount: allDebtPayments.length,
      productsCount: allProducts.length,
    },
    sales: allSales,
    saleItems: allSaleItems,
    debts: allDebts,
    debtPayments: allDebtPayments,
    products: allProducts,
  };

  const filename = `greenlink-backup-${shopId}-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});

export default adminRouter;
