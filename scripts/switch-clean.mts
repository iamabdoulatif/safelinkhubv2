import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { routers } from "../src/lib/db/schema";
import { connectToRouter } from "../src/lib/mikrotik/router-sync";

const name = process.argv[2];
const db = getDb();
const [router] = await db.select().from(routers).where(eq(routers.name, name!)).limit(1);
if (!router) { console.error("FAIL: routeur introuvable"); process.exit(1); }
const client = await connectToRouter(router);
try {
  for (const n of ["slh-pilot-kick", "slh-pilot-revert"]) {
    const ex = await client.talk(["/system/scheduler/print", `?name=${n}`]);
    for (const s of ex as any[]) await client.talk(["/system/scheduler/remove", `=numbers=${s[".id"]}`]);
  }
  const peers = await client.talk(["/interface/wireguard/peers/print", "?public-key=LTCXBicJJZmoWXOFwAJyKKgqc0kSkFoNPTBMB8kAMAw="]);
  const p: any = (peers as any[])[0];
  console.log(`CLEAN-OK ${name} ep=${p?.["endpoint-address"]}:${p?.["endpoint-port"]} hs=${p?.["last-handshake"]}`);
} finally {
  try { client.close(); } catch {}
}
process.exit(0);
