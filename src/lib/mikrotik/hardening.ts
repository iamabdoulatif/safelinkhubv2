// DURCISSEMENT des MikroTik du parc (demande opérateur, 13/10/2026).
//
// Audit du parc (40 routeurs) : un client connecté au Wi-Fi pouvait ouvrir
// MikHmon (http://<routeur>:8087/8088/8089 → 11.11.11.11), et 18 routeurs le
// gardaient avec le mot de passe d'usine « mikhmon / 1234 » → tickets gratuits
// à volonté. Winbox / WebFig / API étaient aussi joignables depuis le Wi-Fi
// clients, MAC-Winbox ouvert sur toutes les interfaces, et 33 routeurs sur 40
// n'avaient aucune règle de pare-feu protégeant le routeur lui-même.
//
// Ce module, appelé à chaque synchronisation (router-sync.ts), applique :
//   1. MikHmon fermé au Wi-Fi des clients : forward drop depuis les interfaces
//      hotspot vers le réseau des conteneurs (11.11.11.0/28). Le tunnel
//      SafeLinkHub (MikHmon cloud, accès distant) n'est pas concerné.
//   2. (rotateDefaultMikhmonPassword) mot de passe d'usine de MikHmon remplacé
//      par un mot de passe unique, conservé chiffré par l'appelant.
//   3. Routeur protégé de son Wi-Fi : input drop depuis les interfaces hotspot
//      vers les ports d'administration (SSH, Telnet, FTP, Winbox, API, WebFig
//      hors 80/443 qui servent le portail), et MAC-Winbox / MAC-Telnet retirés
//      des interfaces hotspot (liste « tout sauf hotspot »).
//
// Rien ici ne touche au portail, au paiement ni aux tickets : les ports du
// hotspot (64872-64875, 80/443 redirigés) et le DNS restent ouverts.

import type { RouterOSClient } from "./client";
import { mikhmonLegacyEncrypt } from "./mikhmon-session";

export const HARDENING_COMMENT = "safelinkhub-securite";
const HOTSPOT_LIST = "slh-hotspot";
const MAC_ADMIN_LIST = "slh-mac-admin";
const CONTAINER_NET = "11.11.11.0/28";
/** Mot de passe d'usine de MikHmon (« 1234 ») chiffré par MikHmon (legacy). */
export const MIKHMON_DEFAULT_PASSWORD_ENC = mikhmonLegacyEncrypt("1234");

type Row = Record<string, string>;

/** Ports d'administration à fermer au Wi-Fi des clients. 80/443 exclus :
 * ce sont ceux du portail captif (redirigés par le hotspot). */
export function adminPortsToBlock(webPorts: number[]): string {
  const base = [21, 22, 23, 8291, 8728, 8729];
  const web = webPorts.filter((p) => p > 0 && p !== 80 && p !== 443);
  return [...new Set([...base, ...web])].sort((a, b) => a - b).join(",");
}

