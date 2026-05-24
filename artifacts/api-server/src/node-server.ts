/**
 * Node.js entry point for the GreenLink API server.
 * Adapts the Cloudflare Workers app (Hono + D1 + KV) to run on Node.js
 * using better-sqlite3 (D1-compatible API) and an in-memory KV store.
 */
import { serve } from "@hono/node-server";
import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import app from "./worker";

// ── D1Database adapter (better-sqlite3) ───────────────────────────────────────

function makeD1(db: ReturnType<typeof Database>): D1Database {
  function makeResult(info: any, changes: number, rows: any[]): D1Result {
    return {
      results: rows,
      success: true,
      meta: {
        changes,
        last_row_id: info?.lastInsertRowid ?? 0,
        duration: 0,
        rows_read: rows.length,
        rows_written: changes,
        size_after: 0,
        changed_db: changes > 0,
      },
    };
  }

  function makeStmt(sql: string) {
    function bind(...values: any[]) {
      return {
        run: async (): Promise<D1Result> => {
          try {
            const stmt = db.prepare(sql);
            const info = stmt.run(...values);
            return makeResult(info, info.changes, []);
          } catch (err: any) {
            throw new Error(`D1 run error: ${err.message}\nSQL: ${sql}`);
          }
        },
        first: async <T = unknown>(col?: string): Promise<T | null> => {
          try {
            const stmt = db.prepare(sql);
            const row = stmt.get(...values) as any;
            if (!row) return null;
            if (col) return (row[col] ?? null) as T;
            return row as T;
          } catch (err: any) {
            throw new Error(`D1 first error: ${err.message}\nSQL: ${sql}`);
          }
        },
        all: async <T = unknown>(): Promise<D1Result<T>> => {
          try {
            const stmt = db.prepare(sql);
            const rows = stmt.all(...values) as T[];
            return makeResult({}, 0, rows) as D1Result<T>;
          } catch (err: any) {
            throw new Error(`D1 all error: ${err.message}\nSQL: ${sql}`);
          }
        },
        raw: async <T = unknown[]>(): Promise<T[]> => {
          try {
            const stmt = db.prepare(sql);
            const rows = stmt.raw().all(...values) as T[];
            return rows;
          } catch (err: any) {
            throw new Error(`D1 raw error: ${err.message}\nSQL: ${sql}`);
          }
        },
      };
    }

    return {
      bind: (...values: any[]) => bind(...values),
      run: () => bind().run(),
      first: (col?: string) => bind().first(col),
      all: () => bind().all(),
      raw: () => bind().raw(),
    };
  }

  const d1: D1Database = {
    prepare: (sql: string) => makeStmt(sql) as any,
    dump: async () => new ArrayBuffer(0),
    batch: async (statements: D1PreparedStatement[]) => {
      const results: D1Result[] = [];
      for (const stmt of statements) {
        results.push(await (stmt as any).run());
      }
      return results;
    },
    exec: async (query: string) => {
      const stmts = query.split(";").map((s) => s.trim()).filter(Boolean);
      let count = 0;
      for (const s of stmts) {
        try { db.prepare(s).run(); count++; } catch { /* ignore */ }
      }
      return { count, duration: 0 };
    },
    withSession: (token: string) => d1 as any,
  };

  return d1;
}

// ── KVNamespace adapter (in-memory Map with TTL) ──────────────────────────────

function makeKV(): KVNamespace {
  const store = new Map<string, { value: string; expiresAt: number | null }>();

  return {
    get: async (key: string): Promise<string | null> => {
      const entry = store.get(key);
      if (!entry) return null;
      if (entry.expiresAt !== null && Date.now() > entry.expiresAt) {
        store.delete(key);
        return null;
      }
      return entry.value;
    },
    put: async (key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> => {
      const expiresAt = opts?.expirationTtl
        ? Date.now() + opts.expirationTtl * 1000
        : null;
      store.set(key, { value, expiresAt });
    },
    delete: async (key: string): Promise<void> => {
      store.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true, cursor: undefined } as any),
    getWithMetadata: async (key: string) => {
      const value = await (this as any).get(key);
      return { value, metadata: null };
    },
  } as unknown as KVNamespace;
}

// ── Bootstrap SQLite database ─────────────────────────────────────────────────

async function initDatabase(): Promise<ReturnType<typeof Database>> {
  const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const DB_PATH = path.join(DATA_DIR, "greenlink.db");

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  console.log(`[boot] SQLite database: ${DB_PATH}`);
  return db;
}

// ── Start server ──────────────────────────────────────────────────────────────

async function main() {
  const port = parseInt(process.env.PORT ?? "8080");
  const sqliteDb = await initDatabase();
  const d1 = makeD1(sqliteDb);
  const kv = makeKV();

  const env = {
    DB: d1,
    SESSIONS: kv,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY_JWK: process.env.VAPID_PRIVATE_KEY_JWK,
    NODE_ENV: process.env.NODE_ENV ?? "development",
  };

  serve({
    fetch: (req) => app.fetch(req, env),
    port,
  });

  console.log(`[server] GreenLink API running on http://0.0.0.0:${port}`);
}

main().catch((err) => {
  console.error("[fatal]", err);
  process.exit(1);
});
