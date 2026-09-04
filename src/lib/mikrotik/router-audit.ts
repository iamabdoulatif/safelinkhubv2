import type { RouterOSClient } from "./client";
import { inspectExpiryFormats } from "./ticket-expiry-format";
import { superfluousServicesToDisable } from "./router-audit-fixes";
import { inspectProfileOnLogin, inspectSweepSchedulers } from "./expiry-sweep-script";
import { readWifiState } from "./wifi-compat";
import { readRouterboardFirmware, missingApiGroupPolicies, API_GROUP_NAME } from "./router-audit-fixes";
import { inspectApiService, MIKHMON_EXPECTED_API_PORT } from "./api-service-access";
import { inspectPortalTls, portalTlsBroken, portalTlsDetail } from "./portal-tls";
import {
  inspectWalledGarden,
  walledGardenBloquant,
  walledGardenDetail,
  walledGardenIncomplet,
} from "./walled-garden-inspect";
import { inspectMikhmonApiLogins } from "./mikhmon-api-login";
import { resolveMikhmonContainerAddress } from "./mikhmon-tunnel-access";

/**
 * OUTIL D'AUDIT MikroTik — analyse un routeur (souvent mal configuré, importé
 * ou monté à la main) au regard des bonnes pratiques de l'auto-setup SafeLinkHub,
 * puis remonte des CONSTATS (bugs, défauts) et, pour les problèmes réparables
 * en toute sécurité, un CORRECTIF applicable en un clic par l'utilisateur.
 *
 * Tout est LECTURE SEULE ici : l'audit ne modifie rien. Les correctifs sont
 * portés par des server actions dédiées (optimizeRouterWifi, optimizeRouter-
 * Throughput, setRouterBandwidthCap) et déclenchés depuis l'UI après validation.
 */

export type AuditSeverity = "error" | "warn" | "info" | "ok";
/** Correctif automatisable rattaché à un constat (mappé côté UI vers une action). */
export type AuditFixKind =
  | "wifi"
  | "wifi-dfs"
  | "throughput"
  | "cap"
  | "mikhmon"
  | "mikhmon-session"
  | "mikhmon-access"
  | "mikhmon-start"
  | "rb-firmware"
  | "api-policy"
  | "mikhmon-api-access"
  | "ticket-expiry"
  | "expiry-sweep"
  | "services-cleanup"
  | "portal-tls"
  | "walled-garden"
  | null;

export type AuditFinding = {
  id: string;
  severity: AuditSeverity;
  /** Domaine, pour le regroupement visuel. */
  area:
    | "Débit"
    | "WiFi"
    | "Portail"
    | "Ports"
    | "MikHmon"
    | "Réseau"
    | "Ressources"
    | "Services"
    | "Système"
    | "Tickets";
  title: string;
  detail: string;
  /** Correctif applicable en un clic (null = à traiter manuellement / sur site). */
  fix: AuditFixKind;
};

export type RouterAudit = {
  board: string;
  version: string;
  uptime: string;
  cpuLoad: number;
  freeMemMb: number;
  freeHddMb: number;
  /** Santé 0-100 (100 = conforme aux bonnes pratiques). */
  score: number;
  counts: { error: number; warn: number; ok: number };
  findings: AuditFinding[];
};

const num = (v: string | undefined) => Number(v ?? 0) || 0;

