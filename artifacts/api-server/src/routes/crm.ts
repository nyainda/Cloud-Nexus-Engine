import { Hono } from "hono";
import { eq, and } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { customers, debts } from "@workspace/db/schema";

const crmRouter = new Hono<AppEnv>();

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
  };
  const debtMap = new Map<string, DebtStats>();
  for (const d of debtRows) {
    const key = d.customerName.toLowerCase().trim();
    const ex = debtMap.get(key);
    if (!ex) {
      debtMap.set(key, {
        name: d.customerName,
        phone: d.customerPhone || "",
        totalBalance: d.balance || 0,
        totalOwed: d.totalAmount || 0,
        debtCount: 1,
        activeCount: d.status !== "paid" ? 1 : 0,
        lastActivity: d.createdAt,
      });
    } else {
      ex.totalBalance += d.balance || 0;
      ex.totalOwed += d.totalAmount || 0;
      ex.debtCount++;
      if (d.status !== "paid") ex.activeCount++;
      if (d.createdAt > ex.lastActivity) ex.lastActivity = d.createdAt;
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

  const matchedDebts = allDebts.filter(
    (d) => d.customerName.toLowerCase().trim() === name.toLowerCase().trim()
  );

  const totalBalance = matchedDebts.reduce((s, d) => s + (d.balance || 0), 0);
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
      activeCount: matchedDebts.filter((d) => d.status !== "paid").length,
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

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  await db
    .insert(customers)
    .values({
      id,
      shopId: body.shopId,
      name: body.name.trim(),
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

  const totalBalance = matchedDebts.reduce((s, d) => s + (d.balance || 0), 0);
  const totalOwed = matchedDebts.reduce((s, d) => s + (d.totalAmount || 0), 0);

  return c.json({
    ...customer,
    debts: matchedDebts,
    stats: {
      totalBalance,
      totalOwed,
      totalPaid: totalOwed - totalBalance,
      debtCount: matchedDebts.length,
      activeCount: matchedDebts.filter((d) => d.status !== "paid").length,
    },
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
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.phone !== undefined) patch.phone = body.phone.trim();
  if ("email" in body) patch.email = body.email?.trim() || null;
  if ("notes" in body) patch.notes = body.notes?.trim() || null;
  if ("creditLimit" in body) patch.creditLimit = body.creditLimit ?? null;

  if (Object.keys(patch).length > 0) {
    await db.update(customers).set(patch).where(eq(customers.id, id)).run();
  }

  const updated = await db
    .select()
    .from(customers)
    .where(eq(customers.id, id))
    .get();
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
