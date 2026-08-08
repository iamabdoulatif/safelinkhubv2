// Cœur de la synchronisation MNDP — module « plain », VOLONTAIREMENT sans
// "use server".
//
// POURQUOI CE FICHIER EXISTE : ces deux fonctions vivaient dans mndp-relay.ts,
// qui porte "use server". Or Next.js enregistre CHAQUE fonction exportée d'un
// tel module comme un endpoint HTTP appelable. `syncMndpAnnouncements(orgId)`
// acceptait donc l'identifiant d'organisation d'un appelant anonyme, et
// `syncMndpAnnouncementsForAllOrgs()` ouvrait une session API sur la TOTALITÉ
// du parc, toutes organisations confondues, sans la moindre authentification.
// Elles n'ont jamais eu besoin d'être des server actions : leurs appelants
// réels (le cron de santé, et l'action gardée de mndp-relay.ts) tournent dans
// le même processus et peuvent simplement les importer.

import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, personalVpnAccess, routers } from "@/lib/db/schema";
import { connectToRouter } from "./router-sync";
import { runOnRelay } from "./relay";

export const MNDP_CONFIG_DIR = "/etc/safelinkhub";
export const MNDP_TARGETS_FILE = `${MNDP_CONFIG_DIR}/mndp-targets.json`;

export type MndpSyncResult =
  | { success: true; routerCount: number; peerCount: number }
  | { error: string };

/**
 * Réécrit le fichier de cibles que lit le démon du relais : pour chaque routeur
 * VPN/OpenVPN en ligne de l'org, son identité/version/carte/MAC/uptime en
 * direct, annoncés vers chaque pair d'accès VPN personnel actif de la MÊME org.
 *
 * `orgId` est ici une donnée de confiance : le seul appelant exposé au public
 * (l'action `syncMndpAnnouncements` de mndp-relay.ts) le dérive de la session,
 * jamais d'un paramètre client.
 */
export async function syncMndpAnnouncementsForOrg(orgId: string): Promise<MndpSyncResult> {
  const db = getDb();

  const candidateRouters = await db
    .select()
    .from(routers)
    .where(
      and(
        eq(routers.orgId, orgId),
        eq(routers.status, "online"),
        inArray(routers.connectionMethod, ["vpn", "openvpn"]),
      ),
    );

  const routerTargets = (
    await Promise.all(
      candidateRouters
        .filter((r) => r.tunnelIp)
        .map(async (router) => {
          let client;
          try {
            client = await connectToRouter(router, 8000);
          } catch {
            return null;
          }
          try {
            const [resource] = await client.talk(["/system/resource/print"], 8000);
            const [identityRow] = await client.talk(["/system/identity/print"], 8000);
            const [ethernet] = await client.talk(["/interface/ethernet/print"], 8000).catch(() => []);
            return {
              identity: identityRow?.name || router.name,
              version: resource?.version ?? "",
              board: resource?.["board-name"] ?? router.model ?? "",
              mac: ethernet?.["mac-address"] ?? "",
              uptimeSeconds: router.uptimeSeconds ?? 0,
              tunnelIp: router.tunnelIp,
            };
          } catch {
            return null;
          } finally {
            client.close();
          }
        }),
    )
  ).filter((r): r is NonNullable<typeof r> => r !== null);

  const peerRows = await db
    .select({ vpnIp: personalVpnAccess.vpnIp })
    .from(personalVpnAccess)
    .where(and(eq(personalVpnAccess.orgId, orgId), eq(personalVpnAccess.status, "active")));
  const peers = peerRows.map((p) => p.vpnIp).filter((ip): ip is string => Boolean(ip));

  const payload = JSON.stringify({ routers: routerTargets, peers });
  const payloadB64 = Buffer.from(payload, "utf8").toString("base64");

  try {
    await runOnRelay(
      `sudo mkdir -p ${MNDP_CONFIG_DIR} && echo ${payloadB64} | base64 -d | sudo tee ${MNDP_TARGETS_FILE} >/dev/null`,
      15000,
    );
    return { success: true, routerCount: routerTargets.length, peerCount: peers.length };
  } catch (err) {
    return { error: err instanceof Error ? `Sync failed: ${err.message}` : "Sync failed." };
  }
}

/** Balayage de tout le parc — appelé par le cron de santé, qui n'a pas de session. */
export async function syncMndpAnnouncementsForAllOrgs() {
  const db = getDb();
  const orgRows = await db.select({ id: organizations.id }).from(organizations);
  const results = await Promise.all(
    orgRows.map((o) => syncMndpAnnouncementsForOrg(o.id).catch((err) => ({ error: String(err) }))),
  );
  return { orgsProcessed: results.length };
}