export async function auditRouter(
  client: RouterOSClient,
  opts: {
    timeoutMs?: number;
    mikhmonConfigured?: boolean;
    /** Hôtes que le portail doit pouvoir joindre AVANT connexion. Absent =
     *  contrôle sauté (l'appelant seul connaît l'org et ses hôtes décochés). */
    walledGarden?: { l7: string[]; ip: string[]; appHost: string; addresses?: string[] };
  } = {},
): Promise<RouterAudit> {
  const t = opts.timeoutMs ?? 20000;
  const findings: AuditFinding[] = [];
  const add = (
    severity: AuditSeverity,
    area: AuditFinding["area"],
    id: string,
    title: string,
    detail: string,
    fix: AuditFixKind = null,
  ) => findings.push({ id, severity, area, title, detail, fix });

  // ── Système / ressources ────────────────────────────────────────────────
  const res = (await client.talk(["/system/resource/print"], t).catch(() => []))[0] ?? {};
  const board = res["board-name"] ?? "Inconnu";
  const version = res.version ?? "?";
  const uptime = res.uptime ?? "?";
  const cpuLoad = num(res["cpu-load"]);
  const freeMemMb = Math.round(num(res["free-memory"]) / 1048576);
  const totalMemMb = Math.round(num(res["total-memory"]) / 1048576);
  const freeHddMb = Math.round(num(res["free-hdd-space"]) / 1048576);

  if (cpuLoad >= 85)
    add("warn", "Ressources", "cpu-high", "CPU très chargé", `Charge CPU à ${cpuLoad}% — le routeur peine, ce qui bride le débit et la réactivité.`);
  if (totalMemMb > 0 && freeMemMb / Math.max(1, totalMemMb) < 0.1)
    add("warn", "Ressources", "mem-low", "Mémoire presque saturée", `Seulement ${freeMemMb} Mo de RAM libre sur ${totalMemMb} Mo.`);
  if (freeHddMb > 0 && freeHddMb < 5)
    add("warn", "Ressources", "flash-low", "Flash presque pleine", `Seulement ${freeHddMb} Mo libres — un conteneur ou une sauvegarde peut échouer.`);

  // ── Tickets : format de la date d'expiration ────────────────────────────
  // Voir ticket-expiry-format.ts. RouterOS 7.24 rend les dates en ISO ; quand
  // cette forme atterrit telle quelle dans le commentaire d'un ticket, le
  // balayage de son profil ne la reconnaît plus et le ticket ne s'éteint
  // jamais. Lecture seule ici — le correctif est explicite.
  const hotspotUsers = await client
    .talk(["/ip/hotspot/user/print", "=.proplist=.id,name,comment"], t)
    .catch(() => []);
  if (hotspotUsers.length > 0) {
    const formats = inspectExpiryFormats(hotspotUsers as Record<string, string | undefined>[]);
    if (formats.corruptedCount > 0)
      add(
        "error",
        "Tickets",
        "ticket-expiry-corrupted",
        `${formats.corruptedCount} ticket(s) à la date illisible`,
        `Leur date d'expiration ressemble à « jan/02/sep/  21:40:3 » : l'année est un nom de mois. Elle vient d'une DOUBLE conversion — un script « on-login » qui savait déjà lire l'horloge ISO, auquel une seconde conversion a été ajoutée. Le balayage traite ces dates comme valides puis compare une année « sep/ » : le ticket ne s'éteint jamais. Le correctif reconstruit l'échéance à partir de la durée du forfait, comptée depuis maintenant — la vraie est perdue, et couper une session en cours serait pire.`,
        "ticket-expiry",
      );
    if (formats.isoCount > 0)
      add(
        "error",
        "Tickets",
        "ticket-expiry-iso",
        `${formats.isoCount} ticket(s) qui n'expireront jamais`,
        `Leur date d'expiration est écrite au format ISO (« 2026-08-24 20:15:40 ») au lieu du format MikHmon (« aug/24/2026 20:15:40 ») — RouterOS 7.24 a changé la façon de rendre les dates. Le balayage de chaque profil ne reconnaît que le second : ces tickets restent valables indéfiniment. Le correctif réécrit la date, sans rien supprimer.`,
        "ticket-expiry",
      );
    else
      add("ok", "Tickets", "ticket-expiry-format", "Dates d'expiration lisibles", `Les ${formats.mikhmonCount} ticket(s) datés sont au format attendu par le balayage.`);
  }

  // ── Tickets : le balayage sait-il lire l'horloge ? ──────────────────────
  // Voir expiry-sweep-script.ts. Un balayage qui ne convertit pas la date ISO
  // de RouterOS 7.24 calcule un « aujourd'hui » absurde et ne supprime PLUS
  // RIEN — quel que soit le format des commentaires. C'est le défaut le plus
  // grave des deux : il neutralise l'expiration entière.
  const schedulers = await client.talk(["/system/scheduler/print"], t).catch(() => []);
  const sweeps = inspectSweepSchedulers(schedulers as Record<string, string>[]);
  if (sweeps.stale.length > 0)
    add(
      "error",
      "Tickets",
      "expiry-sweep-stale",
      `${sweeps.stale.length} balayage(s) d'expiration hors service`,
      `Le script qui supprime les tickets périmés découpe la date à position fixe (« aug/24/2026 ») et RouterOS 7.24 rend « 2026-08-24 » : la date du jour devient illisible, aucune comparaison n'aboutit et PLUS AUCUN ticket n'expire. Profils touchés : ${sweeps.stale.map((s) => s.profile).join(", ")}. Le correctif réécrit le script en gardant le planificateur, son intervalle et ses droits.`,
      "expiry-sweep",
    );
  else if (sweeps.total > 0)
    add("ok", "Tickets", "expiry-sweep", "Balayage d'expiration à jour", `Les ${sweeps.total} balayage(s) savent lire l'horloge de RouterOS 7.24.`);

  // L'autre moitié : le script qui ÉCRIT la date à la première connexion.
  const profilsHotspot = await client
    .talk(["/ip/hotspot/user/profile/print", "=.proplist=.id,name,on-login"], t)
    .catch(() => []);
  const onLogin = inspectProfileOnLogin(profilsHotspot as Record<string, string>[]);
  if (onLogin.stale.length > 0)
    add(
      "error",
      "Tickets",
      "expiry-onlogin-stale",
      `${onLogin.stale.length} profil(s) qui datent mal les nouveaux tickets`,
      `Leur script de connexion recopie telle quelle la date rendue par RouterOS 7.24 (« 2026-08-25 02:15:40 »), que le balayage ne sait pas lire : chaque nouvelle connexion refabrique un ticket qui n'expirera jamais. Profils touchés : ${onLogin.stale.map((s) => s.name).join(", ")}. Le même correctif y insère la conversion manquante.`,
      "expiry-sweep",
    );

  // ── Services : ce qui écoute pour rien ──────────────────────────────────
  /* Un routeur de hotspot n'a aucune raison d'exposer Telnet, un serveur PPTP
     ou un testeur de débit. Constaté sur HS-DIARA-RB4011 : PPTP et test de
     débit ouverts sur un routeur qui rejoint SafeLinkHub par WireGuard. */
  const servicesIp = (await client
    .talk(["/ip/service/print", "=.proplist=.id,name,disabled,port"], t)
    .catch(() => [])) as Record<string, string>[];
  const actif = (nom: string) => {
    const row = servicesIp.find((r) => r.name === nom);
    return row ? row.disabled !== "true" : undefined;
  };
  const pptp = (await client.talk(["/interface/pptp-server/server/print"], t).catch(() => [])) as Record<string, string>[];
  const btest = (await client.talk(["/tool/bandwidth-server/print"], t).catch(() => [])) as Record<string, string>[];
  const superflus = superfluousServicesToDisable({
    telnet: actif("telnet"),
    pptp: pptp.length ? pptp[0].enabled === "true" || pptp[0].disabled === "false" : undefined,
    "bandwidth-test": btest.length ? btest[0].enabled === "true" : undefined,
  });
  if (superflus.length > 0)
    add(
      "warn",
      "Services",
      "services-superflus",
      `${superflus.length} service(s) ouverts pour rien`,
      `${superflus.map((x) => `${x.label} — ${x.reason}`).join(" ")} Le correctif les éteint. L'API, WinBox, FTP, la console web et SSH ne sont jamais touchés : SafeLinkHub, vos sauvegardes ou votre dépannage en dépendent.`,
      "services-cleanup",
    );
  else
    add("ok", "Services", "services-superflus", "Aucun service superflu", "Ni Telnet, ni serveur PPTP, ni testeur de débit ne tournent sur ce routeur.");

  // ── Portail : servi en clair, jamais derrière un certificat auto-signé ──
  /* Voir portal-tls.ts. Un portail servi en HTTPS avec le certificat du
     routeur fait afficher au mini-navigateur Android « le réseau présente des
     problèmes de sécurité » à la place de la page — le client ne peut plus
     acheter. Constaté sur YAHYA WIFI. */
  const hotspotServers = (await client.talk(["/ip/hotspot/print"], t).catch(() => [])) as Record<string, string>[];
  const hotspotProfiles = (await client
    .talk(["/ip/hotspot/profile/print"], t)
    .catch(() => [])) as Record<string, string>[];
  const portalTls = inspectPortalTls(hotspotServers, hotspotProfiles, servicesIp);
  if (portalTlsBroken(portalTls))
    add(
      "error",
      "Portail",
      "portail-tls",
      "La page de connexion est servie en HTTPS",
      portalTlsDetail(portalTls),
      "portal-tls",
    );
  else if (hotspotServers.length > 0)
    add(
      "ok",
      "Portail",
      "portail-tls",
      "Portail servi en clair",
      "Aucun certificat auto-signé sur la page de connexion : le mini-navigateur des téléphones l'ouvre sans avertissement de sécurité.",
    );

  // ── Portail : les hôtes joignables avant connexion ──────────────────────
  /* Voir walled-garden-inspect.ts. Un client pas encore authentifié ne peut
     joindre que cette liste : si safelinkhub.io n'y est pas, le portail
     affiche « Connexion à safelinkhub.io impossible depuis ce WiFi » et
     PERSONNE ne peut acheter — quel que soit l'état du SMS ou du paiement. */
  if (opts.walledGarden) {
    const [l7Rows, ipRows] = await Promise.all([
      client.talk(["/ip/hotspot/walled-garden/print"], t).catch(() => []),
      client.talk(["/ip/hotspot/walled-garden/ip/print"], t).catch(() => []),
    ]);
    const wg = inspectWalledGarden(
      l7Rows as Record<string, string>[],
      ipRows as Record<string, string>[],
      opts.walledGarden,
    );
    if (walledGardenBloquant(wg))
      add(
        "error",
        "Portail",
        "walled-garden",
        "Le portail ne peut pas joindre SafeLinkHub",
        walledGardenDetail(wg, opts.walledGarden.appHost),
        "walled-garden",
      );
    else if (walledGardenIncomplet(wg))
      add(
        "warn",
        "Portail",
        "walled-garden",
        "Walled-garden incomplet",
        walledGardenDetail(wg, opts.walledGarden.appHost),
        "walled-garden",
      );
    else
      add(
        "ok",
        "Portail",
        "walled-garden",
        "Walled-garden en place",
        `Un client non connecté peut joindre ${opts.walledGarden.appHost} et les hôtes de paiement, en HTTP comme en HTTPS. Ancrage par adresse en place${wg.ancrees.length > 0 ? ` (${wg.ancrees.join(", ")})` : ""}.`,
      );
  }

  // ── Réseau : route par défaut + NAT ─────────────────────────────────────
  const routes = await client
    .talk(["/ip/route/print", "?dst-address=0.0.0.0/0", "?active=yes"], t)
    .catch(() => []);
  if (routes.length === 0)
    add("error", "Réseau", "no-default-route", "Aucune route par défaut active", "Le routeur n'a pas de sortie Internet (WAN down, câble débranché ou DHCP WAN non obtenu).");
  else add("ok", "Réseau", "default-route", "Sortie Internet OK", "Route par défaut active présente.");

  const nat = await client.talk(["/ip/firewall/nat/print"], t).catch(() => []);
  const hasMasq = nat.some((n) => n.action === "masquerade" && n.disabled !== "true");
  if (!hasMasq)
    add("error", "Réseau", "no-nat", "Pas de NAT (masquerade)", "Aucune règle masquerade active — les clients du réseau local n'ont pas d'accès Internet.");

  // ── Réseau : conflit d'adressage (sous-réseaux qui se chevauchent) ──────
  // Deux interfaces dont les plages IPv4 se recouvrent = routage ambigu :
  // typiquement plus d'Internet (WAN livré en 10.x qui recouvre le hotspot
  // 10.0.0.0/8) ou portail injoignable (deux LAN sur la même plage). Détection
  // DÉTERMINISTE depuis /ip/address — pas de log à interpréter. On ignore les
  // /32 (adresses hôtes, ex. la gestion WireGuard) et le loopback 127/8.
  try {
    const addrs = await client.talk(["/ip/address/print"], t).catch(() => []);
    const parseV4 = (s?: string): { ip: number; prefix: number } | null => {
      if (!s) return null;
      const [addr, pfxRaw] = s.split("/");
      const prefix = Number(pfxRaw);
      const parts = (addr ?? "").split(".").map(Number);
      if (
        parts.length !== 4 ||
        parts.some((p) => Number.isNaN(p) || p < 0 || p > 255) ||
        Number.isNaN(prefix) || prefix < 0 || prefix > 32
      )
        return null;
      const ip = (((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3]) >>> 0;
      return { ip, prefix };
    };
    const nets: { label: string; ip: number; prefix: number }[] = [];
    for (const a of addrs) {
      if (a.disabled === "true") continue;
      const p = parseV4(a.address);
      if (!p || p.prefix >= 32 || p.ip === 0 || p.ip >>> 24 === 127) continue;
      nets.push({ label: `${a.address} (${a.interface ?? "?"})`, ip: p.ip, prefix: p.prefix });
    }
    const overlaps: string[] = [];
    for (let i = 0; i < nets.length; i++)
      for (let j = i + 1; j < nets.length; j++) {
        const minPfx = Math.min(nets[i].prefix, nets[j].prefix);
        const mask = minPfx === 0 ? 0 : (0xffffffff << (32 - minPfx)) >>> 0;
        if (((nets[i].ip & mask) >>> 0) === ((nets[j].ip & mask) >>> 0))
          overlaps.push(`${nets[i].label} ↔ ${nets[j].label}`);
      }
    if (overlaps.length > 0)
      add(
        "error",
        "Réseau",
        "ip-overlap",
        "Conflit d'adressage (sous-réseaux qui se chevauchent)",
        `Des interfaces partagent la même plage d'adresses : ${overlaps.join(" ; ")}. Le routage devient ambigu — typiquement plus d'accès Internet (le WAN est livré dans la même plage que le LAN hotspot) ou portail captif injoignable. À corriger sur site : réattribuer un sous-réseau distinct à l'interface en conflit (le hotspot SafeLinkHub utilise 10.0.0.0/8, évitez tout WAN/LAN en 10.x).`,
      );
    else if (nets.length >= 2)
      add("ok", "Réseau", "ip-no-overlap", "Adressage sans conflit", "Aucun chevauchement de plages IP entre les interfaces.");
  } catch {
    /* /ip/address illisible — on n'ajoute pas de constat trompeur. */
  }

  // ── Débit : fasttrack + layer7 ──────────────────────────────────────────
  const filters = await client.talk(["/ip/firewall/filter/print"], t).catch(() => []);
  const hasFasttrack = filters.some((f) => f.action === "fasttrack-connection" && f.disabled !== "true");
  const activeL7 = filters.filter(
    (f) => f.chain === "forward" && f.action === "drop" && f["layer7-protocol"] && f.disabled !== "true",
  );
  if (!hasFasttrack)
    add("warn", "Débit", "no-fasttrack", "Fasttrack absent", "Sans fasttrack, tout le trafic passe par le CPU (connexion suivie + firewall complet) — débit routé bridé.", "throughput");
  else add("ok", "Débit", "fasttrack", "Fasttrack actif", "Les connexions établies sont accélérées (débit routé optimal).");
  if (activeL7.length > 0)
    add("warn", "Débit", "layer7", "Règle layer7 active (tueur de débit)", `${activeL7.length} règle(s) layer7 inspectent chaque connexion — coûteux en CPU et bride le débit.`, "throughput");

  // ── WiFi : unification du SSID (band steering) ──────────────────────────
  // On note au passage si le routeur diffuse LUI-MÊME le WiFi des clients. Si
  // non, les clients passent par des points d'accès externes — d'où le conseil
  // « mode pont » juste après (piège n°1 quand le portail ne s'affiche pas).
  let routerServesClientWifi = false;
  try {
    const wifi = await readWifiState(client, t);
    if (wifi.api === "none" || wifi.radios.length === 0) {
      add("info", "WiFi", "no-wifi", "Pas de radio WiFi", "Ce modèle n'a pas de WiFi (ou aucune radio détectée) — normal pour un routeur filaire.");
    } else {
      const named = wifi.radios.filter((r) => r.ssid && r.ssid.trim());
      const uniqueSsids = new Set(named.map((r) => r.ssid!.trim()));
      if (wifi.radios.length >= 2 && uniqueSsids.size > 1)
        add("warn", "WiFi", "ssid-split", "SSID non unifié (pas de band steering)", `Les bandes 2,4 et 5 GHz portent des noms différents (${[...uniqueSsids].join(", ")}) — les appareils ne basculent pas seuls sur la 5 GHz rapide.`, "wifi");
      else if (named.length > 0)
        add("ok", "WiFi", "ssid-ok", "WiFi unifié", "Un seul nom de réseau sur les bandes — les appareils prennent la bande la plus rapide.");
      // Une radio « sert » les clients seulement si elle est ACTIVE **et** porte
      // un SSID : une radio allumée mais sans nom de réseau ne diffuse rien.
      const serving = wifi.radios.filter((r) => !r.disabled && r.ssid && r.ssid.trim());
      routerServesClientWifi = serving.length > 0;
      // DFS : une radio 5 GHz sans pays réglementaire est poussée sur des canaux
      // DFS et reste coincée en « Channel Availability Check » (cas HSPT-ROXY).
      // Correctif injectable dédié (fix "wifi-dfs" → fixRouterWifiDfs).
      if (wifi.api === "wifi" && wifi.radios.some((r) => r.band5ghz && !r.country))
        add(
          "warn",
          "WiFi",
          "wifi-dfs",
          "Radio 5 GHz sans pays → blocage DFS possible",
          "Une radio 5 GHz n'a pas de pays réglementaire (Country) configuré. La réglementation par défaut ne propose alors souvent que des canaux DFS, sur lesquels la radio reste bloquée en « channel availability check » (~1 min, relancé à chaque détection radar) : le WiFi ne se diffuse pas, ou par intermittence (cas constaté sur HSPT-ROXY). Correction depuis le SaaS : le bouton « Corriger le canal WiFi (DFS) » pose un pays et force un canal non-DFS (skip-dfs). Correction sur site (Winbox → WiFi → onglet Channel/Configuration) : définir le pays et fixer un canal non-DFS (ex. 5180 ou 5745) ou activer « Skip DFS Channels ».",
          "wifi-dfs",
        );

      if (wifi.radios.every((r) => r.disabled)) {
        add("warn", "WiFi", "wifi-off", "Toutes les radios WiFi désactivées", "Aucun réseau WiFi n'est diffusé.");
      } else if (serving.length === 0 && wifi.radios.some((r) => !r.disabled && !(r.ssid && r.ssid.trim()))) {
        // Bug « ROXY-WIFI » : radio allumée mais MUETTE (aucun SSID) → panne
        // silencieuse. Pas de correctif un-clic (optimizeRouterWifi suppose un
        // SSID existant) : on documente les deux vraies corrections en contenu.
        add(
          "warn",
          "WiFi",
          "wifi-no-ssid",
          "Radio WiFi active mais muette (aucun SSID)",
          "La radio WiFi du routeur est allumée mais AUCUN nom de réseau (SSID) n'y est configuré : elle ne diffuse donc aucun WiFi, tout en apparaissant « activée » — panne silencieuse (cas constaté sur HSPT-ROXY : radio 5 GHz active, sans SSID, 0 client). Les clients ne voient jamais le réseau du routeur et dépendent d'un point d'accès externe. Correction depuis le SaaS : « Reconfigurer » le routeur (auto-setup) en renseignant un nom de réseau (SSID) — l'auto-setup pose le SSID sur la radio et l'active. Correction sur site (Winbox/WebFig → WiFi) : définir un SSID + une sécurité WPA2 sur la radio, puis la rattacher au bridge HOTSPOT.",
        );
      }
    }
  } catch {
    // WiFi indéterminable — on ne conseille rien à tort (on n'affiche pas le
    // conseil « mode pont » ci-dessous sur une lecture WiFi ratée).
    routerServesClientWifi = true;
  }

  // ── Réseau : portail servi par une box tierce (mode routeur au lieu de pont) ─
  // Quand le routeur ne diffuse pas lui-même le WiFi des clients, ceux-ci passent
  // par des points d'accès externes. Le piège n°1 : un de ces boîtiers est en
  // mode ROUTEUR (avec son PROPRE DHCP et son PROPRE portail) au lieu de PONT →
  // le client n'atteint jamais le hotspot du MikroTik et voit un portail cassé à
  // une adresse HORS hotspot (ex. 192.168.x.x/captiveXX.html injoignable, sur le
  // réseau amont). Ce SSID pirate est diffusé sur l'air par un appareil tiers,
  // donc INDÉTECTABLE depuis l'API du routeur : on le remonte en CONSEIL ciblé
  // (info, sans impact sur le score) plutôt qu'en faux constat automatique.
  if (!routerServesClientWifi)
    add(
      "info",
      "Réseau",
      "foreign-ap-portal",
      "AP externes : vérifier le mode pont si le portail ne s'affiche pas",
      "Les clients de ce site passent par des points d'accès WiFi externes (le routeur ne diffuse pas lui-même leur réseau). Si le portail captif ne s'affiche pas sur un téléphone — typiquement une page qui tente d'ouvrir une adresse hors hotspot injoignable (ex. 192.168.x.x/captiveXX.html) — c'est presque toujours qu'un de ces boîtiers WiFi est en mode ROUTEUR, avec son propre serveur DHCP et son propre portail, au lieu de relayer vers le hotspot. Correctif (sur site, sur le boîtier tiers — pas sur le MikroTik) : le passer en mode PONT / point d'accès (désactiver son DHCP et son portail) pour qu'il relaie les clients vers le hotspot du MikroTik, ou le débrancher.",
    );

  // ── Ports ethernet : négociation à 100 Mbps (goulot physique) ───────────
  try {
    const eth = await client.talk(["/interface/ethernet/print"], t).catch(() => []);
    const slow: string[] = [];
    for (const e of eth) {
      if (!e.name || e.disabled === "true") continue;
      const mon =
        (await client.talk(["/interface/ethernet/monitor", `=numbers=${e.name}`, "=once"], 8000).catch(() => []))[0] ?? {};
      if (mon.status === "link-ok" && /100Mbps/.test(mon.rate ?? "")) slow.push(e.name);
    }
    if (slow.length > 0)
      add("warn", "Ports", "eth-100m", "Port(s) à 100 Mbps (goulot physique)", `${slow.join(", ")} négocie(nt) à 100 Mbps au lieu de 1 Gbps — plafonne le débit sur ce segment. À corriger sur site : câble Cat5e/Cat6 + appareil gigabit.`);
  } catch {
    /* ignore */
  }

  // ── MikHmon : conteneur en RAM (session perdue au reboot) ───────────────
  try {
    const conts = await client.talk(["/container/print"], t).catch(() => []);
    const mk = conts.find(
      (c) => /mikhmon/i.test(String(c.name ?? "")) || /mikhmon/i.test(String(c["root-dir"] ?? "")),
    );
    if (mk) {
      const rootDir = String(mk["root-dir"] ?? "");
      if (/^\/?tmp\//.test(rootDir))
        add("warn", "MikHmon", "mikhmon-tmpfs", "MikHmon en RAM (tmpfs)", "Le conteneur MikHmon est en mémoire vive : sa session est perdue à chaque coupure de courant. Le correctif le déplace sur la flash (persistant, ~1 à 3 min).", "mikhmon");
      else add("ok", "MikHmon", "mikhmon-persist", "MikHmon persistant", "Le conteneur MikHmon survit aux reboots.");
      // RouterOS ≤7.22 rapporte « status » ; 7.23+ l'a remplacé par le booléen
      // « running ». Ne tester que « running » faisait passer pour ARRÊTÉ le
      // conteneur de tout routeur en 7.19-7.22 — un faux positif qui envoie
      // chercher une panne inexistante. container-setup.ts gérait déjà les deux
      // conventions ; l'audit, non.
      const containerStatus = String(
        mk.status ?? (mk.running === "true" ? "running" : mk.running === "false" ? "stopped" : ""),
      ).toLowerCase();
      if (!containerStatus)
        add("warn", "MikHmon", "mikhmon-status", "État du conteneur MikHmon inconnu", "RouterOS n'a rapporté ni « status » ni « running » pour ce conteneur — impossible de dire s'il tourne.");
      else if (containerStatus !== "running")
        add("error", "MikHmon", "mikhmon-stopped", "Conteneur MikHmon arrêté", `MikHmon n'est pas démarré (statut rapporté : « ${containerStatus} ») — les vouchers ne sont pas gérés et l'accès distant MikHmon ne peut pas aboutir. Le correctif le démarre.`, "mikhmon-start");
      else
        add("ok", "MikHmon", "mikhmon-running", "Conteneur MikHmon démarré", `Le conteneur tourne (statut « ${containerStatus} »).`);

      // Session MikHmon « SafeLinkHub » : les fichiers internes du conteneur ne
      // sont pas énumérables via l'API RouterOS, on s'appuie donc sur le flag
      // routers.mikhmonSessionAt (posé à l'écriture par l'auto-setup / le bouton
      // Reconfigurer), transmis ici.
      // ── Accès distant : la règle vise-t-elle le BON conteneur ? ────────
      // Le dst-nat a longtemps visé 11.11.11.11 EN DUR — l'adresse de la veth
      // que SafeLinkHub crée lui-même. Un MikHmon installé autrement (à la
      // main, par un prestataire) vit sur une autre veth : la règle envoie
      // alors le trafic là où personne n'écoute, et le lien d'accès distant
      // expire sans un mot. On compare donc les deux, au lieu de supposer.
      const vethName = String(mk.interface ?? "").trim();
      const veths = vethName
        ? await client.talk(["/interface/veth/print", `?name=${vethName}`], t).catch(() => [])
        : [];
      const containerIp = String(veths[0]?.address ?? "").split("/")[0].trim();
      const nats = await client
        .talk(
          ["/ip/firewall/nat/print", "?chain=dstnat", "?action=dst-nat", "?comment=MikHmon via tunnel"],
          t,
        )
        .catch(() => []);
      const natTarget = String(nats[0]?.["to-addresses"] ?? "");
      if (!containerIp)
        add("warn", "MikHmon", "mikhmon-veth", "Adresse du conteneur illisible", `Le conteneur « ${mk.name ?? "?"} » n'expose pas d'interface veth lisible (${vethName || "aucune"}) : impossible de vérifier que l'accès distant pointe au bon endroit.`);
      else if (nats.length === 0)
        add("error", "MikHmon", "mikhmon-access", "Accès distant MikHmon non configuré", `Aucune règle « MikHmon via tunnel » sur ce routeur, alors que le conteneur écoute sur ${containerIp}. Le correctif pose la règle.`, "mikhmon-access");
      else if (natTarget !== containerIp)
        add("error", "MikHmon", "mikhmon-access", "Accès distant dirigé au mauvais endroit", `La règle envoie le trafic vers ${natTarget || "une adresse inconnue"}, alors que le conteneur MikHmon écoute sur ${containerIp} — c'est pourquoi le lien d'accès distant expire. Le correctif redirige la règle vers le bon conteneur.`, "mikhmon-access");
      else
        add("ok", "MikHmon", "mikhmon-access", "Accès distant MikHmon correct", `La règle vise bien le conteneur (${containerIp}).`);

      if (opts.mikhmonConfigured)
        add("ok", "MikHmon", "mikhmon-session", "Session MikHmon configurée", "La session « SafeLinkHub » a été écrite automatiquement dans le conteneur.");
      else
        add("warn", "MikHmon", "mikhmon-session", "Session MikHmon à configurer", "La session « SafeLinkHub » n'a pas encore été posée par le SaaS — sinon MikHmon demande de la recréer à la main. Le correctif l'écrit automatiquement (session, hotspot, DNS, API).", "mikhmon-session");
    } else {
      // Sans ce constat, un routeur qui porte un conteneur MikHmon non reconnu
      // (nom inhabituel) ne produisait AUCUNE ligne d'audit : l'écran laissait
      // croire que tout allait bien pendant que l'accès distant expirait.
      const names = conts.map((c) => String(c.name ?? c["root-dir"] ?? "?")).filter(Boolean);
      if (names.length > 0)
        add("warn", "MikHmon", "mikhmon-absent", "Aucun conteneur reconnu comme MikHmon", `Ce routeur porte ${names.length} conteneur(s) — ${names.join(", ")} — mais aucun dont le nom, le dossier ou l'étiquette ne mentionne « mikhmon ». L'accès distant MikHmon ne peut donc pas être dirigé automatiquement.`);
    }
  } catch {
    /* container package absent — pas un défaut */
  }

  // ── Système : firmware RouterBOARD périmé ───────────────────────────────
  // RouterOS et le firmware du RouterBOARD (bootloader) se mettent à jour
  // SÉPARÉMENT : après une montée de RouterOS, il faut encore /system/router-
  // board/upgrade + reboot, très souvent oublié → firmware décalé. Détection
  // déterministe (current-firmware ≠ upgrade-firmware). Correctif stagé, sans
  // coupure immédiate (fix "rb-firmware" → upgradeRouterFirmware).
  try {
    const fw = await readRouterboardFirmware(client, t);
    if (fw.pending)
      add(
        "warn",
        "Système",
        "rb-firmware",
        "Firmware RouterBOARD périmé",
        `Le firmware du RouterBOARD est resté en ${fw.current} alors que le RouterOS installé embarque ${fw.target}. Le paquet RouterOS et le firmware du bootloader se mettent à jour séparément : après une montée de RouterOS, le firmware reste en arrière tant qu'on ne lance pas /system/routerboard/upgrade puis un reboot — d'où un décalage fréquent. Le correctif le met à niveau en un clic ; il est STAGÉ et ne s'applique qu'au prochain redémarrage (à planifier hors-pointe), sans coupure immédiate des clients.`,
        "rb-firmware",
      );
    else if (fw.routerboard)
      add("ok", "Système", "rb-firmware-ok", "Firmware RouterBOARD à jour", `Le firmware du RouterBOARD est aligné sur le RouterOS (${fw.current}).`);
  } catch {
    /* /system/routerboard illisible (ex. CHR) — pas un défaut. */
  }

  // ── MikHmon : droits API du compte de service (expiration + revenu) ──────
  // Le MikHmon hébergé se connecte au routeur AVEC le compte safelinkhub-api
  // (groupe safelinkhub-group). Si ce groupe n'a pas « policy » (routeurs
  // provisionnés avant correctif), MikHmon ne peut ni poser les schedulers
  // d'expiration des tickets ni écrire/relire le journal de revenu → tickets
  // qui n'expirent pas + revenu absent. Détection déterministe sur le champ
  // policy du groupe ; correctif idempotent (fix "api-policy").
  try {
    const groups = await client.talk(["/user/group/print", `?name=${API_GROUP_NAME}`], t).catch(() => []);
    const grp = groups[0];
    if (grp) {
      const missing = missingApiGroupPolicies(grp.policy);
      if (missing.length > 0)
        add(
          "warn",
          "MikHmon",
          "api-policy",
          "Droits API du compte de service incomplets",
          `Le compte de service « ${API_GROUP_NAME} », utilisé par le MikHmon hébergé pour piloter le routeur, n'a pas ${missing.map((m) => `« ${m} »`).join(", ")} dans ses permissions API — l'installation VPN les accorde toutes, ce routeur a donc été provisionné avant le correctif. Le correctif complète les permissions manquantes en un clic, sans coupure (n'affecte que le compte de service). NOTE : contrairement à ce que ce contrôle affirmait, l'absence de « policy » n'empêche À ELLE SEULE ni l'expiration des tickets ni l'écriture du revenu — vérifié sur HSPT-FOUANGA le 2026-09-04, où ce compte pouvait créer scripts et planificateurs malgré « !policy ». Si les tickets n'expirent pas, regarder d'abord les deux contrôles ci-dessus (format des dates, balayage).`,
          "api-policy",
        );
      else
        add("ok", "MikHmon", "api-policy-ok", "Droits API MikHmon complets", "Le compte de service a toutes les permissions accordées par l'installation VPN.");
    }
  } catch {
    /* /user/group illisible — on ne conseille rien à tort. */
  }

  // ── MikHmon : l'API accepte-t-elle le conteneur ? ────────────────────────
  // Le défaut qui donne « MikroTik Not Connected » dans MikHmon pendant que
  // TOUT le reste va bien — voir api-service-access.ts. Le piège : SafeLinkHub
  // arrive par le tunnel, toujours autorisé, donc rien d'autre ne bronche.
  try {
    const containerIp = await resolveMikhmonContainerAddress(client);
    const rows = (await client
      .talk(["/ip/service/print", "?name=api"], t)
      .catch(() => [])) as Record<string, string>[];
    const api = inspectApiService(rows[0], containerIp);
    if (api) {
      if (api.disabled)
        add(
          "error",
          "MikHmon",
          "mikhmon-api-access",
          "Le service API du routeur est éteint",
          `Sans le service API, ni le MikHmon hébergé ni SafeLinkHub ne peuvent gérer les tickets. Le correctif le rallume et autorise le conteneur (${containerIp}).`,
          "mikhmon-api-access",
        );
      else if (!api.reachableFromContainer)
        add(
          "error",
          "MikHmon",
          "mikhmon-api-access",
          "MikHmon ne peut pas joindre l'API du routeur (interface de tickets vide)",
          `Le service API n'accepte que ${api.entries.join(", ")} — le conteneur MikHmon (${containerIp}) n'y est pas, RouterOS refuse donc sa connexion : MikHmon affiche « MikroTik Not Connected » et la page des tickets reste vide. Rien d'autre ne le montre, parce que SafeLinkHub, lui, arrive par le tunnel, qui est bien dans la liste. Le correctif AJOUTE ${containerIp}/32 à la liste sans rien en retirer.`,
          "mikhmon-api-access",
        );
      else if (api.portMismatch)
        add(
          "warn",
          "MikHmon",
          "mikhmon-api-access-port",
          `API déplacée sur le port ${api.port} — MikHmon ne sait pas l'y suivre`,
          `Le MikHmon hébergé interroge toujours le port ${MIKHMON_EXPECTED_API_PORT} et n'a pas de réglage pour en changer : tant que l'API écoute ailleurs, son interface de tickets restera vide. À remettre sur ${MIKHMON_EXPECTED_API_PORT} depuis WinBox — ce n'est pas automatisé ici, déplacer le port couperait la connexion SafeLinkHub en cours.`,
          null,
        );
      else
        add(
          "ok",
          "MikHmon",
          "mikhmon-api-access-ok",
          "MikHmon joint l'API du routeur",
          `Le conteneur (${containerIp}) est autorisé sur le service API${api.restricted ? ` (${api.entries.join(", ")})` : " (aucune restriction de source)"}.`,
        );
    }
  } catch {
    /* /ip/service illisible — on ne conseille rien à tort. */
  }

  // ── MikHmon : le routeur accepte-t-il ses identifiants ? ────────────────
  // Le constat le plus direct qui soit : le routeur JOURNALISE le rejet. Une
  // session saisie à la main (ou par un ancien chemin d'installation) garde un
  // mot de passe que plus rien ne resynchronise avec celui de l'app — et rien
  // d'autre ne le montre. Voir mikhmon-api-login.ts.
  try {
    const containerIp = await resolveMikhmonContainerAddress(client);
    const journal = (await client
      .talk(["/log/print", "=.proplist=time,message"], t)
      .catch(() => [])) as Record<string, string>[];
    const verdict = inspectMikhmonApiLogins(journal, containerIp);
    if (verdict.state === "rejected")
      add(
        "error",
        "MikHmon",
        "mikhmon-credentials",
        "Le routeur REFUSE les identifiants de MikHmon (interface de tickets vide)",
        `Le journal du routeur est formel : « login failure for user ${verdict.user} from ${containerIp} via api » (${verdict.failures} tentative(s), la dernière à ${verdict.at}). Le conteneur atteint bien l'API — c'est le mot de passe qu'il détient qui est périmé, alors que celui de SafeLinkHub fonctionne. Cela arrive quand la session MikHmon a été saisie à la main : plus rien ne les resynchronise. Le correctif réécrit la session du conteneur avec les identifiants de l'app, puis le redémarre.`,
        "mikhmon-session",
      );
    else if (verdict.state === "ok")
      add(
        "ok",
        "MikHmon",
        "mikhmon-credentials-ok",
        "MikHmon est authentifié sur le routeur",
        `Dernière connexion API acceptée depuis le conteneur (${containerIp}) à ${verdict.at}, compte ${verdict.user}.`,
      );
  } catch {
    /* Journal illisible — on ne conseille rien à tort. */
  }

  // ── Score de santé ──────────────────────────────────────────────────────
  const counts = {
    error: findings.filter((f) => f.severity === "error").length,
    warn: findings.filter((f) => f.severity === "warn").length,
    ok: findings.filter((f) => f.severity === "ok").length,
  };
  const score = Math.max(0, Math.min(100, 100 - counts.error * 25 - counts.warn * 10));

  // Ordre d'affichage : error d'abord, puis warn, puis ok/info.
  const rank: Record<AuditSeverity, number> = { error: 0, warn: 1, info: 2, ok: 3 };
  findings.sort((a, b) => rank[a.severity] - rank[b.severity]);

  return { board, version, uptime, cpuLoad, freeMemMb, freeHddMb, score, counts, findings };
}
