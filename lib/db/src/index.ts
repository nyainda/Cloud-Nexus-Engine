import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema";
import path from "path";
import fs from "fs";

let _client: ReturnType<typeof createClient> | null = null;

export function getClient() {
  if (!_client) {
    const DATA_DIR = process.env.DATA_DIR ?? path.join(process.cwd(), "data");
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const DB_PATH = path.join(DATA_DIR, "greenlink.db");
    _client = createClient({ url: `file:${DB_PATH}` });
  }
  return _client;
}

export function createDb() {
  return drizzle(getClient(), { schema });
}

export type Db = ReturnType<typeof createDb>;

export * from "./schema";
