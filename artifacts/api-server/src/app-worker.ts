import { Hono } from "hono";
import { cors } from "hono/cors";
import { drizzle } from "drizzle-orm/d1";
import type { Env, Variables } from "./types";
import { hashPin } from "./lib/auth";
import * as schema from "@workspace/db/schema";
import { shops } from "@workspace/db/schema";
import { eq } from "drizzle-orm";

import authRouter from "./routes/auth";
import shopsRouter from "./routes/shops";
import productsRouter from "./routes/products";
import salesRouter from "./routes/sales";
import debtsRouter from "./routes/debts";
import inventoryRouter from "./routes/inventory";
import notificationsRouter from "./routes/notifications";
import reportsRouter from "./routes/reports";
import suppliersRouter from "./routes/suppliers";
import ocrRouter from "./routes/ocr";
import storageRouter from "./routes/storage";
import auditRouter from "./routes/audit";
import healthRouter from "./routes/health";
import quotationsRouter from "./routes/quotations";
import pushRouter from "./routes/push";

const SHOP_A_ID = "shop-greenlink";
const SHOP_B_ID = "shop-sunrise";

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowHeaders: ["Content-Type", "Authorization"],
  }),
);

// Wire up D1 and env overrides
app.use("*", async (c, next) => {
  // Patch createDb to use D1 binding when available
  if (c.env.DB) {
    (c as any).__d1 = c.env.DB;
  }
  c.env.GEMINI_API_KEY = c.env.GEMINI_API_KEY ?? undefined;
  await next();

  // Cache-Control headers
  if (c.req.method === "GET") {
    const urlPath = new URL(c.req.url).pathname;
    const isPublic = urlPath === "/api/shops" || urlPath.startsWith("/api/health");
    if (isPublic) {
      c.res.headers.set("Cache-Control", "public, max-age=120, stale-while-revalidate=300");
    } else if (c.res.status < 400) {
      c.res.headers.set("Cache-Control", "private, max-age=30, stale-while-revalidate=60");
    }
  } else {
    c.res.headers.set("Cache-Control", "no-store");
  }
});

app.route("/api", authRouter);
app.route("/api", shopsRouter);
app.route("/api", productsRouter);
app.route("/api", salesRouter);
app.route("/api", debtsRouter);
app.route("/api", inventoryRouter);
app.route("/api", notificationsRouter);
app.route("/api", reportsRouter);
app.route("/api", suppliersRouter);
app.route("/api", ocrRouter);
app.route("/api", storageRouter);
app.route("/api", auditRouter);
app.route("/api", healthRouter);
app.route("/api", quotationsRouter);
app.route("/api", pushRouter);

app.all("*", (c) => c.json({ error: "Not found" }, 404));

export default app;