async function removeByComment(client: RouterOSClient, path: string, timeoutMs: number) {
  const rows = await client
    .talk([`${path}/print`, `?comment=${HARDENING_COMMENT}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const row of rows) {
    if (row[".id"]) await client.talk([`${path}/remove`, `=numbers=${row[".id"]}`], timeoutMs).catch(() => {});
  }
}

/** Ajoute une règle de filtre EN TÊTE de sa chaîne (avant la première règle
 * statique), pour passer avant d'éventuels « accept » existants. */
async function addFilterOnTop(client: RouterOSClient, chain: string, words: string[], timeoutMs: number) {
  // L'API n'accepte pas « ?dynamic=false » (aucune ligne ne matche) : on
  // filtre côté serveur. Les règles dynamiques (hotspot…) ne se déplacent pas.
  const rows = await client
    .talk(["/ip/firewall/filter/print", `?chain=${chain}`], timeoutMs)
    .catch(() => [] as Row[]);
  const first = rows.find((r) => r.dynamic !== "true");
  await client.talk(
    [
      "/ip/firewall/filter/add",
      `=chain=${chain}`,
      ...words,
      `=comment=${HARDENING_COMMENT}`,
      ...(first?.[".id"] ? [`=place-before=${first[".id"]}`] : []),
    ],
    timeoutMs,
  );
}

/**
 * Points 1 et 3. Idempotent (purge par commentaire puis repose). Ne fait rien
 * sans hotspot. Renvoie les interfaces hotspot protégées.
 */
export async function ensureRouterHardening(client: RouterOSClient, timeoutMs = 15000): Promise<string[]> {
  const hotspots = await client.talk(["/ip/hotspot/print"], timeoutMs).catch(() => [] as Row[]);
  const ifaces = [...new Set(hotspots.map((h) => h.interface).filter(Boolean))];
  if (ifaces.length === 0) return [];

  // Liste des interfaces hotspot (sert au pare-feu et à MAC-Winbox).
  await removeByComment(client, "/interface/list/member", timeoutMs);
  const lists = await client.talk(["/interface/list/print"], timeoutMs).catch(() => [] as Row[]);
  if (!lists.some((l) => l.name === HOTSPOT_LIST)) {
    await client.talk(["/interface/list/add", `=name=${HOTSPOT_LIST}`, `=comment=${HARDENING_COMMENT}`], timeoutMs);
  }
  for (const iface of ifaces) {
    await client
      .talk(
        ["/interface/list/member/add", `=list=${HOTSPOT_LIST}`, `=interface=${iface}`, `=comment=${HARDENING_COMMENT}`],
        timeoutMs,
      )
      .catch(() => {});
  }

  // Ports WebFig réellement utilisés (hors 80/443 du portail).
  const services = await client.talk(["/ip/service/print"], timeoutMs).catch(() => [] as Row[]);
  const webPorts = services
    .filter((s) => (s.name === "www" || s.name === "www-ssl") && s.dynamic !== "true")
    .map((s) => Number(s.port));

  await removeByComment(client, "/ip/firewall/filter", timeoutMs);
  // 3. Routeur fermé à son Wi-Fi clients (ports d'administration).
  await addFilterOnTop(
    client,
    "input",
    [
      `=in-interface-list=${HOTSPOT_LIST}`,
      "=protocol=tcp",
      `=dst-port=${adminPortsToBlock(webPorts)}`,
      "=action=drop",
    ],
    timeoutMs,
  );
  // 1. MikHmon (et tout conteneur) fermé au Wi-Fi clients, quel que soit le
  //    port de redirection (8087/8088/8089…).
  await addFilterOnTop(
    client,
    "forward",
    [`=in-interface-list=${HOTSPOT_LIST}`, `=dst-address=${CONTAINER_NET}`, "=action=drop"],
    timeoutMs,
  );

  // 3. MAC-Winbox / MAC-Telnet : toutes les interfaces SAUF le Wi-Fi clients.
  if (!lists.some((l) => l.name === MAC_ADMIN_LIST)) {
    await client
      .talk(
        [
          "/interface/list/add",
          `=name=${MAC_ADMIN_LIST}`,
          "=include=all",
          `=exclude=${HOTSPOT_LIST}`,
          `=comment=${HARDENING_COMMENT}`,
        ],
        timeoutMs,
      )
      .catch(() => {});
  }
  await client.talk(["/tool/mac-server/mac-winbox/set", `=allowed-interface-list=${MAC_ADMIN_LIST}`], timeoutMs).catch(() => {});
  await client.talk(["/tool/mac-server/set", `=allowed-interface-list=${MAC_ADMIN_LIST}`], timeoutMs).catch(() => {});

  return ifaces;
}

/** Nouveau mot de passe MikHmon : 12 caractères lisibles (sans 0/O/1/l/I). */
export function generateMikhmonPassword(randomBytesFn: (n: number) => Uint8Array): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(randomBytesFn(12), (b) => alphabet[b % alphabet.length]).join("");
}

/** Ligne d'identifiants MikHmon avec un nouveau mot de passe (legacy). */
export function mikhmonAdminLine(password: string): string {
  return `$data['mikhmon'] = array ('1'=>'mikhmon<|<mikhmon','2'=>'mikhmon>|>${mikhmonLegacyEncrypt(password)}');`;
}

/** Remplace, dans un config.php, la ligne d'identifiants SI elle porte le mot
 * de passe d'usine. null si rien à changer (mot de passe déjà personnalisé). */
export function replaceDefaultMikhmonAdmin(configPhp: string, password: string): string | null {
  const lines = configPhp.split("\n");
  const i = lines.findIndex((l) => l.startsWith("$data['mikhmon']"));
  if (i < 0 || !lines[i].includes(MIKHMON_DEFAULT_PASSWORD_ENC)) return null;
  lines[i] = mikhmonAdminLine(password);
  return lines.join("\n");
}

/** Script RouterOS qui remplace, SUR le routeur, le mot de passe d'usine de
 * MikHmon dans config.php puis redémarre le conteneur. Exécuté côté routeur
 * parce que l'API ne lit pas les fichiers d'un « container store » (ils ne
 * s'énumèrent pas et /file/get par l'API revient vide), alors que la CLI les
 * lit par chemin. Pose la globale slhMkRot="1" si le mot de passe a changé. */
export function buildMikhmonRotateScript(newEnc: string): string {
  if (!/^[A-Za-z0-9+/=]+$/.test(newEnc)) throw new Error("mot de passe chiffré inattendu");
  const def = MIKHMON_DEFAULT_PASSWORD_ENC;
  return [
    ':global slhMkRot "0";',
    ':local c [/container find where name~"mikhmon" or root-dir~"mikhmon"];',
    ':if ([:len $c] > 0) do={',
    '  :local rd [/container get [:pick $c 0] root-dir];',
    '  :if ([:pick $rd 0 1] = "/") do={ :set rd [:pick $rd 1 [:len $rd]] };',
    '  :local f ($rd . "/src/src/include/config.php");',
    '  :local t "";',
    '  :do { :set t [/file get $f contents] } on-error={};',
    `  :local i [:find $t "mikhmon>|>${def}"];`,
    '  :if ([:typeof $i] = "num") do={',
    `    :set t ([:pick $t 0 $i] . "mikhmon>|>${newEnc}" . [:pick $t ($i + ${`mikhmon>|>${def}`.length}) [:len $t]]);`,
    '    /file set $f contents=$t;',
    '    /container stop [:pick $c 0]; :delay 3s; /container start [:pick $c 0];',
    '    :set slhMkRot "1";',
    '  };',
    '};',
  ].join("\n");
}

/**
 * Point 2. Si MikHmon a encore le mot de passe d'usine, le remplace par
 * `password` et redémarre le conteneur. Renvoie true si le mot de passe a été
 * changé — l'appelant DOIT alors le conserver (sinon l'exploitant est dehors).
 */
export async function rotateDefaultMikhmonPassword(
  client: RouterOSClient,
  password: string,
  timeoutMs = 30000,
): Promise<boolean> {
  const name = "slh-mikhmon-rotate";
  const old = await client.talk(["/system/script/print", `?name=${name}`], timeoutMs).catch(() => [] as Row[]);
  for (const r of old) if (r[".id"]) await client.talk(["/system/script/remove", `=numbers=${r[".id"]}`], timeoutMs).catch(() => {});
  await client.talk(
    ["/system/script/add", `=name=${name}`, `=source=${buildMikhmonRotateScript(mikhmonLegacyEncrypt(password))}`],
    timeoutMs,
  );
  try {
    await client.talk(["/system/script/run", `=number=${name}`], timeoutMs);
    const env = await client
      .talk(["/system/script/environment/print", "?name=slhMkRot"], timeoutMs)
      .catch(() => [] as Row[]);
    return env[0]?.value === "1";
  } finally {
    const rows = await client.talk(["/system/script/print", `?name=${name}`], timeoutMs).catch(() => [] as Row[]);
    for (const r of rows) if (r[".id"]) await client.talk(["/system/script/remove", `=numbers=${r[".id"]}`], timeoutMs).catch(() => {});
    const env = await client.talk(["/system/script/environment/print", "?name=slhMkRot"], timeoutMs).catch(() => [] as Row[]);
    for (const e of env) if (e[".id"]) await client.talk(["/system/script/environment/remove", `=numbers=${e[".id"]}`], timeoutMs).catch(() => {});
  }
}
