// Laisser passer MikHmon EN LOCAL (depuis le Wi-Fi de l'organisation).
//
// MikHmon tourne dans le conteneur (11.11.11.11:80), joignable à
// `http://<passerelle-hotspot>:8087` via un dst-nat. Le hotspot bloque pourtant
// l'accès, et de DEUX façons selon que le client est connecté au hotspot ou non.
//
// Chaîne nat du hotspot : saut `dstnat → hotspot` ; `hotspot → pre-hotspot` EN
// PREMIER ; puis redirections `local-dst 80/443` ; puis `hotspot=!auth → hs-unauth`
// (clients NON connectés) et `hotspot=auth → hs-auth` (clients connectés). La
// règle `hs-auth ... hotspot=http action=redirect` est TERMINANTE : elle renvoie
// le client connecté au proxy (page de statut) AVANT que le dst-nat « Docker NAT »
// (placé APRÈS le saut hotspot) ne s'exécute. Résultat : `10.0.0.1:8087` renvoie
// à la page de statut du portail au lieu de MikHmon. Diagnostiqué sur
// ASSOINDE-WIFI (client admin@ connecté).
//
// On pose donc QUATRE choses, idempotentes :
//   1. le dst-nat 8087 → conteneur:80 dans `dstnat` (compat / routeurs hors auto-setup) ;
//   2. walled-garden-ip ACCEPT du port 8087 (déverrouille le client NON connecté) ;
//   3. walled-garden-ip ACCEPT de l'IP conteneur (filtre forward du client NON connecté) ;
//   4. **le dst-nat 8087 → conteneur:80 dans la chaîne `pre-hotspot`** : elle est
//      parcourue EN PREMIER (avant la redirection proxy hs-auth) et dst-nat y est
//      terminant, donc le paquet part vers MikHmon sans voir le proxy — ce qui
//      corrige le cas du client CONNECTÉ, celui des 2-4 qui manquait vraiment.
import type { RouterOSClient } from "./client";
import { DOCKER_WEB_PORT } from "./constants";
import { resolveMikhmonContainerAddress } from "./mikhmon-tunnel-access";
import { looksLikeMikhmonContainer } from "./port-forward-rules";

type Row = Record<string, string>;
const NAT_COMMENT = "Docker NAT"; // même commentaire que l'auto-setup
const WG_COMMENT = "MikHmon local";
const WG_CONTAINER_COMMENT = "MikHmon container";
const PRE_HOTSPOT_COMMENT = "MikHmon local pre-hotspot";

export type MikhmonLocalAccessResult = {
  gateway: string | null;
  natAdded: boolean;
  walledGardenAdded: boolean;
  containerWalledGardenAdded: boolean;
  preHotspotNatAdded: boolean;
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
    return { gateway: null, natAdded: false, walledGardenAdded: false, containerWalledGardenAdded: false, preHotspotNatAdded: false, note: "Aucun serveur hotspot : rien à ouvrir (MikHmon local passe par la passerelle du hotspot)." };
  }

  // Pas de conteneur MikHmon → ne RIEN poser : sinon le passage de réconciliation
  // de la synchro (qui balaie tout le parc) ajouterait un dst-nat vers un
  // 11.11.11.11 où personne n'écoute et deux accepts walled-garden inertes sur
  // des routeurs hotspot sans MikHmon. On renvoie quand même la passerelle pour
  // que l'appelant marque le routeur « traité » et ne ré-essaie pas à chaque sync.
  const containers = await client.talk(["/container/print"], timeoutMs).catch(() => [] as Row[]);
  if (!containers.some((row) => looksLikeMikhmonContainer(row))) {
    return { gateway, natAdded: false, walledGardenAdded: false, containerWalledGardenAdded: false, preHotspotNatAdded: false, note: "Aucun conteneur MikHmon sur ce routeur : rien à ouvrir." };
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

  // 4) dst-nat 8087 → conteneur:80 DANS LA CHAÎNE pre-hotspot. C'EST le correctif
  //    du client CONNECTÉ : pre-hotspot est parcourue en tout premier (avant la
  //    redirection proxy hs-auth « hotspot=http »), et dst-nat y est terminant —
  //    le paquet part vers MikHmon sans jamais voir le proxy, connecté ou non.
  //    Survit au redémarrage du hotspot (celui-ci recrée le SAUT vers pre-hotspot,
  //    pas son contenu). Diagnostiqué sur ASSOINDE-WIFI.
  const preHotspot = (await client
    .talk(["/ip/firewall/nat/print", "?chain=pre-hotspot", "?action=dst-nat"], timeoutMs)
    .catch(() => [] as Row[]))
    .filter((r) => r["dst-port"] === port);
  let preHotspotNatAdded = false;
  if (preHotspot.length === 0) {
    await client.talk([
      "/ip/firewall/nat/add",
      "=chain=pre-hotspot",
      `=dst-address=${gateway}`,
      `=dst-port=${DOCKER_WEB_PORT}`,
      "=protocol=tcp",
      "=action=dst-nat",
      `=to-addresses=${containerIp}`,
      "=to-ports=80",
      `=comment=${PRE_HOTSPOT_COMMENT}`,
    ], timeoutMs);
    preHotspotNatAdded = true;
  }

  return { gateway, natAdded, walledGardenAdded, containerWalledGardenAdded, preHotspotNatAdded };
}
