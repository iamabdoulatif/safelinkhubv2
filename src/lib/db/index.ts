import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

// Pool node-postgres : marche avec le Postgres auto-hébergé du VPS comme avec
// une URL Neon (sslmode=require dans l'URL est respecté par pg). Contrairement
// à l'ancien driver neon-http, les transactions interactives (db.transaction)
// sont disponibles.
function createDb() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL!,
    max: 10,
  });
  return drizzle(pool, { schema });
}

let _db: ReturnType<typeof createDb> | null = null;

export function getDb() {
  if (!_db) _db = createDb();
  return _db;
}
