import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { quotations, shops } from "@workspace/db/schema";

const quotationsRouter = new Hono<AppEnv>();

function parseInvoiceSnapshot(value: string | null | undefined): any | null {
  if (!value) return null;
  try { return JSON.parse(value); } catch { return null; }
}

// ── List quotations ────────────────────────────────────────────────────────────
quotationsRouter.get("/quotations", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const status = c.req.query("status");
  const limit = Math.min(parseInt(c.req.query("limit") ?? "100"), 500);
  const offset = parseInt(c.req.query("offset") ?? "0");

  if (!shopId) return c.json({ error: "shopId required" }, 400);

  const conditions = [eq(quotations.shopId, shopId)];
  if (status && status !== "all") {
    conditions.push(eq(quotations.status, status as any));
  }

  const rows = await db
    .select()
    .from(quotations)
    .where(and(...conditions))
    .orderBy(desc(quotations.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return c.json(rows.map((q) => ({
    ...q,
    items: (() => { try { return JSON.parse(q.itemsJson); } catch { return []; } })(),
    invoiceSnapshot: parseInvoiceSnapshot((q as any).invoiceSnapshotJson),
  })));
});

// ── Get single quotation ───────────────────────────────────────────────────────
quotationsRouter.get("/quotations/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const q = await db
    .select()
    .from(quotations)
    .where(eq(quotations.id, c.req.param("id")))
    .get();
  if (!q) return c.json({ error: "Not found" }, 404);
  return c.json({
    ...q,
    items: (() => { try { return JSON.parse(q.itemsJson); } catch { return []; } })(),
    invoiceSnapshot: parseInvoiceSnapshot((q as any).invoiceSnapshotJson),
  });
});

// ── Create quotation ───────────────────────────────────────────────────────────
quotationsRouter.post("/quotations", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    customerName: string;
    customerPhone?: string;
    customerEmail?: string;
    notes?: string;
    validUntil?: string;
    discountAmount?: number;
    items: Array<{
      productId?: string;
      productName: string;
      unit?: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
    createdBy?: string;
  }>();

  const db = createDb(c.env.DB);

  // Auto-generate quote number: Q-{YYYY}-{seq}
  const year = new Date().getFullYear();
  const { results: countRes } = await c.env.DB.prepare(
    "SELECT COUNT(*) as n FROM quotations WHERE shop_id = ?"
  ).bind(body.shopId).all();
  const seq = (Number((countRes as any)[0]?.n ?? 0) + 1);
  const quoteNumber = `Q-${year}-${seq.toString().padStart(4, "0")}`;

  const items = body.items ?? [];
  const subtotal = items.reduce((s, i) => s + i.total, 0);
  const discountAmount = body.discountAmount ?? 0;
  const total = Math.max(0, subtotal - discountAmount);

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await db.insert(quotations).values({
    id,
    shopId: body.shopId,
    quoteNumber,
    customerName: body.customerName,
    customerPhone: body.customerPhone ?? "",
    customerEmail: body.customerEmail ?? null,
    status: "draft",
    notes: body.notes ?? null,
    validUntil: body.validUntil ?? null,
    subtotal,
    discountAmount,
    total,
    itemsJson: JSON.stringify(items),
    createdBy: body.createdBy ?? null,
    createdAt: now,
  });

  const q = await db.select().from(quotations).where(eq(quotations.id, id)).get();
  return c.json({
    ...q!,
    items,
  }, 201);
});

