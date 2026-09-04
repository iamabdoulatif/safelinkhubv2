// Lecture du quota VPN applicable à UN routeur. Module à part de vpn-quota.ts,
// qui reste pur : ce dernier est importé par un composant client (la liste des
// passes), et y faire entrer `pg` casserait le bundle.

import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, routers } from "@/lib/db/schema";
import { resolveVpnQuotaFields, type VpnQuotaFields } from "./vpn-quota";

/** Quota de ce routeur : sa surcharge si elle existe, sinon celui de l'org. */
export async function getRouterVpnQuotaFields(
  routerId: string,
  orgId: string,
): Promise<VpnQuotaFields> {
  const db = getDb();
  const [routerRows, orgRows] = await Promise.all([
    db
      .select({
        vpnQuotaMode: routers.vpnQuotaMode,
        vpnQuotaExpiresAt: routers.vpnQuotaExpiresAt,
      })
      .from(routers)
      .where(eq(routers.id, routerId))
      .limit(1),
    db
      .select({
        vpnQuotaMode: organizations.vpnQuotaMode,
        vpnQuotaExpiresAt: organizations.vpnQuotaExpiresAt,
      })
      .from(organizations)
      .where(eq(organizations.id, orgId))
      .limit(1),
  ]);

  return resolveVpnQuotaFields(routerRows[0] ?? null, orgRows[0] ?? null);
}
