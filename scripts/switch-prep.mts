import { eq } from "drizzle-orm";
import { getDb } from "../src/lib/db";
import { routers } from "../src/lib/db/schema";
import { connectToRouter } from "../src/lib/mikrotik/router-sync";

type RouterOsRow = Record<string, string | undefined>;

const RELAY_PUB = "LTCXBicJJZmoWXOFwAJyKKgqc0kSkFoNPTBMB8kAMAw=";
const VPS_IP = "31.97.153.83";
const EC2_IP = "3.221.39.207";
const KICK = "slh-pilot-kick";
const REVERT = "slh-pilot-revert";
const findExpr = `[find public-key="${RELAY_PUB}"]`;
const kickEvent = `/interface wireguard peers set ${findExpr} endpoint-address=${VPS_IP} endpoint-port=51820`;
const revertEvent = `/system scheduler remove [find name=${KICK}]; /interface wireguard peers set ${findExpr} endpoint-address=${EC2_IP} endpoint-port=51820; /system scheduler remove [find name=${REVERT}]`;

const name = process.argv[2];
if (!name) { console.error("usage: switch-prep.mts <router-name>"); process.exit(1); }
const db = getDb();
const [router] = await db.select().from(routers).where(eq(routers.name, name)).limit(1);
if (!router) { console.error("FAIL: routeur introuvable en DB"); process.exit(1); }

const client = await connectToRouter(router);
try {
  const peers = await client.talk(["/interface/wireguard/peers/print", `?public-key=${RELAY_PUB}`]);
  const peerRows = peers as RouterOsRow[];
  if (peerRows.length !== 1) {
    console.error(`FAIL: ${peerRows.length} peer(s) relais trouves (attendu 1)`);
    process.exit(1);
  }
  const p = peerRows[0];
  if (p["endpoint-address"] !== EC2_IP) {
    console.error(`FAIL: endpoint actuel inattendu: ${p["endpoint-address"]} (attendu ${EC2_IP})`);
    process.exit(1);
  }
  for (const n of [KICK, REVERT]) {
    const ex = await client.talk(["/system/scheduler/print", `?name=${n}`]);
    for (const s of ex as RouterOsRow[]) await client.talk(["/system/scheduler/remove", `=numbers=${s[".id"]}`]);
  }
  await client.talk(["/system/scheduler/add", `=name=${REVERT}`, "=interval=12m", `=on-event=${revertEvent}`,
    "=comment=SafeLinkHub switch: dead-man revert to EC2"]);
  await client.talk(["/system/scheduler/add", `=name=${KICK}`, "=interval=30s", `=on-event=${kickEvent}`,
    "=comment=SafeLinkHub switch: force endpoint VPS"]);
  await client.talk(["/interface/wireguard/peers/set", `=numbers=${p[".id"]}`,
    `=endpoint-address=${VPS_IP}`, "=endpoint-port=51820", "=persistent-keepalive=25s"]).catch(() => {
    // la coupure du tunnel peut tuer la lecture de la reponse juste apres le set — attendu
  });
  console.log(`PREP-OK ${name}`);
} finally {
  try { client.close(); } catch {}
}
process.exit(0);
