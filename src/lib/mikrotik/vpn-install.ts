import { randomBytes, randomUUID } from "node:crypto";
import { count } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getAppUrl } from "@/lib/net/app-url";
import { encryptSecret } from "./crypto";
import { API_USERNAME, INSTALL_TOKEN_TTL_MS, hashToken } from "./install-token";
import { WIFI_ENABLE_ANY_VERSION } from "./provisioning-commands";
import { shardForIndex } from "./shards";

/**
 * Installation d'un routeur par WireGuard : ligne à coller dans le terminal
 * MikroTik. Partagée par l'ajout de routeur de SafeLinkHub et par SafeLink
 * Auto-Pilot (via l'API interne) — un seul tunnel safelinkhub-wg0 par routeur.
 */

export type VpnInstallLocation = {
  latitude?: string | null;
  longitude?: string | null;
  locationStreet?: string | null;
  locationNeighbourhood?: string | null;
  locationCommune?: string | null;
  locationCountry?: string | null;
};

/** Ligne terminal historique : renomme ether1, active le Wi-Fi, importe le script VPN. */
export function buildVpnInstallCommand(scriptUrl: string, installToken: string): string {
  const fetchMode = scriptUrl.startsWith("https://") ? "https" : "http";
  return `/interface/ethernet/set [find name=ether1] name=E1-WAN-FAI; ${WIFI_ENABLE_ANY_VERSION}; /tool fetch url="${scriptUrl}" http-header-field="Authorization: Bearer ${installToken}" dst-path="vpn.rsc" mode=${fetchMode}; :delay 2s; /import file-name="vpn.rsc"; :delay 1s; /ip route remove [find dst-address=10.66.0.0/24 gateway=safelinkhub-wg0]; /ip route add dst-address=10.66.0.0/24 gateway=safelinkhub-wg0; :delay 1s; /file remove "vpn.rsc"`;
}

/**
 * Variante « sans conflit » : si le routeur porte DÉJÀ le tunnel SafeLinkHub
 * (safelinkhub-wg0), on n'installe rien — on annule le routeur en attente
 * créé pour cette ligne et on l'annonce ; le routeur existant est reconnu
 * tel quel. Sinon, installation normale.
 */
export function buildGuardedVpnInstallCommand(scriptUrl: string, cancelUrl: string, installToken: string): string {
  const fetchMode = cancelUrl.startsWith("https://") ? "https" : "http";
  const install = buildVpnInstallCommand(scriptUrl, installToken);
  return `:if ([:len [/interface wireguard find name="safelinkhub-wg0"]] > 0) do={ :do { /tool fetch url="${cancelUrl}" http-header-field="Authorization: Bearer ${installToken}" mode=${fetchMode} output=none } on-error={}; :put "SafeLinkHub deja installe sur ce routeur : aucun second tunnel, il est reconnu automatiquement." } else={ ${install}; :put "SafeLinkHub : installation lancee." }`;
}

export async function createVpnInstall(opts: {
  orgId: string;
  orgSlug: string;
  name: string;
  location?: VpnInstallLocation;
  guarded?: boolean;
}): Promise<{ routerId: string; command: string }> {
  const db = getDb();
  // Le pair VPN est alloué quand le routeur télécharge le script (route
  // install-vpn) : sa clé privée n'est jamais conservée côté serveur.
  const apiPassword = randomBytes(18).toString("base64url");
  const installToken = randomUUID();
  const [{ n }] = await db.select({ n: count() }).from(routers);
  const [router] = await db
    .insert(routers)
    .values({
      orgId: opts.orgId,
      name: opts.name,
      apiPort: 8728,
      username: API_USERNAME,
      passwordEncrypted: encryptSecret(apiPassword),
      status: "pending",
      connectionMethod: "vpn",
      installTokenHash: hashToken(installToken),
      installTokenExpiresAt: new Date(Date.now() + INSTALL_TOKEN_TTL_MS),
      relayShard: shardForIndex(Number(n ?? 0)),
      ...(opts.location ?? {}),
    })
    .returning({ id: routers.id });
  const base = `${getAppUrl()}/api/router/v1/${opts.orgSlug}/scripts/install-vpn`;
  return {
    routerId: router.id,
    command: opts.guarded
      ? buildGuardedVpnInstallCommand(base, `${base}/cancel`, installToken)
      : buildVpnInstallCommand(base, installToken),
  };
}
