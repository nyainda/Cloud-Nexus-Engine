import { Hono } from "hono";
import { eq, and, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { customers, debts } from "@workspace/db/schema";
import { normalizeCustomerName, customerNameKey } from "../lib/normalize";
import type { Db } from "../lib/db";

const crmRouter = new Hono<AppEnv>();

/**
 * Ensure at most one `customers` row exists per (shop, name). Renaming a
 * customer to a name that already belongs to another record used to leave
 * two rows with the identical display name sitting side by side — nothing
 * merged them, so the Customers page kept showing both indefinitely even
 * though the Debts page (which derives its view straight from the debts
 * table) already looked correctly harmonized. Call this after any write
 * that changes a customer's name so a collision self-heals immediately,
 * and it also cleans up any duplicate created before this fix existed.
 */
async function dedupeCustomersByName(db: Db, shopId: string, name: string) {
  const key = customerNameKey(name);
  const rows = await db.select().from(customers).where(eq(customers.shopId, shopId)).all();
  const matches = rows.filter((r) => customerNameKey(r.name) === key);
  if (matches.length <= 1) return matches[0] ?? null;

  // Keep the oldest record and fold in any contact details the newer
  // duplicate(s) have that the survivor is missing, then remove the rest.
  matches.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const survivor = matches[0]!;
  const dupes = matches.slice(1);
  const patch: Record<string, unknown> = { name: normalizeCustomerName(survivor.name) };
  for (const d of dupes) {
    if (!survivor.phone && d.phone) patch.phone = d.phone;
    if (!survivor.email && d.email) patch.email = d.email;
    if (!survivor.notes && d.notes) patch.notes = d.notes;
    if (survivor.creditLimit == null && d.creditLimit != null) patch.creditLimit = d.creditLimit;
  }
  await db.update(customers).set(patch).where(eq(customers.id, survivor.id)).run();
  for (const d of dupes) {
    await db.delete(customers).where(eq(customers.id, d.id)).run();
  }
  return db.select().from(customers).where(eq(customers.id, survivor.id)).get();
}

// ── Directory: registered customers + debt-discovered, merged ─────────────────
crmRouter.get("/crm", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") || "";
  const q = (c.req.query("q") ?? "").toLowerCase().trim();

  if (!shopId) return c.json([]);

  const [registered, debtRows] = await Promise.all([
    db.select().from(customers).where(eq(customers.shopId, shopId)).all(),
    db
      .select({
        customerName: debts.customerName,
        customerPhone: debts.customerPhone,
        balance: debts.balance,
        totalAmount: debts.totalAmount,
        status: debts.status,
        createdAt: debts.createdAt,
      })
      .from(debts)
      .where(eq(debts.shopId, shopId))
      .all(),
  ]);

  // Aggregate debt stats by customer name (lowercased)
  type DebtStats = {
    name: string;
    phone: string;
    totalBalance: number;
    totalOwed: number;
    debtCount: number;
    activeCount: number;
    lastActivity: string;
    latestDebtAmount: number;
    latestDebtBalance: number;
    latestDebtStatus: string;
  };
  const debtMap = new Map<string, DebtStats>();
  for (const d of debtRows) {
    const key = d.customerName.toLowerCase().trim();
    const ex = debtMap.get(key);
    if (!ex) {
      debtMap.set(key, {
        name: d.customerName,
        phone: d.customerPhone || "",
        totalBalance: d.status === "cancelled" ? 0 : (d.balance || 0),
        totalOwed: d.totalAmount || 0,
        debtCount: 1,
        activeCount: d.status !== "paid" && d.status !== "cancelled" ? 1 : 0,
        lastActivity: d.createdAt,
        latestDebtAmount: d.totalAmount || 0,
        latestDebtBalance: d.balance || 0,
        latestDebtStatus: d.status,
      });
    } else {
      ex.totalBalance += d.status === "cancelled" ? 0 : (d.balance || 0);
      ex.totalOwed += d.totalAmount || 0;
      ex.debtCount++;
      if (d.status !== "paid" && d.status !== "cancelled") ex.activeCount++;
      if (d.createdAt > ex.lastActivity) {
        ex.lastActivity = d.createdAt;
        ex.latestDebtAmount = d.totalAmount || 0;
        ex.latestDebtBalance = d.balance || 0;
        ex.latestDebtStatus = d.status;
        // Display the spelling/phone from the most recent debt, not whichever
        // row the (unordered) D1 select happened to return first. Without this,
        // an unregistered customer's name could flicker between old and new
        // casing on every reload depending on row order — not a rename actually
        // "not sticking", just the wrong row being used to label the group.
        ex.name = d.customerName;
        if (d.customerPhone) ex.phone = d.customerPhone;
      }
    }
  }

  type Entry = {
    id: string | null;
    name: string;
    phone: string;
    email: string | null;
    notes: string | null;
    creditLimit: number | null;
    registered: boolean;
    totalBalance: number;
    totalOwed: number;
    debtCount: number;
    activeCount: number;
    lastActivity: string | null;
    latestDebtAmount: number | null;
    latestDebtBalance: number | null;
    latestDebtStatus: string | null;
    createdAt: string;
  };

  const result: Entry[] = [];
  const covered = new Set<string>();

  for (const r of registered) {
    const key = r.name.toLowerCase().trim();
    covered.add(key);
    const stats = debtMap.get(key);
    result.push({
      id: r.id,
      name: r.name,
      phone: r.phone || "",
      email: r.email ?? null,
      notes: r.notes ?? null,
      creditLimit: r.creditLimit ?? null,
      registered: true,
      totalBalance: stats?.totalBalance ?? 0,
      totalOwed: stats?.totalOwed ?? 0,
      debtCount: stats?.debtCount ?? 0,
      activeCount: stats?.activeCount ?? 0,
      lastActivity: stats?.lastActivity ?? r.createdAt,
      latestDebtAmount: stats?.latestDebtAmount ?? null,
      latestDebtBalance: stats?.latestDebtBalance ?? null,
      latestDebtStatus: stats?.latestDebtStatus ?? null,
      createdAt: r.createdAt,
    });
  }

  for (const [key, stats] of debtMap.entries()) {
    if (covered.has(key)) continue;
    result.push({
      id: null,
      name: stats.name,
      phone: stats.phone,
      email: null,
      notes: null,
      creditLimit: null,
      registered: false,
      totalBalance: stats.totalBalance,
      totalOwed: stats.totalOwed,
      debtCount: stats.debtCount,
      activeCount: stats.activeCount,
      lastActivity: stats.lastActivity,
      latestDebtAmount: stats.latestDebtAmount,
      latestDebtBalance: stats.latestDebtBalance,
      latestDebtStatus: stats.latestDebtStatus,
      createdAt: stats.lastActivity,
    });
  }

  result.sort((a, b) =>
    b.totalBalance !== a.totalBalance
      ? b.totalBalance - a.totalBalance
      : a.name.localeCompare(b.name)
  );

  const filtered = q
    ? result.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.phone || "").includes(q) ||
          (e.email || "").toLowerCase().includes(q)
      )
    : result;

  return c.json(filtered);
});

