import type { RouterOSClient } from "./client";
import { readWifiState } from "./wifi-compat";
import { readRouterboardFirmware, missingApiGroupPolicies, API_GROUP_NAME } from "./router-audit-fixes";

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
  | "rb-firmware"
  | "api-policy"
  | null;

export type AuditFinding = {
  id: string;
  severity: AuditSeverity;
  /** Domaine, pour le regroupement visuel. */
  area: "Débit" | "WiFi" | "Ports" | "MikHmon" | "Réseau" | "Ressources" | "Système";
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
  opts: { timeoutMs?: number; mikhmonConfigured?: boolean } = {},
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
      if (mk.running !== "true")
        add("error", "MikHmon", "mikhmon-stopped", "Conteneur MikHmon arrêté", "MikHmon n'est pas démarré — les vouchers ne sont pas gérés.");

      // Session MikHmon « SafeLinkHub » : les fichiers internes du conteneur ne
      // sont pas énumérables via l'API RouterOS, on s'appuie donc sur le flag
      // routers.mikhmonSessionAt (posé à l'écriture par l'auto-setup / le bouton
      // Reconfigurer), transmis ici.
      if (opts.mikhmonConfigured)
        add("ok", "MikHmon", "mikhmon-session", "Session MikHmon configurée", "La session « SafeLinkHub » a été écrite automatiquement dans le conteneur.");
      else
        add("warn", "MikHmon", "mikhmon-session", "Session MikHmon à configurer", "La session « SafeLinkHub » n'a pas encore été posée par le SaaS — sinon MikHmon demande de la recréer à la main. Le correctif l'écrit automatiquement (session, hotspot, DNS, API).", "mikhmon-session");
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
          "MikHmon : tickets sans expiration & revenu absent (droits API incomplets)",
          `Le compte de service « ${API_GROUP_NAME} », utilisé par le MikHmon hébergé pour piloter le routeur, n'a pas ${missing.map((m) => `« ${m} »`).join(", ")} dans ses permissions API. Sans « policy » notamment, MikHmon ne peut pas poser les schedulers d'expiration des tickets ni écrire/relire le journal de revenu (/system script) — d'où des tickets qui n'expirent jamais et un revenu qui ne s'affiche pas. Le correctif complète les permissions manquantes en un clic (sans coupure : n'affecte que le compte de service SafeLinkHub).`,
          "api-policy",
        );
      else
        add("ok", "MikHmon", "api-policy-ok", "Droits API MikHmon complets", "Le compte de service a les permissions requises pour gérer expiration des tickets et revenu.");
    }
  } catch {
    /* /user/group illisible — on ne conseille rien à tort. */
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
