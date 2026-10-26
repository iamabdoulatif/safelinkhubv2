// VOIE DE PAIEMENT : une session hotspot RESTREINTE, le temps de payer.
//
// Le problème qu'elle résout (RUE-NICOLAS, 12/10/2026) : un client pas encore
// authentifié n'a d'internet que depuis son NAVIGATEUR, vers le walled-garden.
// L'app Wave, elle, n'a aucun réseau — « Ouverture de l'application Wave… »
// n'aboutit jamais pour un client sans data mobile. Et sur iPhone, la fenêtre
// « Wi-Fi captif » (CNA) interdit de lancer une app : il faut que iOS voie le
// réseau EN LIGNE (sonde captive.apple.com → « Success ») pour afficher
// « Terminé », rendre la main au téléphone et laisser l'app Wave utiliser le
// Wi-Fi.
//
// Mécanique RouterOS :
//   • profil hotspot `slh-paiement` : session de 10 min, chaque client logué
//     est inscrit dans l'address-list `slh-paiement` ; PAS de mac-cookie,
//     sinon un client qui abandonne serait re-logué dans la voie restreinte
//     (sans portail ni internet) à chacun de ses retours ;
//   • pare-feu forward (en tête) : un client de cette liste n'atteint QUE la
//     liste du walled-garden (rails de paiement, nourrie par le DNS — voir
//     walled-garden.ts) et la liste `slh-paiement-ok` (sondes de connectivité
//     iOS/Android + adresses de l'app) ; tout le reste est rejeté ;
//   • ouverture : /pay crée un user `pay-<mac>` et le logue par l'API
//     (`/ip/hotspot/active/login`, comme l'auto-login après paiement) ;
//   • fermeture : à l'honneur de la commande (fulfill), avant le login du
//     vrai code — sinon la session restreinte masquerait le ticket. Le user
//     porte limit-uptime=10m : abandonné, il ne peut plus servir.
//
// Déploiement : `ensurePaymentLane` (API) est appelé par la réconciliation
// automatique du walled-garden (walled-garden.ts) sur chaque routeur
// RouterOS 7 doté d'un hotspot ; `paymentLaneScriptLines` est la même chose
// en script CLI (installation manuelle). `openPaymentLane` n'ouvre une voie
// QUE si le profil existe sur le routeur (sinon, comportement inchangé).

import type { RouterOSClient } from "./client";

export const PAYMENT_LANE_PROFILE = "slh-paiement";
export const PAYMENT_LANE_LIST = "slh-paiement";
export const PAYMENT_LANE_OK_LIST = "slh-paiement-ok";
export const PAYMENT_LANE_COMMENT = "safelinkhub-paiement";
// Commentaire DISTINCT pour les entrées de liste par client : la réconciliation
// (ensurePaymentLane) purge par `PAYMENT_LANE_COMMENT` ; ces entrées-là ne
// doivent PAS être balayées à chaque passage — elles s'auto-expirent au timeout.
export const PAYMENT_LANE_CLIENT_COMMENT = "safelinkhub-paiement-client";
export const PAYMENT_LANE_SESSION = "10m";
// Durée de vie de l'entrée de restriction par client : un peu PLUS longue que la
// session (limit-uptime=10m) pour couvrir toute la session même si RouterOS
// élague l'entrée dynamique du profil (constaté : session active, liste vide,
// client en plein internet → voir openPaymentLane).
export const PAYMENT_LANE_LIST_TIMEOUT = "12m";

// Sondes de connectivité : tant qu'elles échouent, iOS garde la fenêtre captive
// ouverte (et Android son avis « réseau sans internet »). Autorisées SEULEMENT
// pour la voie de paiement — jamais dans le walled-garden, sinon le portail ne
// « jaillit » plus (voir walled-garden.ts).
export const CONNECTIVITY_PROBE_HOSTS = [
  "captive.apple.com",
  "www.apple.com",
  "www.appleiphonecell.com",
  "www.itools.info",
  "www.ibook.info",
  "www.airport.us",
  "www.thinkdifferent.us",
  "connectivitycheck.gstatic.com",
  "connectivitycheck.android.com",
];

const FORWARD_TO = "1.1.1.1";

/** Nom du user hotspot de la voie, dérivé du MAC (sans « : »). */
export function paymentLaneUser(mac: string): string {
  return `pay-${mac.replace(/[^0-9a-f]/gi, "").toLowerCase()}`;
}

