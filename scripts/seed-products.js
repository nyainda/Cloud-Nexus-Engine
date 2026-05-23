const XLSX = require('xlsx');
const crypto = require('crypto');
const { createClient } = require('@libsql/client');

const DB_PATH = process.env.LIBSQL_URL || 'file:data/greenlink.db';
const client = createClient({ url: DB_PATH });

const SHOP_A_ID = '8a56a764-da03-4114-a0d8-a3509d62f592'; // GreenLink Farm Supplies
const SHOP_B_ID = '6fad0f53-a304-4910-826f-b6dcd15524db'; // Sunrise Agrovet
const EXCEL_FILE = 'attached_assets/products-export-2026-05-14_1779432708592.xlsx';

function inferCategory(name) {
  const n = name.toLowerCase();
  if (/herbicide|weedicide|roundup|ally\b|basagran|touchdown|gesaprim|atrazine|2,4-d|glyphosate|paraquat|pendimethalin|metolachlor|rimsulfuron|terbutryn|prometryn|trifluralin|diuron|linuron/.test(n)) return 'Herbicides';
  if (/fungicide|mancoz|ridomil|score\b|dithane|copper\b|benomyl|carbendazim|propiconazole|azoxystrobin|metalaxyl|chlorothalonil|iprodione|cymoxanil|famoxadone|fosetyl/.test(n)) return 'Fungicides';
  if (/insecticide|lambda|karate|duduthrin|cypress\b|actellic|dimethoate|imidacloprid|chlorpyrifos|deltamethrin|emamectin|spinosad|abamectin|bifenthrin|cypermethrin|malathion|fipronil|thiamethoxam|acetamiprid/.test(n)) return 'Insecticides';
  if (/fertilizer|fertiliser|\bcaf\b|urea\b|npk|dap\b|can\b|cna\b|kcl|potassium|phosphate|nitrogen\b|boron|calcium\b|magnesium|micronutrient|foliar|biostimul|seaweed|humic|amino acid|compost|manure|lime\b|gypsum/.test(n)) return 'Fertilizers';
  if (/\bseed\b|seeds\b|maize\b|beans\b|pea\b|soya|sunflower seed|sorghum|wheat\b|barley\b|tomato.*\d|pepper.*\d|cabbage.*\d|kale.*\d|spinach.*\d|onion.*\d|carrot.*\d|watermelon.*\d|melon.*\d|pumpkin.*\d|cucumber.*\d|squash.*\d|courgette.*\d|broccoli.*\d|cauliflower.*\d|lettuce.*\d|beetroot.*\d|radish.*\d|turnip.*\d/.test(n)) return 'Seeds';
  if (/pump|sprayer|hose|nozzle|pipe|irrigation|drip|tank\b|drum\b|jerican|bucket|sack\b|\bbag\b|twine|rope|tarpaulin|greenhouse/.test(n)) return 'Equipment';
  if (/acaricide|tick\b|lice|mange|dip\b|cattle dip|pour.on|fluke|tapeworm|roundworm|dewormer/.test(n)) return 'Acaricides';
  if (/animal|cattle|poultry|pig\b|goat|sheep|vet\b|vitamin|mineral|salt\b|supplement|feed\b|premix|maziwa|dairy|livestock|poultry|broiler|layer|chick/.test(n)) return 'Animal Health';
  return 'Agrochemicals';
}

function normalize(name) {
  return (name || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function seed() {
  console.log('Reading Excel file...');
  const wb = XLSX.readFile(EXCEL_FILE);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(ws);

  // Filter to single products with a selling price
  const raw = rows.filter(r =>
    r['PRODUCT TYPE (single or variable)'] === 'single' &&
    Number(r['SELLING PRICE']) > 0
  );
  console.log('Single products with price:', raw.length);

  // Deduplicate by normalized name (keep first)
  const seen = new Set();
  const deduped = [];
  for (const r of raw) {
    const key = normalize(r.NAME || '');
    if (key && !seen.has(key)) { seen.add(key); deduped.push(r); }
  }
  console.log('After dedup:', deduped.length);

  // Clean pricing
  let fixedCount = 0;
  const cleaned = deduped.map(r => {
    let buy = Number(r['PURCHASE PRICE (Excluding tax)']) || 0;
    let sell = Number(r['SELLING PRICE']) || 0;
    const margin = Number(r['PROFIT MARGIN']) || 20;
    const alertQty = Number(r['ALERT QUANTITY']) || 5;
    const sku = String(r['SKU (Leave blank to auto generate sku)'] || '').trim();

    // Fix: buying > selling → swap
    if (buy > sell && sell > 0) {
      [buy, sell] = [sell, buy];
      fixedCount++;
    }
    // Fix: no buying price → derive from margin
    if (buy <= 0 && sell > 0) {
      buy = Math.round(sell / (1 + margin / 100));
    }
    // Fix: sell still <= buy after swap (extreme outlier) → compute sell
    if (sell <= buy) {
      sell = Math.round(buy * (1 + margin / 100));
    }

    const finalMargin = buy > 0 ? Math.round(((sell - buy) / buy) * 100 * 100) / 100 : margin;

    return {
      name: (r.NAME || '').trim(),
      sku: sku || null,
      unit: (r.UNIT || 'Pc(s)').trim(),
      category: inferCategory(r.NAME || ''),
      buyingPrice: buy,
      sellingPrice: sell,
      profitMargin: finalMargin,
      alertQty,
      stockQty: 0,
    };
  });
  console.log('Fixed pricing on:', fixedCount, 'products');
  console.log('Total clean products:', cleaned.length);

  // Verify no bad pricing remains
  const stillBad = cleaned.filter(p => p.buyingPrice > p.sellingPrice);
  if (stillBad.length > 0) {
    console.error('Still bad:', stillBad.length, stillBad[0]);
    process.exit(1);
  }
  console.log('All pricing validated OK ✓');

  // Seed both shops
  for (const shopId of [SHOP_A_ID, SHOP_B_ID]) {
    console.log(`\nSeeding shop ${shopId}...`);

    // Clear existing products for this shop
    await client.execute({ sql: 'DELETE FROM products WHERE shop_id = ?', args: [shopId] });
    console.log('  Cleared existing products');

    let inserted = 0;
    const BATCH = 50;
    for (let i = 0; i < cleaned.length; i += BATCH) {
      const batch = cleaned.slice(i, i + BATCH);
      for (const p of batch) {
        const id = crypto.randomUUID();
        const now = new Date().toISOString();
        const tokens = JSON.stringify(normalize(p.name).split(' ').filter(t => t.length > 1));
        await client.execute({
          sql: `INSERT INTO products (id, shop_id, canonical_name, normalized_name, sku, category, unit,
                  purchase_price, selling_price, profit_margin, stock_qty, alert_qty, tokens_json,
                  is_active, created_at, updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
          args: [
            id, shopId, p.name, normalize(p.name), p.sku, p.category, p.unit,
            p.buyingPrice, p.sellingPrice, p.profitMargin,
            p.stockQty, p.alertQty, tokens, now, now
          ]
        });
        inserted++;
      }
      if (i % 500 === 0) process.stdout.write(`  ${inserted}/${cleaned.length}...\r`);
    }
    console.log(`  Inserted ${inserted} products ✓`);
  }

  console.log('\n✅ Seed complete!');
  process.exit(0);
}

seed().catch(e => { console.error(e); process.exit(1); });
