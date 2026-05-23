import XLSX from "xlsx";
import path from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import fs from "fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const EXCEL_FILE = path.join(ROOT, "attached_assets/products-export-2026-05-14_1779432708592.xlsx");
const WRANGLER_DIR = path.join(ROOT, "artifacts/api-server");

const SHOP_A_ID = "shop-greenlink";
const SHOP_B_ID = "shop-sunrise";

function normalize(name: string): string {
  return (name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function inferCategory(name: string): string {
  const n = name.toLowerCase();
  if (/herbicide|weedicide|roundup|ally\b|basagran|touchdown|gesaprim|atrazine|2,4-d|glyphosate|paraquat|pendimethalin|metolachlor|rimsulfuron/.test(n)) return "Herbicides";
  if (/fungicide|mancozeb|ridomil|dithane|score|copper|sysco|cabrio|revus|acrobat|benomyl|chlorothalonil|iprodione|metalaxyl/.test(n)) return "Fungicides";
  if (/insecticide|cypermethrin|dimethoate|lambda|karate|actellic|chlorpyrifos|imidacloprid|thiamethoxam|abamectin|emamectin|bifenthrin/.test(n)) return "Insecticides";
  if (/fertilizer|fertiliser|urea|dap|can|npk|crf|basal|top dress|foliar|calcium|boron|sulphate|nitrate|phosphate|potassium|micronutrient/.test(n)) return "Fertilizers";
  if (/seed|hybrid|variety|maize|bean|sorghum|sunflower|wheat|barley|cowpea|soybean/.test(n)) return "Seeds";
  if (/sprayer|pump|nozzle|hose|tank|knapsack|equipment|tool/.test(n)) return "Equipment";
  if (/acaricide|miticide|tick|mite|acari/.test(n)) return "Acaricides";
  if (/vet|animal|livestock|poultry|cattle|dog|cat|rabbit|pig|sheep|goat|vitamin|mineral|dewormer|vaccine/.test(n)) return "Animal Health";
  return "Agrochemicals";
}

function wrangler(cmd: string): string {
  return execSync(
    `CLOUDFLARE_API_TOKEN=${process.env.CLOUDFLARE_API_TOKEN} CLOUDFLARE_ACCOUNT_ID=${process.env.CLOUDFLARE_ACCOUNT_ID} npx wrangler ${cmd}`,
    { cwd: WRANGLER_DIR, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 }
  );
}

function d1(sql: string): void {
  // Write SQL to temp file to avoid shell escaping issues
  const tmpFile = `/tmp/d1_batch_${Date.now()}.sql`;
  fs.writeFileSync(tmpFile, sql);
  execSync(
    `CLOUDFLARE_API_TOKEN=${process.env.CLOUDFLARE_API_TOKEN} CLOUDFLARE_ACCOUNT_ID=${process.env.CLOUDFLARE_ACCOUNT_ID} npx wrangler d1 execute greenlink-db --remote --file ${tmpFile}`,
    { cwd: WRANGLER_DIR, encoding: "utf8", maxBuffer: 50 * 1024 * 1024, stdio: "pipe" }
  );
  fs.unlinkSync(tmpFile);
}

async function seed() {
  console.log("Reading Excel file...");
  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[];

  const raw = rows.filter(
    (r) => r["PRODUCT TYPE (single or variable)"] === "single" && Number(r["SELLING PRICE"]) > 0
  );

  const seen = new Set<string>();
  const deduped: typeof raw = [];
  for (const r of raw) {
    const key = normalize(String(r.NAME || ""));
    if (key && !seen.has(key)) { seen.add(key); deduped.push(r); }
  }

  let fixedCount = 0;
  const cleaned = deduped.map((r) => {
    let buy = Number(r["PURCHASE PRICE (Excluding tax)"]) || 0;
    let sell = Number(r["SELLING PRICE"]) || 0;
    const margin = Number(r["PROFIT MARGIN"]) || 20;
    const alertQty = Number(r["ALERT QUANTITY"]) || 5;
    const sku = String(r["SKU (Leave blank to auto generate sku)"] || "").trim();
    const unit = String(r["UNIT OF MEASURE"] || "unit").trim() || "unit";
    const size = String(r["SIZE/WEIGHT"] || "").trim() || null;
    const name = String(r.NAME || "").trim();
    const category = inferCategory(name);

    if (buy === 0 && margin > 0) buy = sell * (1 - margin / 100);
    if (buy > sell && buy > 0 && sell > 0) { [buy, sell] = [sell, buy]; fixedCount++; }

    return { name, sku: sku || null, category, unit, buy, sell, margin, alertQty, size };
  });

  console.log(`Clean products: ${cleaned.length} | Fixed pricing: ${fixedCount}`);

  for (const shopId of [SHOP_A_ID, SHOP_B_ID]) {
    const shopLabel = shopId === SHOP_A_ID ? "GreenLink" : "Sunrise";
    console.log(`\nSeeding ${shopLabel} (${shopId})...`);

    // Clear existing products for this shop
    d1(`DELETE FROM products WHERE shop_id = '${shopId}';`);
    console.log("  Cleared existing products");

    const BATCH = 100;
    const now = new Date().toISOString();

    for (let i = 0; i < cleaned.length; i += BATCH) {
      const batch = cleaned.slice(i, i + BATCH);
      const values = batch.map((p) => {
        const id = `${shopId.replace("shop-", "")}-${(i + batch.indexOf(p)).toString().padStart(5, "0")}`;
        const normName = normalize(p.name);
        const profitMargin = p.buy > 0 && p.sell > 0 ? ((p.sell - p.buy) / p.sell) * 100 : p.margin;
        const esc = (s: string | null) => s === null ? "NULL" : `'${s.replace(/'/g, "''")}'`;
        return `(${esc(id)},${esc(shopId)},${esc(p.name)},${esc(normName)},${p.sku ? esc(p.sku) : "NULL"},${esc(p.category)},${esc(p.unit)},${p.buy},${p.sell},${profitMargin.toFixed(4)},0,${p.alertQty},NULL,${p.size ? esc(p.size) : "NULL"},1,NULL,${esc(now)},${esc(now)})`;
      }).join(",\n");

      d1(`INSERT OR REPLACE INTO products (id,shop_id,canonical_name,normalized_name,sku,category,unit,purchase_price,selling_price,profit_margin,stock_qty,alert_qty,tokens_json,size,is_active,last_sold_at,created_at,updated_at) VALUES\n${values};`);

      if ((i + BATCH) % 500 === 0 || i + BATCH >= cleaned.length) {
        console.log(`  ${Math.min(i + BATCH, cleaned.length)} / ${cleaned.length}`);
      }
    }
    console.log(`  ✓ Inserted ${cleaned.length} products`);
  }

  // Count total
  const result = wrangler(`d1 execute greenlink-db --remote --command "SELECT COUNT(*) as n FROM products;"`);
  const match = result.match(/\d+/g);
  const total = match ? match[match.length - 1] : "?";
  console.log(`\n✅ Done! Total products in CF D1: ${total}`);
}

seed().catch((err) => {
  console.error("SEED FAILED:", err.message);
  process.exit(1);
});
