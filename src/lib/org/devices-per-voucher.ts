// « Appareils par code » de l'org (organizations.devicesPerVoucher) : nombre de
// connexions simultanées autorisées pour un même code voucher, posé en
// shared-users sur les profils hotspot vendables. Module serveur « plain » (pas
// de "use server") : importable par la fulfillment, l'auto-setup et l'action
// d'application au parc.
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations } from "@/lib/db/schema";
import { clampDevicesPerVoucher } from "@/lib/mikrotik/voucher-profiles";

/** Valeur effective (entier [1,100], défaut 1) ; 1 = anti-partage. */
export async function getOrgDevicesPerVoucher(orgId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: organizations.devicesPerVoucher })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  return clampDevicesPerVoucher(row?.n);
}
