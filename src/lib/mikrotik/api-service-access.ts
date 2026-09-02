import type { RouterOSClient } from "./client";

/**
 * « MikroTik Not Connected » dans MikHmon, alors que TOUT LE RESTE va bien.
 *
 * Le MikHmon hébergé tourne dans un conteneur sur le routeur (veth 11.11.11.11)
 * et pilote RouterOS par l'API, à la passerelle du bridge DOCKERS
 * (11.11.11.1:8728). L'auto-setup restreint le service API aux seules sources
 * légitimes :
 *
 *     /ip service set api address=10.66.0.0/24,11.11.11.0/28
 *                                └ le tunnel      └ le conteneur
 *
 * Cette ligne n'est écrite QU'À l'auto-setup (ou à la réparation). Rien ne la
 * vérifie ensuite. Un routeur provisionné avant qu'elle existe, une
 * restauration d'une sauvegarde plus ancienne, ou un `address=` resserré à la
 * main, et le second terme disparaît : RouterOS refuse alors la connexion
 * du conteneur — sans rien journaliser côté MikHmon, qui affiche seulement
 * « Not Connected ».
 *
 * Le piège de diagnostic : SafeLinkHub, lui, arrive par le tunnel (10.66.0.x),
 * qui est TOUJOURS dans la liste — sinon l'app ne verrait plus le routeur du
 * tout. Le routeur est donc « en ligne », l'audit tourne, le portail marche, la
 * page MikHmon s'affiche… et seule l'interface de tickets reste vide. Rien dans
 * l'état visible ne pointe vers la liste d'adresses du service API.
 *
 * Ce module la LIT et sait la compléter, sans jamais rien y retirer.
 */

/** Port de l'API que MikHmon interroge — il ne sait pas en changer. */
export const MIKHMON_EXPECTED_API_PORT = 8728;

const IPV4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function toUint32(ip: string): number | null {
  const m = IPV4.exec(ip.trim());
  if (!m) return null;
  let n = 0;
  for (let i = 1; i <= 4; i++) {
    const part = Number(m[i]);
    if (part > 255) return null;
    n = (n * 256 + part) >>> 0;
  }
  return n >>> 0;
}

/**
 * `ip` tombe-t-il dans `entry` ? `entry` est une entrée de la liste `address=`
 * d'un service RouterOS : un préfixe (`11.11.11.0/28`) ou une adresse nue
 * (`10.66.0.1`), qui vaut alors /32.
 */
export function ipv4InPrefix(ip: string, entry: string): boolean {
  const [network, bitsRaw] = entry.trim().split("/");
  const bits = bitsRaw === undefined ? 32 : Number(bitsRaw);
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false;
  const a = toUint32(ip);
  const b = toUint32(network);
  if (a === null || b === null) return false;
  if (bits === 0) return true; // 0.0.0.0/0 : tout passe
  const mask = (0xffffffff << (32 - bits)) >>> 0;
  return ((a & mask) >>> 0) === ((b & mask) >>> 0);
}

/** `"10.66.0.0/24,11.11.11.0/28"` → `["10.66.0.0/24", "11.11.11.0/28"]`. */
export function parseServiceAddressList(field: string | undefined | null): string[] {
  return String(field ?? "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean);
}

export type ApiServiceCheck = {
  /** Le service API est-il éteint ? */
  disabled: boolean;
  port: number | null;
  entries: string[];
  /** Liste vide = aucune restriction de source (toutes les IP sont admises). */
  restricted: boolean;
  /** Le conteneur MikHmon est-il autorisé à ouvrir l'API ? */
  reachableFromContainer: boolean;
  /** API déplacée hors de 8728 : MikHmon ne sait pas suivre. */
  portMismatch: boolean;
};

export function inspectApiService(
  row: Record<string, string> | undefined,
  containerIp: string,
): ApiServiceCheck | null {
  if (!row) return null;
  const entries = parseServiceAddressList(row.address);
  const restricted = entries.length > 0;
  const portRaw = Number(row.port);
  const port = Number.isFinite(portRaw) && portRaw > 0 ? portRaw : null;
  return {
    disabled: row.disabled === "true",
    port,
    entries,
    restricted,
    // Liste vide = ouvert : le conteneur passe. Sinon il faut une entrée qui
    // le couvre.
    reachableFromContainer: !restricted || entries.some((e) => ipv4InPrefix(containerIp, e)),
    portMismatch: port !== null && port !== MIKHMON_EXPECTED_API_PORT,
  };
}

/**
 * Liste complétée de l'entrée manquante. On AJOUTE, on ne retire jamais : la
 * liste existante porte le tunnel par lequel SafeLinkHub est en train de
 * parler au routeur — la réécrire de zéro couperait la connexion qui applique
 * le correctif.
 *
 * L'ajout est un /32 sur l'adresse RÉELLE du conteneur, pas le /28 du plan :
 * un MikHmon installé autrement vit sur une autre veth (constaté sur
 * SHIA-HSPT), dont on ne connaît pas le masque.
 */
export function addressListWithContainer(entries: string[], containerIp: string): string {
  return [...entries, `${containerIp}/32`].join(",");
}

export type ApiAccessRepair = {
  /** Le service API existe-t-il dans /ip/service ? */
  found: boolean;
  /** Un `set` a-t-il été appliqué ? (false = déjà conforme) */
  applied: boolean;
  wasDisabled: boolean;
  /** Entrée ajoutée à la liste, ou null si seule la réactivation manquait. */
  added: string | null;
  before: string;
  after: string;
};

/**
 * Rend l'API joignable depuis le conteneur MikHmon. Idempotent : no-op si la
 * liste couvre déjà le conteneur et que le service tourne. NE TOUCHE PAS au
 * port : le déplacer couperait la connexion SafeLinkHub en cours (elle utilise
 * le port enregistré côté app), pour un problème qui se signale mais ne se
 * répare pas à l'aveugle.
 */
export async function ensureApiReachableFromContainer(
  client: RouterOSClient,
  containerIp: string,
  timeoutMs = 15000,
): Promise<ApiAccessRepair> {
  const rows = await client.talk(["/ip/service/print", "?name=api"], timeoutMs).catch(() => []);
  const row = rows[0];
  const check = inspectApiService(row, containerIp);
  if (!row || !check) {
    return { found: false, applied: false, wasDisabled: false, added: null, before: "", after: "" };
  }

  const before = check.entries.join(",");
  if (check.reachableFromContainer && !check.disabled) {
    return { found: true, applied: false, wasDisabled: false, added: null, before, after: before };
  }

  const after = check.reachableFromContainer
    ? before
    : addressListWithContainer(check.entries, containerIp);

  await client.talk(
    ["/ip/service/set", "=numbers=api", `=address=${after}`, "=disabled=no"],
    timeoutMs,
  );

  return {
    found: true,
    applied: true,
    wasDisabled: check.disabled,
    added: check.reachableFromContainer ? null : `${containerIp}/32`,
    before,
    after,
  };
}
