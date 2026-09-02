import type { RouterOSClient } from "./client";

/**
 * « Kill-switch » routeur : couper TOUS les ports d'accès ET le WiFi, en gardant
 * le port WAN vivant.
 *
 * Le port WAN est délibérément épargné : c'est le lien de gestion sur lequel
 * transite le tunnel WireGuard vers le relais SafeLinkHub. Le couper aussi
 * rendrait le routeur INJOIGNABLE — donc impossible à déverrouiller à distance
 * (déplacement physique obligatoire).
 *
 * IMPORTANT — le WAN n'est PAS repéré par le nom littéral « ether1 » : sur le
 * parc, ce port est souvent RENOMMÉ (ex. « E1-WAN-FAI »). On le repère donc de
 * façon robuste par : (1) le `default-name` d'usine « ether1 » (conservé même
 * après renommage) ET (2) l'interface qui porte réellement Internet (client
 * DHCP / route par défaut). Tout ce qui est ainsi identifié comme WAN est gardé
 * up ; le nom d'affichage n'a aucune importance.
 */
export const MANAGEMENT_DEFAULT_NAME = "ether1";

export type RouterLockResult = {
  /** Interfaces effectivement désactivées par CETTE opération. */
  locked: string[];
  /** Interfaces d'accès déjà désactivées avant (laissées telles quelles). */
  alreadyDisabled: string[];
  /** Interface(s) conservée(s) up (le lien WAN/gestion). */
  kept: string[];
};

export type RouterUnlockResult = {
  enabled: string[];
  failed: { name: string; error: string }[];
};

type IfaceState = { name: string; disabled: boolean };

/**
 * Noms des ports WAN à CONSERVER up. Robuste au renommage : on garde tout port
 * ethernet dont le `default-name` d'usine est « ether1 » (donc « E1-WAN-FAI »
 * est reconnu), ainsi que l'interface qui porte réellement Internet (uplink
 * détecté). Le nom d'affichage n'entre jamais en compte.
 */
async function wanKeepNames(
  client: RouterOSClient,
  timeoutMs: number,
): Promise<{ keep: Set<string>; uplink: string | null }> {
  const keep = new Set<string>();
  const eth = await client.talk(["/interface/ethernet/print"], timeoutMs).catch(() => []);
  for (const e of eth) {
    const name = e.name;
    if (!name) continue;
    if (name === MANAGEMENT_DEFAULT_NAME || e["default-name"] === MANAGEMENT_DEFAULT_NAME) {
      keep.add(name);
    }
  }
  const uplink = await detectUplinkInterface(client, timeoutMs);
  if (uplink) keep.add(uplink);
  return { keep, uplink };
}

/**
 * Interfaces « d'accès » à couper : ports ethernet HORS WAN, plus toutes les
 * radios WiFi (API récente /interface/wifi et legacy /interface/wireless). On ne
 * touche JAMAIS aux bridges, veth conteneur, WireGuard, VLAN ou loopback — les
 * couper romprait le chemin de gestion ou serait inutile au « gel » des clients.
 */
async function accessInterfaces(
  client: RouterOSClient,
  timeoutMs: number,
  keep: Set<string>,
): Promise<IfaceState[]> {
  const out: IfaceState[] = [];
  const eth = await client.talk(["/interface/ethernet/print"], timeoutMs).catch(() => []);
  for (const e of eth) {
    if (!e.name || keep.has(e.name)) continue;
    out.push({ name: e.name, disabled: e.disabled === "true" });
  }
  const wifi = await client.talk(["/interface/wifi/print"], timeoutMs).catch(() => []);
  for (const w of wifi) if (w.name && !keep.has(w.name)) out.push({ name: w.name, disabled: w.disabled === "true" });
  const legacy = await client.talk(["/interface/wireless/print"], timeoutMs).catch(() => []);
  for (const w of legacy) if (w.name && !keep.has(w.name)) out.push({ name: w.name, disabled: w.disabled === "true" });
  // Dédoublonnage par nom (une radio peut apparaître dans deux /print selon le paquet).
  const seen = new Set<string>();
  return out.filter((i) => (seen.has(i.name) ? false : (seen.add(i.name), true)));
}