// ── Update quotation ───────────────────────────────────────────────────────────
quotationsRouter.patch("/quotations/:id", requireAuth, async (c) => {
  const body = await c.req.json<{
    status?: "draft" | "sent" | "accepted" | "rejected" | "expired";
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    notes?: string;
    validUntil?: string;
    discountAmount?: number;
    items?: Array<{
      productId?: string;
      productName: string;
      unit?: string;
      qty: number;
      unitPrice: number;
      total: number;
    }>;
  }>();

  const session = c.get("session");
  const quotationId = c.req.param("id");
  const db = createDb(c.env.DB);
  const existing = await db.select().from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.shopId, session.shopId))).get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const patch: Partial<typeof quotations.$inferInsert> = {};
  if (body.status) patch.status = body.status;
  if (body.customerName !== undefined) patch.customerName = body.customerName;
  if (body.customerPhone !== undefined) patch.customerPhone = body.customerPhone;
  if (body.customerEmail !== undefined) patch.customerEmail = body.customerEmail;
  if (body.notes !== undefined) patch.notes = body.notes;
  if (body.validUntil !== undefined) patch.validUntil = body.validUntil;

  if (body.items !== undefined) {
    const subtotal = body.items.reduce((sum, item) => sum + item.total, 0);
    const discountAmount = body.discountAmount ?? existing.discountAmount;
    patch.itemsJson = JSON.stringify(body.items);
    patch.subtotal = subtotal;
    patch.discountAmount = discountAmount;
    patch.total = Math.max(0, subtotal - discountAmount);
  } else if (body.discountAmount !== undefined) {
    patch.discountAmount = body.discountAmount;
    patch.total = Math.max(0, existing.subtotal - body.discountAmount);
  }

  // Batch the quotation update, latest invoice snapshot, and revision history together.
  // Read the revision number from the existing persisted snapshot and use a conditional
  // write so overlapping saves cannot silently overwrite one another's revision.
  if (existing.invoiceNumber) {
    const previous = parseInvoiceSnapshot((existing as any).invoiceSnapshotJson);
    const revisionNumber = Math.max(1, Number(previous?.revisionNumber ?? 1) + 1);
    const revisedAt = new Date().toISOString();
    const nextItems = patch.itemsJson ?? existing.itemsJson;
    const nextSubtotal = patch.subtotal ?? existing.subtotal;
    const nextDiscountAmount = patch.discountAmount ?? existing.discountAmount;
    const nextSnapshot = {
      customerName: patch.customerName ?? existing.customerName,
      customerPhone: patch.customerPhone ?? existing.customerPhone,
      customerEmail: patch.customerEmail === undefined ? existing.customerEmail : patch.customerEmail,
      notes: patch.notes === undefined ? existing.notes : patch.notes,
      validUntil: patch.validUntil === undefined ? existing.validUntil : patch.validUntil,
      subtotal: nextSubtotal,
      discountAmount: nextDiscountAmount,
      total: patch.total ?? existing.total,
      items: (() => { try { return JSON.parse(nextItems); } catch { return []; } })(),
      createdAt: existing.createdAt,
      revisionNumber,
      revisedAt,
    };

    const updateFields = Object.entries(patch).filter(([key]) => key !== "id");
    const setSql = updateFields.map(([key]) => {
      const columnMap: Record<string, string> = {
        status: "status",
        customerName: "customer_name",
        customerPhone: "customer_phone",
        customerEmail: "customer_email",
        notes: "notes",
        validUntil: "valid_until",
        itemsJson: "items_json",
        subtotal: "subtotal",
        discountAmount: "discount_amount",
        total: "total",
      };
      return `${columnMap[key]} = ?`;
    });
    const updateValues = updateFields.map(([, value]) => value);
    const updateSql = setSql.length ? `${setSql.join(", ")}, ` : "";

    // The old snapshot comparison is a compare-and-swap guard. If a concurrent
    // save won first, this batch fails its revision insert and the quotation is
    // left untouched by this request rather than getting out of sync with history.
    try {
      const results = await c.env.DB.batch([
        c.env.DB.prepare(`UPDATE quotations SET ${updateSql}invoice_snapshot_json = ? WHERE id = ? AND shop_id = ? AND invoice_snapshot_json IS ?`)
          .bind(...updateValues, JSON.stringify(nextSnapshot), quotationId, session.shopId, (existing as any).invoiceSnapshotJson ?? null),
        c.env.DB.prepare(`
          INSERT INTO invoice_revisions (id, quotation_id, invoice_number, revision_number, snapshot_json, revised_at)
          SELECT ?, ?, ?, ?, ?, ?
          WHERE changes() = 1
        `).bind(crypto.randomUUID(), existing.id, existing.invoiceNumber, revisionNumber, JSON.stringify(nextSnapshot), revisedAt),
      ]);
      if (Number((results as any[])[0]?.meta?.changes ?? 0) !== 1 ||
          Number((results as any[])[1]?.meta?.changes ?? 0) !== 1) {
        return c.json({ error: "This quotation was changed by another save. Reload the latest version and try again." }, 409);
      }
    } catch (error) {
      // Unique revision constraint and compare-and-swap guard prevent competing saves
      // from assigning the same revision or leaving an orphaned history entry.
      const latest = await db.select().from(quotations)
        .where(and(eq(quotations.id, quotationId), eq(quotations.shopId, session.shopId))).get();
      if (latest && (latest as any).invoiceSnapshotJson !== (existing as any).invoiceSnapshotJson) {
        return c.json({ error: "This quotation was changed by another save. Reload the latest version and try again." }, 409);
      }
      throw error;
    }
  } else {
    await db.update(quotations).set(patch)
      .where(and(eq(quotations.id, quotationId), eq(quotations.shopId, session.shopId)));
  }

  const q = await db.select().from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.shopId, session.shopId))).get();
  if (!q) return c.json({ error: "Not found" }, 404);
  return c.json({
    ...q,
    items: (() => { try { return JSON.parse(q.itemsJson); } catch { return []; } })(),
    invoiceSnapshot: parseInvoiceSnapshot((q as any).invoiceSnapshotJson),
  });
});

