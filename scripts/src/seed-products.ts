import XLSX from "xlsx";
import crypto from "crypto";
import { createClient } from "@libsql/client";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const DB_FILE = process.env.DB_PATH ?? `${ROOT}/artifacts/api-server/data/greenlink.db`;
const client = createClient({ url: `file:${DB_FILE}` });

const SHOP_A_ID = "8a56a764-da03-4114-a0d8-a3509d62f592";
const SHOP_B_ID = "6fad0f53-a304-4910-826f-b6dcd15524db";
const EXCEL_FILE = path.join(ROOT, "attached_assets/products-export-2026-05-14_1779432708592.xlsx");

function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (/herbicide|weedicide|roundup|ally\b|basagran|touchdown|gesaprim|atrazine|2,4-d|glyphosate|paraquat|pendimethalin|metolachlor|rimsulfuron/.test(n)) return "Herbicides";
  if (/fungicide|mancoz|ridomil|score\b|dithane|copper\b|benomyl|carbendazim|propiconazole|azoxystrobin|metalaxyl|chlorothalonil/.test(n)) return "Fungicides";
  if (/insecticide|lambda|karate|duduthrin|cypress\b|actellic|dimethoate|imidacloprid|chlorpyrifos|deltamethrin|emamectin|spinosad|abamectin|bifenthrin|cypermethrin/.test(n)) return "Insecticides";
  if (/fertilizer|fertiliser|\bcaf\b|urea\b|npk|dap\b|\bcan\b|\bcna\b|kcl|potassium|phosphate|foliar|biostimul|seaweed|humic|amino acid|micronutrient/.test(n)) return "Fertilizers";
  if (/\bseed\b|\bseeds\b|\bmaize\b|\bbeans\b|\bpea\b|soya|sunflower seed|sorghum|\bwheat\b|tomato.*\d|pepper.*\d|cabbage.*\d|kale.*\d|onion.*\d|carrot.*\d|watermelon.*\d|pumpkin.*\d|cucumber.*\d/.test(n)) return "Seeds";
  if (/pump|sprayer|hose|nozzle|irrigation|drip|\btank\b|\bdrum\b|jerican|tarpaulin|greenhouse/.test(n)) return "Equipment";
  if (/acaricide|\btick\b|lice|mange|\bdip\b|pour.on|fluke|tapeworm|dewormer/.test(n)) return "Acaricides";
  if (/animal|cattle|poultry|\bpig\b|goat|sheep|\bvet\b|vitamin|mineral|\bsalt\b|supplement|\bfeed\b|premix|maziwa|dairy|livestock|broiler|layer/.test(n)) return "Animal Health";
  return "Agrochemicals";
}