/**
 * Script RouterOS (CLI) installant la voie sur un routeur — idempotent : purge
 * par commentaire puis repose. `appAddresses` = adresses de safelinkhub.io
 * (app-ip-pin) pour que la page de confirmation reste joignable.
 */
export function paymentLaneScriptLines(appAddresses: string[], walledGardenList: string): string[] {
  const C = PAYMENT_LANE_COMMENT;
  return [
    `:do { /ip hotspot user profile add name="${PAYMENT_LANE_PROFILE}" address-list="${PAYMENT_LANE_LIST}" session-timeout=${PAYMENT_LANE_SESSION} keepalive-timeout=2m shared-users=1 add-mac-cookie=no } on-error={ /ip hotspot user profile set [find name="${PAYMENT_LANE_PROFILE}"] address-list="${PAYMENT_LANE_LIST}" session-timeout=${PAYMENT_LANE_SESSION} keepalive-timeout=2m shared-users=1 add-mac-cookie=no }`,
    `/ip dns static remove [find comment="${C}"]`,
    ...CONNECTIVITY_PROBE_HOSTS.map(
      (h) =>
        `/ip dns static add name="${h}" type=FWD forward-to=${FORWARD_TO} address-list="${PAYMENT_LANE_OK_LIST}" comment="${C}"`,
    ),
    `/ip firewall address-list remove [find comment="${C}"]`,
    ...appAddresses.map(
      (a) => `/ip firewall address-list add list="${PAYMENT_LANE_OK_LIST}" address=${a} comment="${C}"`,
    ),
    `/ip firewall filter remove [find comment="${C}"]`,
    // En TÊTE du forward (avant le masquage amont et le filtre de contenu) :
    // le dernier ajouté se place avant la première règle statique, donc on
    // ajoute dans l'ordre inverse de lecture.
    `/ip firewall filter add chain=forward src-address-list="${PAYMENT_LANE_LIST}" action=reject reject-with=icmp-network-unreachable comment="${C}" place-before=([find chain=forward dynamic=no]->0)`,
    `/ip firewall filter add chain=forward src-address-list="${PAYMENT_LANE_LIST}" dst-address-list="${PAYMENT_LANE_OK_LIST}" action=accept comment="${C}" place-before=([find chain=forward dynamic=no]->0)`,
    `/ip firewall filter add chain=forward src-address-list="${PAYMENT_LANE_LIST}" dst-address-list="${walledGardenList}" action=accept comment="${C}" place-before=([find chain=forward dynamic=no]->0)`,
  ];
}

type Row = Record<string, string>;

