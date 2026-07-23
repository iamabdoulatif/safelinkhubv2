// Applique un fichier .sql sur la base (DATABASE_URL — Postgres VPS ou Neon). Usage :
//   node --env-file=.env.local scripts/run-sql.mjs scripts/xxx.sql
import { readFileSync } from "node:fs";
import pg from "pg";

const file = process.argv[2];
if (!file) {
  console.error("Usage: node scripts/run-sql.mjs <file.sql>");
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL manquant (charge .env.local avec --env-file).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url });
await client.connect();
const raw = readFileSync(file, "utf8");
// Découpe naïve sur ';' — suffisant pour ces migrations (aucun ';' littéral).
const statements = raw
  .split(";")
  .map((s) => s.replace(/--[^\n]*/g, "").trim())
  .filter(Boolean);

try {
  for (const [i, stmt] of statements.entries()) {
    console.log(`\n[${i + 1}/${statements.length}] ${stmt.slice(0, 80)}...`);
    await client.query(stmt);
    console.log("  OK");
  }
  console.log("\n✅ Migration appliquée.");
} finally {
  await client.end();
}