function normalize(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

async function ensureShops(ownerHash: string, cashierHash: string) {
  const now = new Date().toISOString();
  for (const [id, name, whatsapp] of [
    [SHOP_A_ID, "GreenLink Farm Supplies", "+254700000000"],
    [SHOP_B_ID, "Sunrise Agrovet", null],
  ] as const) {
    await client.execute({
      sql: `INSERT OR IGNORE INTO shops (id, name, owner_pin_hash, cashier_pin_hash, owner_whatsapp, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [id, name, ownerHash, cashierHash, whatsapp ?? null, now],
    });
  }
}

async function hashPin(pin: string): Promise<string> {
  const { createHash } = await import("crypto");
  // Mirror the server's Web Crypto SHA-256 with greenlink: prefix
  const data = Buffer.from(`greenlink:${pin}`, "utf8");
  return createHash("sha256").update(data).digest("hex");
}

async function seed() {
  // Disable FK checks so we can freely delete/re-insert
  await client.execute("PRAGMA foreign_keys = OFF");

  // Ensure both shops exist
  const [ownerHash, cashierHash] = await Promise.all([hashPin("1234"), hashPin("5678")]);
  await ensureShops(ownerHash, cashierHash);

  console.log("Reading Excel file...");
  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

  const raw = rows.filter(
    (r) => r["PRODUCT TYPE (single or variable)"] === "single" && Number(r["SELLING PRICE"]) > 0
  );
  console.log("Single products with price:", raw.length);

  // Deduplicate by normalized name (keep first)
  const seen = new Set<string>();
  const deduped: typeof raw = [];
  for (const r of raw) {
    const key = normalize(String(r.NAME || ""));
    if (key && !seen.has(key)) { seen.add(key); deduped.push(r); }
  }
  console.log(`After dedup: ${deduped.length} (removed ${raw.length - deduped.length} duplicates)`);

  // Clean pricing
  let fixedCount = 0;
  const cleaned = deduped.map((r) => {
    let buy = Number(r["PURCHASE PRICE (Excluding tax)"]) || 0;
    let sell = Number(r["SELLING PRICE"]) || 0;
    const margin = Number(r["PROFIT MARGIN"]) || 20;
    const alertQty = Number(r["ALERT QUANTITY"]) || 5;
    const sku = String(r["SKU (Leave blank to auto generate sku)"] || "").trim();

    // Fix: swap when buying price entered as selling and vice versa
    if (buy > sell && sell > 0) { [buy, sell] = [sell, buy]; fixedCount++; }
    // Fix: missing buying price — derive from margin
    if (buy <= 0 && sell > 0) buy = Math.round(sell / (1 + margin / 100));
    // Fix: still inverted after swap (extreme outlier) — compute sell from buy
    if (sell <= buy) sell = Math.round(buy * (1 + margin / 100));

    const finalMargin = buy > 0 ? Math.round(((sell - buy) / buy) * 100 * 100) / 100 : margin;

    return {
      name: String(r.NAME || "").trim(),
      sku: sku || null,
      unit: String(r.UNIT || "Pc(s)").trim(),
      category: inferCategory(String(r.NAME || "")),
      buyingPrice: buy,
      sellingPrice: sell,
      profitMargin: finalMargin,
      alertQty,
    };
  });

  console.log(`Fixed pricing on: ${fixedCount} products`);
  console.log(`Total clean products: ${cleaned.length}`);

  const stillBad = cleaned.filter((p) => p.buyingPrice >= p.sellingPrice);
  if (stillBad.length > 0) {
    console.error("WARNING — still bad pricing:", stillBad.length);
    stillBad.forEach((p) => console.error("  ", p.name, p.buyingPrice, "vs", p.sellingPrice));
  } else {
    console.log("All pricing validated: buying < selling ✓");
  }

  // Seed both shops
  for (const shopId of [SHOP_A_ID, SHOP_B_ID]) {
    const shopName = shopId === SHOP_A_ID ? "GreenLink Farm Supplies" : "Sunrise Agrovet";
    console.log(`\nSeeding ${shopName}...`);

    await client.execute({ sql: "DELETE FROM products WHERE shop_id = ?", args: [shopId] });
    console.log("  Cleared existing products");

    let inserted = 0;
    for (const p of cleaned) {
      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const tokens = JSON.stringify(normalize(p.name).split(" ").filter((t) => t.length > 1));
      await client.execute({
        sql: `INSERT INTO products (id, shop_id, canonical_name, normalized_name, sku, category, unit,
                purchase_price, selling_price, profit_margin, stock_qty, alert_qty, tokens_json,
                is_active, created_at, updated_at)
              VALUES (?,?,?,?,?,?,?,?,?,?,0,?,?,1,?,?)`,
        args: [
          id, shopId, p.name, normalize(p.name), p.sku, p.category, p.unit,
          p.buyingPrice, p.sellingPrice, p.profitMargin, p.alertQty, tokens, now, now,
        ],
      });
      inserted++;
      if (inserted % 500 === 0) console.log(`  ${inserted} / ${cleaned.length}`);
    }
    console.log(`  Inserted ${inserted} products ✓`);
  }

  const total = await client.execute({ sql: "SELECT COUNT(*) as n FROM products", args: [] });
  console.log(`\n✅ Done! Total products in DB: ${total.rows[0].n}`);
  process.exit(0);
}

seed().catch((e) => { console.error("SEED FAILED:", e.message); process.exit(1); });
