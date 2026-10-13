// Mot de passe d'ouverture de MikHmon propre à chaque routeur (jamais le
// « 1234 » d'usine) : retrouvé s'il est déjà enregistré, sinon généré et
// ENREGISTRÉ AVANT d'être écrit dans config.php — l'exploitant ne doit jamais
// se retrouver avec un mot de passe que personne ne connaît (incident du
// 13/10/2026, voir hardening-sync.ts). Module serveur uniquement.
import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { generateMikhmonPassword } from "./hardening";

export async function getOrCreateMikhmonAdminPassword(routerId: string): Promise<string> {
  const db = getDb();
  const [row] = await db
    .select({ enc: routers.mikhmonAdminPasswordEncrypted })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  if (row?.enc) {
    try {
      return decryptSecret(row.enc);
    } catch {
      /* illisible : on en génère un nouveau ci-dessous */
    }
  }
  const password = generateMikhmonPassword((n) => randomBytes(n));
  await db
    .update(routers)
    .set({ mikhmonAdminPasswordEncrypted: encryptSecret(password) })
    .where(eq(routers.id, routerId));
  return password;
}
