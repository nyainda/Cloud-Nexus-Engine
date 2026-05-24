export const BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS shops (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_whatsapp TEXT,
  owner_pin_hash TEXT NOT NULL,
  cashier_pin_hash TEXT NOT NULL,
  gemini_api_key TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  canonical_name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sku TEXT,
  category TEXT,
  unit TEXT NOT NULL DEFAULT 'unit',
  purchase_price REAL,
  selling_price REAL,
  profit_margin REAL,
  stock_qty REAL NOT NULL DEFAULT 0,
  alert_qty REAL NOT NULL DEFAULT 5,
  expiry_date TEXT,
  tokens_json TEXT,
  size TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_sold_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_aliases (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  confidence REAL,
  auto_generated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS price_history (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  old_purchase_price REAL,
  new_purchase_price REAL,
  old_selling_price REAL,
  new_selling_price REAL,
  pct_change REAL,
  changed_by TEXT,
  changed_at TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS sales (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  total_amount REAL NOT NULL DEFAULT 0,
  total_cost REAL,
  total_profit REAL,
  discount REAL NOT NULL DEFAULT 0,
  sale_type TEXT NOT NULL DEFAULT 'cash',
  served_by TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced',
  is_deleted INTEGER NOT NULL DEFAULT 0,
  deleted_at TEXT,
  delete_reason TEXT,
  deleted_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sale_items (
  id TEXT PRIMARY KEY,
  sale_id TEXT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id TEXT,
  product_name TEXT NOT NULL,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost REAL,
  unit_profit REAL,
  total_price REAL NOT NULL,
  total_profit REAL
);

CREATE TABLE IF NOT EXISTS debts (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  sale_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL DEFAULT '',
  total_amount REAL NOT NULL,
  amount_paid REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'unpaid',
  notes TEXT,
  paid_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS debt_payments (
  id TEXT PRIMARY KEY,
  debt_id TEXT NOT NULL REFERENCES debts(id) ON DELETE CASCADE,
  amount REAL NOT NULL,
  recorded_by TEXT,
  paid_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT,
  movement_type TEXT NOT NULL,
  qty_change REAL NOT NULL,
  before_qty REAL NOT NULL,
  after_qty REAL NOT NULL,
  source TEXT,
  reference_id TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  product_id TEXT,
  debt_id TEXT,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  old_value_json TEXT,
  new_value_json TEXT,
  performed_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS suppliers (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  id TEXT PRIMARY KEY,
  from_shop_id TEXT NOT NULL,
  to_shop_id TEXT NOT NULL,
  from_product_id TEXT NOT NULL,
  to_product_id TEXT NOT NULL,
  product_name TEXT NOT NULL,
  qty REAL NOT NULL,
  unit TEXT,
  notes TEXT,
  transferred_by TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scan_sessions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  scan_type TEXT NOT NULL,
  total_images INTEGER NOT NULL DEFAULT 0,
  total_products INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  result_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY,
  shop_id TEXT NOT NULL REFERENCES shops(id),
  endpoint TEXT NOT NULL UNIQUE,
  keys_p256dh TEXT NOT NULL,
  keys_auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;