async function removeByComment(client: RouterOSClient, path: string, timeoutMs: number) {
  const rows = await client
    .talk([`${path}/print`, `?comment=${PAYMENT_LANE_COMMENT}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const row of rows) {
    if (row[".id"]) await client.talk([`${path}/remove`, `=numbers=${row[".id"]}`], timeoutMs).catch(() => {});
  }
}

/** Supprime les cookies hotspot (MAC ou HTTP) d'un user de la voie : sans
 * cookie, un paiement abandonné ne reconnecte pas le téléphone en silence —
 * à la fin de la session (10 min) le portail revient. */
async function removeLaneCookies(client: RouterOSClient, user: string, timeoutMs: number) {
  const rows = await client
    .talk(["/ip/hotspot/cookie/print", `?user=${user}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const row of rows) {
    if (row[".id"]) await client.talk(["/ip/hotspot/cookie/remove", `=numbers=${row[".id"]}`], timeoutMs).catch(() => {});
  }
}

/** Retire les entrées de restriction par client (notre commentaire) pour une IP.
 * On filtre côté JS (liste + commentaire) : empiler plusieurs `?` dans l'API
 * RouterOS ne les combine pas en ET sans opérateur explicite. */
async function removeLaneAddress(client: RouterOSClient, ip: string, timeoutMs: number) {
  const rows = await client
    .talk(["/ip/firewall/address-list/print", `?address=${ip}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const row of rows) {
    if (row[".id"] && row.list === PAYMENT_LANE_LIST && row.comment === PAYMENT_LANE_CLIENT_COMMENT) {
      await client.talk(["/ip/firewall/address-list/remove", `=numbers=${row[".id"]}`], timeoutMs).catch(() => {});
    }
  }
}

/**
 * Garantit que l'IP du client est dans la liste `slh-paiement` pour TOUTE la
 * durée de la voie — entrée STATIQUE à nous (timeout borné), indépendante de
 * l'entrée dynamique du profil que RouterOS élague parfois en cours de session.
 * Sans ça, un client authentifié mais absent de la liste ne matche plus le
 * rejet et tombe dans l'accept par défaut du forward = plein internet gratuit.
 * Re-pose à neuf (purge + ajout) pour rafraîchir le timeout à chaque ouverture.
 */
async function ensureLaneAddress(client: RouterOSClient, ip: string, timeoutMs: number) {
  await removeLaneAddress(client, ip, timeoutMs);
  await client
    .talk(
      [
        "/ip/firewall/address-list/add",
        `=list=${PAYMENT_LANE_LIST}`,
        `=address=${ip}`,
        `=timeout=${PAYMENT_LANE_LIST_TIMEOUT}`,
        `=comment=${PAYMENT_LANE_CLIENT_COMMENT}`,
      ],
      timeoutMs,
    )
    .catch(() => {});
}

/**
 * Installe/actualise la voie par l'API (idempotent : purge par commentaire puis
 * repose). Ne fait RIEN sur un routeur sans hotspot ni sur RouterOS 6 (les
 * entrées DNS FWD qui nourrissent les listes n'y existent pas). Renvoie ce qui
 * a été fait, pour les journaux.
 */
export async function ensurePaymentLane(
  client: RouterOSClient,
  appAddresses: readonly string[],
  walledGardenList: string,
  timeoutMs = 15000,
): Promise<"installed" | "skipped-v6" | "skipped-no-hotspot"> {
  const [resource] = await client.talk(["/system/resource/print"], timeoutMs).catch(() => [] as Row[]);
  if (!/^7\./.test(resource?.version ?? "")) return "skipped-v6";
  const hotspots = await client.talk(["/ip/hotspot/print"], timeoutMs).catch(() => [] as Row[]);
  if (hotspots.length === 0) return "skipped-no-hotspot";

  const profileProps = [
    `=address-list=${PAYMENT_LANE_LIST}`,
    `=session-timeout=${PAYMENT_LANE_SESSION}`,
    "=keepalive-timeout=2m",
    "=shared-users=1",
    // Surtout PAS de mac-cookie-timeout : RouterOS réactive add-mac-cookie
    // dès qu'on le définit (constaté sur RUE-NICOLAS, 7.23.1).
    "=add-mac-cookie=no",
  ];
  const [profile] = await client
    .talk(["/ip/hotspot/user/profile/print", `?name=${PAYMENT_LANE_PROFILE}`], timeoutMs)
    .catch(() => [] as Row[]);
  if (profile?.[".id"]) {
    await client.talk(["/ip/hotspot/user/profile/set", `=.id=${profile[".id"]}`, ...profileProps], timeoutMs);
  } else {
    await client.talk(["/ip/hotspot/user/profile/add", `=name=${PAYMENT_LANE_PROFILE}`, ...profileProps], timeoutMs);
  }

  // Nettoyage des voies déjà ouvertes : cookies laissés par une version
  // antérieure (réparation du login par MAC qui forçait add-mac-cookie=yes).
  const laneUsers = await client
    .talk(["/ip/hotspot/user/print", `?comment=${PAYMENT_LANE_COMMENT}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const u of laneUsers) {
    if (u.name) await removeLaneCookies(client, u.name, timeoutMs);
  }

  await removeByComment(client, "/ip/dns/static", timeoutMs);
  for (const host of CONNECTIVITY_PROBE_HOSTS) {
    await client.talk(
      [
        "/ip/dns/static/add",
        `=name=${host}`,
        "=type=FWD",
        `=forward-to=${FORWARD_TO}`,
        `=address-list=${PAYMENT_LANE_OK_LIST}`,
        `=comment=${PAYMENT_LANE_COMMENT}`,
      ],
      timeoutMs,
    );
  }

  await removeByComment(client, "/ip/firewall/address-list", timeoutMs);
  for (const address of appAddresses) {
    await client.talk(
      [
        "/ip/firewall/address-list/add",
        `=list=${PAYMENT_LANE_OK_LIST}`,
        `=address=${address}`,
        `=comment=${PAYMENT_LANE_COMMENT}`,
      ],
      timeoutMs,
    );
  }

  // Pare-feu : chaque règle est posée AVANT la première règle forward
  // statique du moment ; en ajoutant reject puis les accept, on obtient
  // [accept walled-garden, accept sondes, reject, …règles existantes].
  await removeByComment(client, "/ip/firewall/filter", timeoutMs);
  const rules: string[][] = [
    ["=action=reject", "=reject-with=icmp-network-unreachable"],
    [`=dst-address-list=${PAYMENT_LANE_OK_LIST}`, "=action=accept"],
    [`=dst-address-list=${walledGardenList}`, "=action=accept"],
  ];
  for (const rule of rules) {
    // « ?dynamic=false » ne matche rien par l'API : filtre côté serveur.
    const rows = await client
      .talk(["/ip/firewall/filter/print", "?chain=forward"], timeoutMs)
      .catch(() => [] as Row[]);
    const first = rows.find((r) => r.dynamic !== "true");
    await client.talk(
      [
        "/ip/firewall/filter/add",
        "=chain=forward",
        `=src-address-list=${PAYMENT_LANE_LIST}`,
        ...rule,
        `=comment=${PAYMENT_LANE_COMMENT}`,
        ...(first?.[".id"] ? [`=place-before=${first[".id"]}`] : []),
      ],
      timeoutMs,
    );
  }
  return "installed";
}

/**
 * Retire uniquement la voie de paiement gérée par SafeLinkHub.
 *
 * Le profil et les règles sont identifiés par des noms/commentaires réservés
 * à ce module. Les règles hotspot, les tickets et le walled-garden général
 * restent donc intacts. Les sessions de paiement ouvertes sont fermées avant
 * la suppression du profil pour éviter de laisser une adresse restreinte.
 */
export async function removePaymentLane(client: RouterOSClient, timeoutMs = 15000): Promise<void> {
  const laneUsers = await client
    .talk(["/ip/hotspot/user/print", `?comment=${PAYMENT_LANE_COMMENT}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const user of laneUsers) {
    if (!user[".id"]) continue;
    const active = await client
      .talk(["/ip/hotspot/active/print", `?user=${user.name ?? ""}`], timeoutMs)
      .catch(() => [] as Row[]);
    for (const session of active) {
      if (session[".id"]) {
        await client.talk(["/ip/hotspot/active/remove", `=numbers=${session[".id"]}`], timeoutMs).catch(() => {});
      }
    }
    await removeLaneCookies(client, user.name ?? "", timeoutMs);
    await client.talk(["/ip/hotspot/user/remove", `=numbers=${user[".id"]}`], timeoutMs).catch(() => {});
  }

  for (const path of [
    "/ip/dns/static",
    "/ip/firewall/address-list",
    "/ip/firewall/filter",
  ] as const) {
    await removeByComment(client, path, timeoutMs);
  }

  // Les entrées de restriction posées au moment d'une ouverture portent un
  // commentaire distinct, car elles ne doivent pas être purgées par une
  // réconciliation normale. Ici, l'utilisateur demande explicitement la
  // désinstallation : on peut les retirer de façon bornée à notre liste.
  const clientEntries = await client
    .talk(["/ip/firewall/address-list/print", `?list=${PAYMENT_LANE_LIST}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const entry of clientEntries) {
    if (entry[".id"] && entry.comment === PAYMENT_LANE_CLIENT_COMMENT) {
      await client.talk(["/ip/firewall/address-list/remove", `=numbers=${entry[".id"]}`], timeoutMs).catch(() => {});
    }
  }

  const profiles = await client
    .talk(["/ip/hotspot/user/profile/print", `?name=${PAYMENT_LANE_PROFILE}`], timeoutMs)
    .catch(() => [] as Row[]);
  for (const profile of profiles) {
    if (profile[".id"]) {
      await client.talk(["/ip/hotspot/user/profile/remove", `=numbers=${profile[".id"]}`], timeoutMs).catch(() => {});
    }
  }
}

/** Le routeur porte-t-il la voie (profil présent) ? */
export async function hasPaymentLane(client: RouterOSClient, timeoutMs = 4000): Promise<boolean> {
  const rows = await client
    .talk(["/ip/hotspot/user/profile/print", `?name=${PAYMENT_LANE_PROFILE}`], timeoutMs)
    .catch(() => [] as Record<string, string>[]);
  return rows.length > 0;
}

/**
 * Ouvre la voie pour un appareil : user `pay-<mac>` (recréé) + login par l'API
 * sur l'IP que le hotspot connaît pour ce MAC. false si le routeur n'a pas la
 * voie ou si l'appareil n'est pas (encore) dans la table des hôtes.
 */
export async function openPaymentLane(
  client: RouterOSClient,
  mac: string,
  timeoutMs = 4000,
): Promise<boolean> {
  if (!(await hasPaymentLane(client, timeoutMs))) return false;
  const user = paymentLaneUser(mac);
  // Idempotent et sans coupure : deux ouvertures peuvent se croiser (page qui
  // prépare Wave + tap). On ne déconnecte JAMAIS une voie déjà active — la
  // couper pendant que Chrome charge Wave faisait échouer le paiement
  // (« already have user… », « IP … already logged in », RUE-NICOLAS 12/10).
  const active = await client
    .talk(["/ip/hotspot/active/print", `?user=${user}`], timeoutMs)
    .catch(() => [] as Row[]);
  if (active.length > 0) {
    // Déjà ouverte : NE PAS couper, mais RE-POSER la restriction par client —
    // RouterOS élague l'entrée dynamique du profil en cours de session, ce qui
    // laissait le client authentifié filer en plein internet (default accept).
    const liveIp = active[0]?.["address"];
    if (liveIp) await ensureLaneAddress(client, liveIp, timeoutMs);
    return true;
  }

  const [existing] = await client
    .talk(["/ip/hotspot/user/print", `?name=${user}`], timeoutMs)
    .catch(() => [] as Row[]);
  if (existing?.[".id"]) {
    // Ré-ouverture : on remet le crédit de 10 min à zéro.
    await client
      .talk(["/ip/hotspot/user/reset-counters", `=numbers=${existing[".id"]}`], timeoutMs)
      .catch(() => {});
  } else {
    await client
      .talk(
        [
          "/ip/hotspot/user/add",
          `=name=${user}`,
          `=password=${user}`,
          `=profile=${PAYMENT_LANE_PROFILE}`,
          // Crédit de 10 min au total : un user abandonné ne rouvre plus rien.
          `=limit-uptime=${PAYMENT_LANE_SESSION}`,
          `=comment=${PAYMENT_LANE_COMMENT}`,
        ],
        timeoutMs,
      )
      .catch((err: unknown) => {
        // Créé entre-temps par une ouverture concurrente : sans gravité.
        if (!/already have user/i.test(err instanceof Error ? err.message : "")) throw err;
      });
  }
  const hosts = await client
    .talk(["/ip/hotspot/host/print", `?mac-address=${mac}`], timeoutMs)
    .catch(() => [] as Row[]);
  const ip = hosts[0]?.["address"];
  if (!ip) return false;
  // Restriction posée AVANT le login : le client ne doit JAMAIS être authentifié
  // (et donc routé par l'accept par défaut) sans être déjà dans la liste de rejet.
  await ensureLaneAddress(client, ip, timeoutMs);
  try {
    await client.talk(
      ["/ip/hotspot/active/login", `=user=${user}`, `=password=${user}`, `=ip=${ip}`, `=mac-address=${mac}`],
      timeoutMs,
    );
  } catch (err) {
    // Déjà connecté (ouverture concurrente) : la voie est ouverte.
    if (!/already logged in/i.test(err instanceof Error ? err.message : "")) throw err;
  }
  // Ceinture : aucun cookie ne doit survivre à la session de paiement.
  await removeLaneCookies(client, user, timeoutMs);
  return true;
}

/** Ferme la voie d'un appareil (session active + user). Silencieuse. */
export async function closePaymentLane(
  client: RouterOSClient,
  mac: string,
  timeoutMs = 4000,
): Promise<void> {
  const user = paymentLaneUser(mac);
  await removeLaneCookies(client, user, timeoutMs);
  // IP du client AVANT de couper la session : pour retirer la restriction par
  // client, sinon un client qui vient de PAYER (ré-authentifié sur le même IP
  // avec son vrai code) resterait bloqué par l'entrée slh-paiement résiduelle.
  const active = await client
    .talk(["/ip/hotspot/active/print", `?user=${user}`], timeoutMs)
    .catch(() => [] as Row[]);
  const ips = new Set<string>();
  if (active[0]?.["address"]) ips.add(active[0]["address"]);
  const hosts = await client
    .talk(["/ip/hotspot/host/print", `?mac-address=${mac}`], timeoutMs)
    .catch(() => [] as Row[]);
  if (hosts[0]?.["address"]) ips.add(hosts[0]["address"]);
  for (const ip of ips) await removeLaneAddress(client, ip, timeoutMs);
  for (const path of ["/ip/hotspot/active", "/ip/hotspot/user"]) {
    const key = path.endsWith("active") ? "user" : "name";
    const rows = await client
      .talk([`${path}/print`, `?${key}=${user}`], timeoutMs)
      .catch(() => [] as Record<string, string>[]);
    for (const row of rows) {
      if (row[".id"]) await client.talk([`${path}/remove`, `=numbers=${row[".id"]}`], timeoutMs).catch(() => {});
    }
  }
}
