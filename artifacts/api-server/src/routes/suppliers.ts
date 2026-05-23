import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { requireAuth } from "../middleware/auth";
import { suppliers } from "@workspace/db/schema";

const suppliersRouter = new Hono<AppEnv>();

suppliersRouter.get("/suppliers", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  const shopId = c.req.query("shopId");
  const rows = await db
    .select()
    .from(suppliers)
    .where(shopId ? eq(suppliers.shopId, shopId) : undefined)
    .all();
  return c.json(rows);
});

suppliersRouter.post("/suppliers", requireAuth, async (c) => {
  const body = await c.req.json<{
    shopId: string;
    name: string;
    phone?: string;
    notes?: string;
  }>();
  const db = createDb(c.env.DB);
  const id = crypto.randomUUID();
  await db.insert(suppliers).values({
    id,
    shopId: body.shopId,
    name: body.name,
    phone: body.phone ?? null,
    notes: body.notes ?? null,
    createdAt: new Date().toISOString(),
  });
  const supplier = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, id))
    .get();
  return c.json(supplier!, 201);
});

suppliersRouter.patch("/suppliers/:supplierId", requireAuth, async (c) => {
  const body = await c.req.json<{
    name?: string;
    phone?: string;
    notes?: string;
  }>();
  const db = createDb(c.env.DB);
  const patch: Partial<typeof suppliers.$inferInsert> = {};
  if (body.name) patch.name = body.name;
  if (body.phone !== undefined) patch.phone = body.phone;
  if (body.notes !== undefined) patch.notes = body.notes;
  await db
    .update(suppliers)
    .set(patch)
    .where(eq(suppliers.id, c.req.param("supplierId")));
  const supplier = await db
    .select()
    .from(suppliers)
    .where(eq(suppliers.id, c.req.param("supplierId")))
    .get();
  if (!supplier) return c.json({ error: "Not found" }, 404);
  return c.json(supplier);
});

suppliersRouter.delete("/suppliers/:supplierId", requireAuth, async (c) => {
  const db = createDb(c.env.DB);
  await db
    .delete(suppliers)
    .where(eq(suppliers.id, c.req.param("supplierId")));
  return c.body(null, 204);
});

export default suppliersRouter;