/**
 * Détecte l'interface qui porte l'accès Internet (le WAN), pour vérifier qu'on
 * n'est PAS en train de couper le lien qui porte le tunnel. Best-effort :
 * client DHCP actif d'abord, sinon interface de la route par défaut.
 */
export async function detectUplinkInterface(
  client: RouterOSClient,
  timeoutMs: number,
): Promise<string | null> {
  const dhcp = await client.talk(["/ip/dhcp-client/print"], timeoutMs).catch(() => []);
  const boundDhcp = dhcp.find(
    (d) => d.interface && d.disabled !== "true" && (d.status === "bound" || !d.status),
  );
  if (boundDhcp?.interface) return boundDhcp.interface;

  const routes = await client
    .talk(["/ip/route/print", "?dst-address=0.0.0.0/0", "?active=yes"], timeoutMs)
    .catch(() => []);
  for (const r of routes) {
    const gw = r["immediate-gw"] || r.gateway || "";
    // "192.168.1.1%ether1" -> ether1 ; ou directement un nom d'interface.
    const viaPercent = /%([^,%\s]+)\s*$/.exec(gw);
    if (viaPercent) return viaPercent[1];
    if (gw && /^(ether|sfp|wlan|wifi|bridge)/i.test(gw)) return gw.split(",")[0];
  }
  return null;
}

/**
 * Verrouille le routeur : désactive tous les ports d'accès + WiFi SAUF le port
 * WAN (repéré par son default-name ether1 ET par l'uplink Internet, quel que
 * soit son nom d'affichage — « E1-WAN-FAI » compris).
 *
 * GARDE-FOU anti-auto-exclusion : si aucun port WAN ne peut être identifié
 * (ni default-name ether1, ni uplink détecté), on ABANDONNE sans rien couper —
 * verrouiller à l'aveugle risquerait de trancher l'accès distant.
 */
export async function lockRouterInterfaces(
  client: RouterOSClient,
  opts: { timeoutMs?: number } = {},
): Promise<RouterLockResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;

  const { keep, uplink } = await wanKeepNames(client, timeoutMs);
  if (keep.size === 0) {
    throw new Error(
      "Impossible d'identifier le port WAN (ni default-name ether1, ni lien Internet détecté) — " +
        "verrouillage annulé par sécurité pour ne pas couper l'accès distant.",
    );
  }

  const ifaces = await accessInterfaces(client, timeoutMs, keep);
  const toDisable = ifaces.filter((i) => !i.disabled).map((i) => i.name);
  const alreadyDisabled = ifaces.filter((i) => i.disabled).map((i) => i.name);

  for (const name of toDisable) {
    // Un par un : un nom refusé (interface disparue) ne doit pas bloquer les autres.
    await client.talk(["/interface/disable", `=numbers=${name}`], timeoutMs);
  }

  // On préfère afficher le port qui porte réellement Internet ; sinon la garde WAN.
  const kept = uplink ? [uplink] : Array.from(keep);
  return { locked: toDisable, alreadyDisabled, kept };
}

/**
 * Déverrouille : réactive les interfaces mémorisées lors du verrouillage. Si
 * aucune liste n'est fournie (verrou posé hors SaaS), repli : réactive tous les
 * ports d'accès + WiFi sauf ether1. ether1 n'est jamais touché.
 */
export async function unlockRouterInterfaces(
  client: RouterOSClient,
  names: string[] | null,
  opts: { timeoutMs?: number } = {},
): Promise<RouterUnlockResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;

  let targets: string[];
  if (names && names.length > 0) {
    targets = names;
  } else {
    // Repli (verrou posé hors SaaS) : réactive tous les ports d'accès + WiFi,
    // hors ports WAN (jamais touchés au verrouillage de toute façon).
    const { keep } = await wanKeepNames(client, timeoutMs);
    targets = (await accessInterfaces(client, timeoutMs, keep)).map((i) => i.name);
  }

  const enabled: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const name of targets) {
    try {
      await client.talk(["/interface/enable", `=numbers=${name}`], timeoutMs);
      enabled.push(name);
    } catch (err) {
      failed.push({ name, error: err instanceof Error ? err.message : "Erreur inconnue" });
    }
  }
  return { enabled, failed };
}
