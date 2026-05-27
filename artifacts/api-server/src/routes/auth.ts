import { Hono } from "hono";
import { eq } from "drizzle-orm";
import type { AppEnv } from "../types";
import { createDb } from "../lib/db";
import {
  hashPin,
  verifyPin,
  createSession,
  deleteSession,
  getSession,
} from "../lib/auth";
import { shops } from "@workspace/db/schema";

const auth = new Hono<AppEnv>();

auth.post("/auth/login", async (c) => {
  const body = await c.req.json<{
    shopId: string;
    role: "owner" | "cashier";
    pin: string;
    userName?: string;
  }>();
  const db = createDb(c.env.DB);
  const shop = await db
    .select()
    .from(shops)
    .where(eq(shops.id, body.shopId))
    .get();
  if (!shop) return c.json({ error: "Shop not found" }, 401);

  const hashToCheck =
    body.role === "owner" ? shop.ownerPinHash : shop.cashierPinHash;
  const valid = await verifyPin(body.pin, hashToCheck);
  if (!valid) return c.json({ error: "Invalid PIN" }, 401);

  const token = await createSession(c.env.SESSIONS, {
    shopId: shop.id,
    role: body.role,
    userName: body.userName ?? null,
    shopName: shop.name,
  });

  return c.json({
    token,
    role: body.role,
    shopId: shop.id,
    shopName: shop.name,
    userName: body.userName ?? null,
  });
});

auth.get("/auth/session", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return c.json({ error: "No session" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");
  const session = await getSession(c.env.SESSIONS, token);
  if (!session) return c.json({ error: "Session expired" }, 401);
  return c.json(session);
});

auth.post("/auth/logout", async (c) => {
  const authHeader = c.req.header("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    await deleteSession(c.env.SESSIONS, authHeader.replace("Bearer ", ""));
  }
  return c.json({ success: true });
});

auth.post("/auth/verify-pin", async (c) => {
  const body = await c.req.json<{ shopId: string; pin: string }>();
  const db = createDb(c.env.DB);
  const shop = await db
    .select()
    .from(shops)
    .where(eq(shops.id, body.shopId))
    .get();
  if (!shop) return c.json({ error: "Shop not found" }, 401);
  const valid = await verifyPin(body.pin, shop.ownerPinHash);
  if (!valid) return c.json({ error: "Invalid PIN" }, 401);
  return c.json({ success: true });
});

// PIN reset — verified by shop name (no auth token required)
auth.post("/auth/reset-pin", async (c) => {
  const body = await c.req.json<{
    shopId: string;
    role: "owner" | "cashier";
    shopName: string;
    newPin: string;
  }>();

  if (!body.shopId || !body.shopName || !body.newPin || body.newPin.length < 4) {
    return c.json({ error: "Invalid request" }, 400);
  }

  const db = createDb(c.env.DB);
  const shop = await db.select().from(shops).where(eq(shops.id, body.shopId)).get();
  if (!shop) return c.json({ error: "Shop not found" }, 404);

  // Verify by shop name (case-insensitive)
  const normalise = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  if (normalise(body.shopName) !== normalise(shop.name)) {
    return c.json({ error: "Shop name does not match. Check your spelling and try again." }, 403);
  }

  const newHash = await hashPin(body.newPin);
  const patch = body.role === "owner"
    ? { ownerPinHash: newHash }
    : { cashierPinHash: newHash };

  await db.update(shops).set(patch).where(eq(shops.id, body.shopId));
  return c.json({ success: true });
});

export default auth;