// ── Profile by name (merges registered record + debt history) ─────────────────
crmRouter.get("/crm/profile", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId") || "";
  const name = (c.req.query("name") || "").trim();

  if (!shopId || !name) return c.json({ error: "shopId and name required" }, 400);

  const [allRegistered, allDebts] = await Promise.all([
    db.select().from(customers).where(eq(customers.shopId, shopId)).all(),
    db.select().from(debts).where(eq(debts.shopId, shopId)).all(),
  ]);

  const registered = allRegistered.find(
    (r) => r.name.toLowerCase().trim() === name.toLowerCase().trim()
  ) ?? null;

  const matchedDebts = allDebts
    .filter((d) => d.customerName.toLowerCase().trim() === name.toLowerCase().trim())
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const totalBalance = matchedDebts.reduce((s, d) => s + (d.status === "cancelled" ? 0 : (d.balance || 0)), 0);
  const totalOwed = matchedDebts.reduce((s, d) => s + (d.totalAmount || 0), 0);

  return c.json({
    registered: !!registered,
    customer: registered,
    debts: matchedDebts,
    stats: {
      totalBalance,
      totalOwed,
      totalPaid: totalOwed - totalBalance,
      debtCount: matchedDebts.length,
      activeCount: matchedDebts.filter((d) => d.status !== "paid" && d.status !== "cancelled").length,
    },
  });
});

// ── Create customer ───────────────────────────────────────────────────────────
crmRouter.post("/crm", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const body = await c.req.json<{
    shopId: string;
    name: string;
    phone?: string;
    email?: string;
    notes?: string;
    creditLimit?: number;
  }>();

  if (!body.shopId || !body.name) {
    return c.json({ error: "shopId and name are required" }, 400);
  }

  const name = normalizeCustomerName(body.name);
  const key = customerNameKey(name);

  // Same person, different casing/spacing typed at a different till — merge
  // into the existing record instead of creating a second "Jane Doe" /
  // "jane doe" entry that then has to be manually reconciled later.
  const existing = await db
    .select()
    .from(customers)
    .where(eq(customers.shopId, body.shopId))
    .all()
    .then((rows) => rows.find((r) => customerNameKey(r.name) === key) ?? null);

  if (existing) {
    const patch: Record<string, unknown> = {};
    if (body.phone?.trim()) patch.phone = body.phone.trim();
    if (body.email?.trim()) patch.email = body.email.trim();
    if (body.notes?.trim()) patch.notes = body.notes.trim();
    if (body.creditLimit != null) patch.creditLimit = body.creditLimit;
    if (Object.keys(patch).length > 0) {
      await db.update(customers).set(patch).where(eq(customers.id, existing.id)).run();
    }
    const merged = await db.select().from(customers).where(eq(customers.id, existing.id)).get();
    return c.json(merged, 200);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .insert(customers)
    .values({
      id,
      shopId: body.shopId,
      name,
      phone: (body.phone ?? "").trim(),
      email: body.email?.trim() || null,
      notes: body.notes?.trim() || null,
      creditLimit: body.creditLimit ?? null,
      createdAt: now,
    })
    .run();

  const created = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .get();

  return c.json(created, 201);
});

