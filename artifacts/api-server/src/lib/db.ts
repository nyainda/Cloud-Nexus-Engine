import { drizzle } from "drizzle-orm/d1";
import * as schema from "@workspace/db/schema";

export { normalizeProductName } from "./normalize";
export { BOOTSTRAP_SQL } from "./bootstrap-sql";

/**
 * Returns a Drizzle ORM instance bound to the D1 database.
 * Always pass c.env.DB from the route handler.
 */
export function createDb(db: D1Database) {
  return drizzle(db, { schema });
}

export type Db = ReturnType<typeof createDb>;
