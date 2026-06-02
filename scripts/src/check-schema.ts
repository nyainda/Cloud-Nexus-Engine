/**
 * Schema Consistency Guard
 * Compares Drizzle ORM column definitions against the bootstrap SQL CREATE TABLE statements.
 * Run: pnpm --filter @workspace/scripts exec tsx src/check-schema.ts
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

// ─── Parse Bootstrap SQL ─────────────────────────────────────────────────────

const bootstrapPath = resolve(ROOT, "artifacts/api-server/src/lib/bootstrap-sql.ts");
const bootstrapRaw = readFileSync(bootstrapPath, "utf-8");

const sqlMatch = bootstrapRaw.match(/BOOTSTRAP_SQL\s*=\s*`([\s\S]*?)`/);
if (!sqlMatch) {
  console.error("❌ Could not find BOOTSTRAP_SQL in bootstrap-sql.ts");
  process.exit(1);
}
const sql = sqlMatch[1];

const bootstrapSchema: Record<string, Set<string>> = {};
const tableBlockRegex = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/g;
let tableMatch: RegExpExecArray | null;

while ((tableMatch = tableBlockRegex.exec(sql)) !== null) {
  const tableName = tableMatch[1];
  const body = tableMatch[2];
  const cols = new Set<string>();

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (
      !trimmed ||
      trimmed.startsWith("--") ||
      trimmed.startsWith("UNIQUE") ||
      trimmed.startsWith("PRIMARY") ||
      trimmed.startsWith("FOREIGN") ||
      trimmed.startsWith("CHECK")
    ) continue;

    const colMatch = trimmed.match(/^(\w+)\s+/);
    if (colMatch) cols.add(colMatch[1]);
  }

  bootstrapSchema[tableName] = cols;
}

// ─── Parse Drizzle Schema ─────────────────────────────────────────────────────

const drizzlePath = resolve(ROOT, "lib/db/src/schema/index.ts");
const drizzleRaw = readFileSync(drizzlePath, "utf-8");

const drizzleSchema: Record<string, Set<string>> = {};

// Split into per-table chunks by splitting on sqliteTable( declarations
const chunks = drizzleRaw.split(/export const \w+\s*=\s*sqliteTable\(\s*"/);

for (let i = 1; i < chunks.length; i++) {
  const chunk = chunks[i];

  // Table name is everything before the first "
  const nameEnd = chunk.indexOf('"');
  if (nameEnd === -1) continue;
  const tableName = chunk.slice(0, nameEnd);

  const cols = new Set<string>();

  // Extract column name strings passed to text(), integer(), real()
  const colPattern = /(?:text|integer|real)\(\s*"(\w+)"/g;
  let colMatch: RegExpExecArray | null;
  while ((colMatch = colPattern.exec(chunk)) !== null) {
    cols.add(colMatch[1]);
  }

  // pk() helper generates "id"
  if (/\bpk\(\)/.test(chunk)) cols.add("id");
  // createdAt() helper generates "created_at"
  if (/:\s*createdAt\(\)/.test(chunk)) cols.add("created_at");

  drizzleSchema[tableName] = cols;
}

// ─── Diff ────────────────────────────────────────────────────────────────────

let hasError = false;

const allTables = new Set([
  ...Object.keys(bootstrapSchema),
  ...Object.keys(drizzleSchema),
]);

// Tables only in bootstrap SQL but not in Drizzle (not always an error — may be intentionally unmapped)
const bootstrapOnly: string[] = [];
const drizzleOnly: string[] = [];

for (const table of allTables) {
  if (!drizzleSchema[table]) {
    bootstrapOnly.push(table);
  } else if (!bootstrapSchema[table]) {
    drizzleOnly.push(table);
  }
}

if (bootstrapOnly.length > 0) {
  console.warn(
    `⚠️  Tables in bootstrap SQL but not in Drizzle schema (may be intentional):\n   ${bootstrapOnly.join(", ")}`
  );
}
if (drizzleOnly.length > 0) {
  console.warn(
    `⚠️  Tables in Drizzle schema but not in bootstrap SQL:\n   ${drizzleOnly.join(", ")}`
  );
}

// Column-level diff for tables present in both
const columnErrors: string[] = [];

for (const table of allTables) {
  const bCols = bootstrapSchema[table];
  const dCols = drizzleSchema[table];
  if (!bCols || !dCols) continue;

  const onlyInBootstrap = [...bCols].filter((c) => !dCols.has(c));
  const onlyInDrizzle = [...dCols].filter((c) => !bCols.has(c));

  if (onlyInBootstrap.length > 0) {
    columnErrors.push(
      `  Table "${table}" — in bootstrap SQL but missing from Drizzle: ${onlyInBootstrap.join(", ")}`
    );
  }
  if (onlyInDrizzle.length > 0) {
    columnErrors.push(
      `  Table "${table}" — in Drizzle schema but missing from bootstrap SQL: ${onlyInDrizzle.join(", ")}`
    );
  }
}

if (columnErrors.length > 0) {
  console.error(`\n❌ Column mismatches found:\n${columnErrors.join("\n")}`);
  console.error(
    "\nFix: update both lib/db/src/schema/index.ts AND artifacts/api-server/src/lib/bootstrap-sql.ts\n" +
    "     and add an ALTER TABLE migration to artifacts/api-server/src/worker.ts MIGRATIONS array."
  );
  hasError = true;
} else {
  const checkedCount = [...allTables].filter(
    (t) => bootstrapSchema[t] && drizzleSchema[t]
  ).length;
  console.log(`✅ Schema consistent — ${checkedCount} tables checked, all columns match.`);
}

// ─── Migrations check ────────────────────────────────────────────────────────
// Verify that the worker MIGRATIONS array exists and is not empty
const workerPath = resolve(ROOT, "artifacts/api-server/src/worker.ts");
const workerRaw = readFileSync(workerPath, "utf-8");
const migrationsMatch = workerRaw.match(/const MIGRATIONS\s*[=:][^=\[]*\[([^\]]*)\]/s);

if (!migrationsMatch) {
  console.warn("⚠️  Could not find MIGRATIONS array in worker.ts — verify ALTER TABLE migrations are present.");
} else {
  const migrationsBody = migrationsMatch[1].trim();
  const count = migrationsBody ? (migrationsBody.match(/`[^`]+`/g) || []).length : 0;
  console.log(`✅ worker.ts MIGRATIONS: ${count} ALTER TABLE migration(s) found.`);
}

if (hasError) process.exit(1);
