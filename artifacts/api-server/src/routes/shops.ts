import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import { hashPin } from "../lib/auth";
import { requireAuth } from "../middleware/auth";
import { shops } from "@workspace/db/schema";

const shopsRouter = new Hono<AppEnv>();

shopsRouter.get("/shops", async (c) => {
  const db = createDb(c.env.DB);
  const rows = await db.select().from(shops).all();
  return c.json(
    rows.map((s) => ({
      id: s.id,
      name: s.name,
      ownerWhatsapp: s.ownerWhatsapp,
      createdAt: s.createdAt,
    })),
  );
});

shopsRouter.post("/shops", async (c) => {
  const body = await c.req.json<{
    name: string;
    ownerWhatsapp?: string;
    ownerPin: string;
    cashierPin: string;
  }>();
  const db = createDb(c.env.DB);
  const [ownerHash, cashierHash] = await Promise.all([
    hashPin(body.ownerPin),
    hashPin(body.cashierPin),
  ]);
  const id = crypto.randomUUID();
  await db.insert(shops).values({
    id,
    name: body.name,
    ownerWhatsapp: body.ownerWhatsapp ?? null,
    ownerPinHash: ownerHash,
    cashierPinHash: cashierHash,
    createdAt: new Date().toISOString(),
  });
  const shop = await db.select().from(shops).where(eq(shops.id, id)).get();
  return c.json(
    {
      id: shop!.id,
      name: shop!.name,
      ownerWhatsapp: shop!.ownerWhatsapp,
      createdAt: shop!.createdAt,
    },
    201,
  );
});

shopsRouter.get("/shops/:shopId", async (c) => {
  const db = createDb(c.env.DB);
  const shop = await db
    .select()
    .from(shops)
    .where(eq(shops.id, c.req.param("shopId")))
    .get();
  if (!shop) return c.json({ error: "Not found" }, 404);
  return c.json({
    id: shop.id,
    name: shop.name,
    ownerName: (shop as any).ownerName ?? null,
    address: (shop as any).address ?? null,
    email: (shop as any).email ?? null,
    ownerWhatsapp: shop.ownerWhatsapp,
    hasGeminiKey: !!shop.geminiApiKey,
    hasGroqKey: !!shop.groqApiKey,
    createdAt: shop.createdAt,
  });
});

shopsRouter.patch("/shops/:shopId", requireAuth, async (c) => {
  const body = await c.req.json<{
    name?: string;
    ownerName?: string;
    address?: string;
    email?: string;
    ownerWhatsapp?: string;
    ownerPin?: string;
    cashierPin?: string;
    geminiApiKey?: string | null;
    groqApiKey?: string | null;
  }>();
  const db = createDb(c.env.DB);
  const patch: Partial<typeof shops.$inferInsert> = {};
  if (body.name) patch.name = body.name;
  if (body.ownerName !== undefined) (patch as any).ownerName = body.ownerName;
  if (body.address !== undefined) (patch as any).address = body.address;
  if (body.email !== undefined) (patch as any).email = body.email;
  if (body.ownerWhatsapp !== undefined) patch.ownerWhatsapp = body.ownerWhatsapp;
  if (body.ownerPin) patch.ownerPinHash = await hashPin(body.ownerPin);
  if (body.cashierPin) patch.cashierPinHash = await hashPin(body.cashierPin);
  if (body.geminiApiKey !== undefined) patch.geminiApiKey = body.geminiApiKey || null;
  if (body.groqApiKey !== undefined) patch.groqApiKey = body.groqApiKey || null;
  await db.update(shops).set(patch).where(eq(shops.id, c.req.param("shopId")));
  const shop = await db
    .select()
    .from(shops)
    .where(eq(shops.id, c.req.param("shopId")))
    .get();
  if (!shop) return c.json({ error: "Not found" }, 404);
  return c.json({
    id: shop.id,
    name: shop.name,
    ownerName: (shop as any).ownerName ?? null,
    address: (shop as any).address ?? null,
    email: (shop as any).email ?? null,
    ownerWhatsapp: shop.ownerWhatsapp,
    hasGeminiKey: !!shop.geminiApiKey,
    hasGroqKey: !!shop.groqApiKey,
    createdAt: shop.createdAt,
  });
});

export default shopsRouter;
