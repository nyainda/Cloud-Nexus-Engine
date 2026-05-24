import { Hono } from "hono";
import { eq, and, desc, sql } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { customers, sales, saleItems, debts } from "@workspace/db/schema";

const customersRouter = new Hono<AppEnv>();

customersRouter.get("/customers", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const q = (c.req.query("q") ?? "").toLowerCase().trim();

  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.shopId, shopId))
    .orderBy(desc(customers.createdAt))
    .all();

  const filtered = q
    ? rows.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.phone.toLowerCase().includes(q) ||
          (r.email ?? "").toLowerCase().includes(q),
      )
    : rows;

  // Attach aggregate stats via raw SQL for speed
  const stats = await db
    .select({
      customerId: sales.customerId,
      saleCount: sql<number>`COUNT(*)`,
      totalSpent: sql<number>`COALESCE(SUM(${sales.totalAmount}), 0)`,
    })
    .from(sales)
    .where(
      and(eq(sales.shopId, shopId), eq(sales.isDeleted, false)),
    )
    .groupBy(sales.customerId)
    .all();

  const debtStats = await db
    .select({
      customerId: debts.customerId,
      debtBalance: sql<number>`COALESCE(SUM(${debts.balance}), 0)`,
    })
    .from(debts)
    .where(eq(debts.shopId, shopId))
    .groupBy(debts.customerId)
    .all();

  const statsMap = Object.fromEntries(
    stats.map((s) => [s.customerId, { saleCount: s.saleCount, totalSpent: s.totalSpent }]),
  );
  const debtMap = Object.fromEntries(
    debtStats.map((d) => [d.customerId, d.debtBalance]),
  );

  return c.json(
    filtered.map((r) => ({
      ...r,
      saleCount: statsMap[r.id]?.saleCount ?? 0,
      totalSpent: statsMap[r.id]?.totalSpent ?? 0,
      debtBalance: debtMap[r.id] ?? 0,
    })),
  );
});

customersRouter.post("/customers", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const body = await c.req.json<{
    name: string;
    phone?: string;
    email?: string;
    notes?: string;
  }>();

  if (!body.name?.trim()) return c.json({ error: "name is required" }, 400);

  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.insert(customers).values({
    id,
    shopId,
    name: body.name.trim(),
    phone: body.phone?.trim() ?? "",
    email: body.email?.trim() ?? null,
    notes: body.notes?.trim() ?? null,
    createdAt: now,
    updatedAt: now,
  });

  const customer = await db.select().from(customers).where(eq(customers.id, id)).get();
  return c.json(customer, 201);
});

customersRouter.get("/customers/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const id = c.req.param("id");

  const customer = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
    .get();

  if (!customer) return c.json({ error: "Not found" }, 404);

  const customerSales = await db
    .select()
    .from(sales)
    .where(
      and(
        eq(sales.customerId, id),
        eq(sales.shopId, shopId),
        eq(sales.isDeleted, false),
      ),
    )
    .orderBy(desc(sales.createdAt))
    .limit(50)
    .all();

  const customerDebts = await db
    .select()
    .from(debts)
    .where(and(eq(debts.customerId, id), eq(debts.shopId, shopId)))
    .orderBy(desc(debts.createdAt))
    .all();

  const totalSpent = customerSales.reduce((s, r) => s + r.totalAmount, 0);
  const debtBalance = customerDebts.reduce((s, d) => s + d.balance, 0);

  return c.json({
    ...customer,
    saleCount: customerSales.length,
    totalSpent,
    debtBalance,
    sales: customerSales,
    debts: customerDebts,
  });
});

customersRouter.patch("/customers/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const id = c.req.param("id");
  const body = await c.req.json<{
    name?: string;
    phone?: string;
    email?: string;
    notes?: string;
  }>();

  const existing = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
    .get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  const patch: Partial<typeof existing> = { updatedAt: new Date().toISOString() };
  if (body.name !== undefined) patch.name = body.name.trim();
  if (body.phone !== undefined) patch.phone = body.phone.trim();
  if (body.email !== undefined) patch.email = body.email?.trim() ?? null;
  if (body.notes !== undefined) patch.notes = body.notes?.trim() ?? null;

  await db.update(customers).set(patch).where(eq(customers.id, id));
  const updated = await db.select().from(customers).where(eq(customers.id, id)).get();
  return c.json(updated);
});

customersRouter.delete("/customers/:id", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const session = c.get("session");
  const shopId = session.shopId;
  const id = c.req.param("id");

  const existing = await db
    .select()
    .from(customers)
    .where(and(eq(customers.id, id), eq(customers.shopId, shopId)))
    .get();
  if (!existing) return c.json({ error: "Not found" }, 404);

  await db.delete(customers).where(eq(customers.id, id));
  return c.json({ success: true });
});

export default customersRouter;
