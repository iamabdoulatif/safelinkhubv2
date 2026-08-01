import type { RouterOSClient } from "./client";

/**
 * « Kill-switch » routeur : couper TOUS les ports d'accès (ethernet hors
 * ether1) ET le WiFi, en gardant ether1 vivant.
 *
 * ether1 est délibérément épargné : c'est le lien WAN / de gestion sur lequel
 * transite le tunnel WireGuard vers le relais SafeLinkHub. Le couper aussi
 * rendrait le routeur INJOIGNABLE — donc impossible à déverrouiller à distance
 * (déplacement physique obligatoire). On garde ether1 up pour pouvoir toujours
 * ré-ouvrir les ports depuis le SaaS.
 */
export const MANAGEMENT_PORT = "ether1";

export type RouterLockResult = {
  /** Interfaces effectivement désactivées par CETTE opération. */
  locked: string[];
  /** Interfaces d'accès déjà désactivées avant (laissées telles quelles). */
  alreadyDisabled: string[];
  /** Interface conservée up (le lien WAN/gestion). */
  kept: string;
};

export type RouterUnlockResult = {
  enabled: string[];
  failed: { name: string; error: string }[];
};

type IfaceState = { name: string; disabled: boolean };

/**
 * Interfaces « d'accès » à couper : ports ethernet SAUF ether1, plus toutes les
 * radios WiFi (API récente /interface/wifi et legacy /interface/wireless). On ne
 * touche JAMAIS aux bridges, veth conteneur, WireGuard, VLAN ou loopback — les
 * couper romprait le chemin de gestion ou serait inutile au « gel » des clients.
 */
async function accessInterfaces(client: RouterOSClient, timeoutMs: number): Promise<IfaceState[]> {
  const out: IfaceState[] = [];
  const eth = await client.talk(["/interface/ethernet/print"], timeoutMs).catch(() => []);
  for (const e of eth) {
    if (!e.name || e.name === MANAGEMENT_PORT) continue;
    out.push({ name: e.name, disabled: e.disabled === "true" });
  }
  const wifi = await client.talk(["/interface/wifi/print"], timeoutMs).catch(() => []);
  for (const w of wifi) if (w.name) out.push({ name: w.name, disabled: w.disabled === "true" });
  const legacy = await client.talk(["/interface/wireless/print"], timeoutMs).catch(() => []);
  for (const w of legacy) if (w.name) out.push({ name: w.name, disabled: w.disabled === "true" });
  // Dédoublonnage par nom (une radio peut apparaître dans deux /print selon le paquet).
  const seen = new Set<string>();
  return out.filter((i) => (seen.has(i.name) ? false : (seen.add(i.name), true)));
}

/**
 * Détecte l'interface qui porte l'accès Internet (le WAN), pour vérifier qu'on
 * n'est PAS en train de couper le lien qui porte le tunnel. Best-effort :
 * client DHCP actif d'abord, sinon interface de la route par défaut.
 */
async function detectUplinkInterface(
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
 * Verrouille le routeur : désactive tous les ports d'accès + WiFi sauf ether1.
 *
 * GARDE-FOU anti-auto-exclusion : si le WAN (Internet/tunnel) passe par une
 * interface qu'on s'apprête à couper (≠ ether1), on ABANDONNE sans rien
 * désactiver — sinon on perdrait l'accès distant et le déverrouillage. L'admin
 * doit d'abord câbler le WAN sur ether1.
 */
export async function lockRouterInterfaces(
  client: RouterOSClient,
  opts: { timeoutMs?: number } = {},
): Promise<RouterLockResult> {
  const timeoutMs = opts.timeoutMs ?? 20000;

  const ifaces = await accessInterfaces(client, timeoutMs);
  const disableNames = new Set(ifaces.map((i) => i.name));

  const uplink = await detectUplinkInterface(client, timeoutMs);
  if (uplink && uplink !== MANAGEMENT_PORT && disableNames.has(uplink)) {
    throw new Error(
      `Le lien Internet/WAN passe par « ${uplink} », pas par ether1 — verrouillage annulé ` +
        `pour ne pas couper l'accès distant. Basculez le WAN sur ether1 avant de verrouiller.`,
    );
  }

  const toDisable = ifaces.filter((i) => !i.disabled).map((i) => i.name);
  const alreadyDisabled = ifaces.filter((i) => i.disabled).map((i) => i.name);

  for (const name of toDisable) {
    // Un par un : un nom refusé (interface disparue) ne doit pas bloquer les autres.
    await client.talk(["/interface/disable", `=numbers=${name}`], timeoutMs);
  }

  return { locked: toDisable, alreadyDisabled, kept: MANAGEMENT_PORT };
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
    targets = (await accessInterfaces(client, timeoutMs)).map((i) => i.name);
  }

  const enabled: string[] = [];
  const failed: { name: string; error: string }[] = [];
  for (const name of targets) {
    if (name === MANAGEMENT_PORT) continue;
    try {
      await client.talk(["/interface/enable", `=numbers=${name}`], timeoutMs);
      enabled.push(name);
    } catch (err) {
      failed.push({ name, error: err instanceof Error ? err.message : "Erreur inconnue" });
    }
  }
  return { enabled, failed };
}