// ── Issue one immutable customer invoice from an accepted quotation ────────────
quotationsRouter.post("/quotations/:id/invoice", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const quotationId = c.req.param("id");
  const existing = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.shopId, session.shopId)))
    .get();

  if (!existing) return c.json({ error: "Quotation not found" }, 404);
  if (existing.invoiceNumber) {
    return c.json({
      ...existing,
      items: (() => { try { return JSON.parse(existing.itemsJson); } catch { return []; } })(),
      invoiceSnapshot: parseInvoiceSnapshot((existing as any).invoiceSnapshotJson),
    });
  }
  if (existing.status !== "accepted") {
    return c.json({ error: "Accept the quotation before issuing an invoice." }, 409);
  }

  // Derive the invoice number from the unique quote number. This makes retries
  // idempotent and avoids allocating duplicate sequence numbers concurrently.
  const invoiceNumber = `INV-${existing.quoteNumber.replace(/^Q-/i, "")}`;
  const invoiceIssuedAt = new Date().toISOString();
  const invoiceSnapshot = {
    revisionNumber: 1,
    revisedAt: null,
    customerName: existing.customerName,
    customerPhone: existing.customerPhone,
    customerEmail: existing.customerEmail,
    notes: existing.notes,
    validUntil: existing.validUntil,
    subtotal: existing.subtotal,
    discountAmount: existing.discountAmount,
    total: existing.total,
    items: (() => { try { return JSON.parse(existing.itemsJson); } catch { return []; } })(),
    createdAt: existing.createdAt,
  };
  await c.env.DB.prepare(`
    UPDATE quotations
    SET invoice_number = ?, invoice_issued_at = ?, invoice_snapshot_json = ?
    WHERE id = ? AND shop_id = ? AND status = 'accepted' AND invoice_number IS NULL
  `).bind(invoiceNumber, invoiceIssuedAt, JSON.stringify(invoiceSnapshot), quotationId, session.shopId).run();

  const issued = await db
    .select()
    .from(quotations)
    .where(and(eq(quotations.id, quotationId), eq(quotations.shopId, session.shopId)))
    .get();
  if (!issued?.invoiceNumber) {
    return c.json({ error: "Could not issue invoice. Refresh and try again." }, 409);
  }
  await c.env.DB.prepare(`
    INSERT OR IGNORE INTO invoice_revisions (id, quotation_id, invoice_number, revision_number, snapshot_json, revised_at)
    VALUES (?, ?, ?, 1, ?, ?)
  `).bind(crypto.randomUUID(), issued.id, invoiceNumber, JSON.stringify(invoiceSnapshot), invoiceIssuedAt).run();

  return c.json({
    ...issued,
    items: (() => { try { return JSON.parse(issued.itemsJson); } catch { return []; } })(),
    invoiceSnapshot: parseInvoiceSnapshot((issued as any).invoiceSnapshotJson),
  }, 201);
});

// ── Delete quotation ───────────────────────────────────────────────────────────
quotationsRouter.delete("/quotations/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const existing = await db.select().from(quotations).where(eq(quotations.id, c.req.param("id"))).get();
  if (existing?.invoiceNumber) {
    return c.json({ error: "This quotation has an issued invoice and cannot be deleted." }, 409);
  }
  await db.delete(quotations).where(eq(quotations.id, c.req.param("id")));
  return c.body(null, 204);
});

// ── Customers autocomplete (from debts + quotations) ───────────────────────────
// Returns unique customer names+phones for autocomplete in the quotation builder.
// Already exposed from debts router as /customers — kept here as a fallback.
quotationsRouter.get("/quotation-customers", requireAuth, async (c) => {
  const shopId = c.req.query("shopId");
  if (!shopId) return c.json([]);

  const { results } = await c.env.DB.prepare(`
    SELECT DISTINCT customer_name, customer_phone
    FROM (
      SELECT customer_name, customer_phone FROM debts WHERE shop_id = ?
      UNION
      SELECT customer_name, customer_phone FROM quotations WHERE shop_id = ? AND customer_name != ''
    )
    ORDER BY customer_name ASC
    LIMIT 200
  `).bind(shopId, shopId).all();

  return c.json(results ?? []);
});

export default quotationsRouter;
