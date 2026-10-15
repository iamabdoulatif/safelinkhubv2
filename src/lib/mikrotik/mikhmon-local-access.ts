// Laisser passer MikHmon EN LOCAL (depuis le Wi-Fi de l'organisation).
//
// MikHmon tourne dans le conteneur (11.11.11.11:80) et est joignable à
// `http://<passerelle-hotspot>:8087` via un dst-nat. Mais le hotspot BLOQUE les
// clients non authentifiés avant qu'ils atteignent ce port : taper
// `10.10.0.1:8087` dans le navigateur ne répond pas. Il manque TROIS choses :
//   1. le dst-nat 8087 → conteneur:80 (absent sur les routeurs hors auto-setup) ;
//   2. une règle hotspot walled-garden-ip qui ACCEPTE le port 8087 avant login ;
//   3. une règle walled-garden-ip qui accepte aussi l'IP DU CONTENEUR (11.11.11.11).
//
// Pourquoi (3) : le dst-nat (1) est évalué AVANT le saut hotspot dans la chaîne
// dstnat. Pour un client NON authentifié (l'admin sur son téléphone, pas connecté
// au hotspot), la destination est déjà réécrite en 11.11.11.11 quand le hotspot
// vérifie son walled-garden — qui n'autorise que 10.0.0.1:8087 (la destination
// d'ORIGINE). Elle ne correspond plus → le client est REDIRIGÉ vers le portail au
// lieu d'atteindre MikHmon. Autoriser aussi l'IP conteneur (destination APRÈS NAT)
// lève ce blocage. Diagnostiqué sur RUE-NICOLAS (conteneur OK en direct, NAT +
// walled-garden 8087 présents, mais accès local toujours redirigé).
//
// Cette fonction pose les trois si elles manquent. Idempotente.
import type { RouterOSClient } from "./client";
import { DOCKER_WEB_PORT } from "./constants";
import { resolveMikhmonContainerAddress } from "./mikhmon-tunnel-access";

type Row = Record<string, string>;
const NAT_COMMENT = "Docker NAT"; // même commentaire que l'auto-setup
const WG_COMMENT = "MikHmon local";
const WG_CONTAINER_COMMENT = "MikHmon container";

export type MikhmonLocalAccessResult = {
  gateway: string | null;
  natAdded: boolean;
  walledGardenAdded: boolean;
  containerWalledGardenAdded: boolean;
  note?: string;
};

/** Passerelle du hotspot (ex. « 10.0.0.1 ») : interface du serveur hotspot → son IP. */
async function hotspotGateway(client: RouterOSClient, timeoutMs: number): Promise<string | null> {
  const hs = (await client.talk(["/ip/hotspot/print", "=.proplist=interface"], timeoutMs).catch(() => [] as Row[]))[0];
  const iface = hs?.interface;
  if (!iface) return null;
  const addr = (await client.talk(["/ip/address/print", `?interface=${iface}`, "=.proplist=address"], timeoutMs).catch(() => [] as Row[]))[0];
  return addr?.address ? addr.address.split("/")[0] : null;
}

export async function ensureMikhmonLocalAccess(
  client: RouterOSClient,
  timeoutMs = 20000,
): Promise<MikhmonLocalAccessResult> {
  const gateway = await hotspotGateway(client, timeoutMs);
  if (!gateway) {
    return { gateway: null, natAdded: false, walledGardenAdded: false, containerWalledGardenAdded: false, note: "Aucun serveur hotspot : rien à ouvrir (MikHmon local passe par la passerelle du hotspot)." };
  }
  const containerIp = await resolveMikhmonContainerAddress(client).catch(() => "11.11.11.11");

  // 1) dst-nat <gateway>:8087 → conteneur:80. Le filtre API ?dst-port est peu
  //    fiable → on récupère les règles dst-nat et on compare côté client.
  const port = String(DOCKER_WEB_PORT);
  const nat = (await client
    .talk(["/ip/firewall/nat/print", "?chain=dstnat", "?action=dst-nat"], timeoutMs)
    .catch(() => [] as Row[]))
    .filter((r) => r["dst-port"] === port && (r["dst-address"] === gateway || !r["dst-address"]));
  let natAdded = false;
  if (nat.length === 0) {
    await client.talk([
      "/ip/firewall/nat/add",
      "=chain=dstnat",
      `=dst-address=${gateway}`,
      `=dst-port=${DOCKER_WEB_PORT}`,
      "=protocol=tcp",
      "=action=dst-nat",
      `=to-addresses=${containerIp}`,
      "=to-ports=80",
      `=comment=${NAT_COMMENT}`,
    ], timeoutMs);
    natAdded = true;
  }

  // 2) Règle hotspot : accepter le port 8087 avant authentification.
  const wg = (await client
    .talk(["/ip/hotspot/walled-garden/ip/print"], timeoutMs)
    .catch(() => [] as Row[]))
    .filter((r) => r["dst-port"] === port);
  let walledGardenAdded = false;
  if (wg.length === 0) {
    await client.talk([
      "/ip/hotspot/walled-garden/ip/add",
      "=protocol=tcp",
      `=dst-address=${gateway}`,
      `=dst-port=${DOCKER_WEB_PORT}`,
      "=action=accept",
      `=comment=${WG_COMMENT}`,
    ], timeoutMs);
    walledGardenAdded = true;
  }

  // 3) Règle hotspot : accepter l'IP DU CONTENEUR (destination après NAT). Sans
  //    elle, un client non authentifié est redirigé vers le portail (voir en-tête).
  const wgContainer = (await client
    .talk(["/ip/hotspot/walled-garden/ip/print"], timeoutMs)
    .catch(() => [] as Row[]))
    .filter((r) => r["dst-address"] === containerIp);
  let containerWalledGardenAdded = false;
  if (wgContainer.length === 0) {
    await client.talk([
      "/ip/hotspot/walled-garden/ip/add",
      `=dst-address=${containerIp}`,
      "=action=accept",
      `=comment=${WG_CONTAINER_COMMENT}`,
    ], timeoutMs);
    containerWalledGardenAdded = true;
  }

  return { gateway, natAdded, walledGardenAdded, containerWalledGardenAdded };
}