// ── Get single registered customer (with debt summary) ────────────────────────
crmRouter.get("/crm/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const shopId = c.req.query("shopId") || "";

  const customer = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
    .get();

  if (!customer) return c.json({ error: "Customer not found" }, 404);

  const allDebts = await db
    .select()
    .from(debts)
    .where(eq(debts.shopId, shopId))
    .all();

  const matchedDebts = allDebts.filter(
    (d) => d.customerName.toLowerCase().trim() === customer.name.toLowerCase().trim()
  );

  const totalBalance = matchedDebts.reduce((s, d) => s + (d.status === "cancelled" ? 0 : (d.balance || 0)), 0);
  const totalOwed = matchedDebts.reduce((s, d) => s + (d.totalAmount || 0), 0);

  return c.json({
    ...customer,
    debts: matchedDebts,
    stats: {
      totalBalance,
      totalOwed,
      totalPaid: totalOwed - totalBalance,
      debtCount: matchedDebts.length,
      activeCount: matchedDebts.filter((d) => d.status !== "paid" && d.status !== "cancelled").length,
    },
  });
});

// ── Rename unregistered customer (debt-name only, no customer record) ─────────
// MUST be registered before /crm/:id so "rename" isn't captured as an :id param
crmRouter.patch("/crm/rename", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const body = await c.req.json<{
    shopId: string;
    oldName: string;
    newName: string;
    phone?: string;
  }>();

  if (!body.shopId || !body.oldName || !body.newName) {
    return c.json({ error: "shopId, oldName, and newName are required" }, 400);
  }

  const newName = normalizeCustomerName(body.newName);
  const shopId = body.shopId;

  // Update all debts matching the old name
  const result = await db
    .update(debts)
    .set({
      customerName: newName,
      ...(body.phone !== undefined ? { customerPhone: body.phone.trim() } : {}),
    })
    .where(
      and(
        eq(debts.shopId, shopId),
        sql`LOWER(TRIM(${debts.customerName})) = LOWER(TRIM(${body.oldName}))`
      )
    )
    .run();

  // Also update a registered customer record if one exists with that name
  const existingReg = await db
    .select()
    .from(customers)
    .where(eq(customers.shopId, shopId))
    .all()
    .then(rows => rows.find(r => r.name.toLowerCase().trim() === body.oldName.toLowerCase().trim()) ?? null);

  if (existingReg) {
    const patch: Record<string, unknown> = { name: newName };
    if (body.phone !== undefined) patch.phone = body.phone.trim();
    await db.update(customers).set(patch).where(eq(customers.id, existingReg.id)).run();
  }

  // The new name may already belong to a different registered customer —
  // merge them into one row instead of leaving two records with the same
  // name for the Customers page to show side by side.
  const merged = await dedupeCustomersByName(db, shopId, newName);

  return c.json({
    updated: (result as { changes?: number }).changes ?? 0,
    registeredUpdated: !!existingReg,
    customer: merged,
  });
});

// ── Update customer ───────────────────────────────────────────────────────────
crmRouter.patch("/crm/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const body = await c.req.json<{
    shopId?: string;
    name?: string;
    phone?: string;
    email?: string | null;
    notes?: string | null;
    creditLimit?: number | null;
  }>();
  const shopId = (c.req.query("shopId") || body.shopId || "").toString();

  const existing = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
    .get();

  if (!existing) return c.json({ error: "Not found" }, 404);

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = normalizeCustomerName(body.name);
  if (body.phone !== undefined) patch.phone = body.phone.trim();
  if ("email" in body) patch.email = body.email?.trim() || null;
  if ("notes" in body) patch.notes = body.notes?.trim() || null;
  if ("creditLimit" in body) patch.creditLimit = body.creditLimit ?? null;

  const nameChanged = body.name !== undefined && normalizeCustomerName(body.name) !== existing.name;

  if (Object.keys(patch).length > 0) {
    await db.update(customers).set(patch).where(eq(customers.id, id)).run();
  }

  // Cascade name change to all debt records for this shop
  if (nameChanged && body.name) {
    const newName = normalizeCustomerName(body.name);
    await db
      .update(debts)
      .set({ customerName: newName })
      .where(
        and(
          eq(debts.shopId, shopId),
          sql`LOWER(TRIM(${debts.customerName})) = LOWER(TRIM(${existing.name}))`
        )
      )
      .run();
  }

  // If the new name matches a different existing customer, merge them into
  // one row now rather than leaving two records with the same display name.
  const updated = nameChanged && body.name
    ? await dedupeCustomersByName(db, shopId, normalizeCustomerName(body.name))
    : await db.select().from(customers).where(eq(customers.id, id)).get();
  return c.json(updated);
});

// ── Delete customer ───────────────────────────────────────────────────────────
crmRouter.delete("/crm/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const id = c.req.param("id");
  const shopId = c.req.query("shopId") || "";

  const existing = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
    .get();

  if (!existing) return c.json({ error: "Not found" }, 404);

  await db.delete(customers).where(eq(customers.id, id)).run();
  return c.body(null, 204);
});

export default crmRouter;
