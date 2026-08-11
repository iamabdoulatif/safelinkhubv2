import { gzipSync, gunzipSync } from "zlib";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, captiveTemplates, routerBackups, routers } from "@/lib/db/schema";
import { connectToRouter } from "./router-sync";
import type { RouterOSClient } from "./client";
import { ensureMacAutoLogin } from "./hotspot-login-mode";
import { applySsid, primarySsid, readWifiState, type WifiApi } from "./wifi-compat";
import { parseExpiryComment, wallToDate } from "@/lib/vouchers/reconcile";
import {
  applyIdentity,
  buildRestorePlan,
  scanRouterHardware,
  type HardwareScan,
  type RestorePlan,
} from "./router-preflight";

/**
 * Sauvegarde d'un MikroTik lue via l'API RouterOS.
 *
 * Pourquoi un snapshot structuré et pas `/export` ou `/system backup save` :
 * `/export` ne renvoie RIEN via l'API (il n'existe qu'en CLI), et
 * `/export file=` comme `/system backup save` exigent la permission `ftp`, que
 * le compte API `safelinkhub-api` n'a délibérément pas. Un snapshot lu section
 * par section fonctionne avec les droits actuels (read + sensitive), et
 * présente un avantage décisif : il est restaurable SÉLECTIVEMENT et entre
 * modèles différents, là où un backup binaire est verrouillé au modèle.
 *
 * Ce qui a réellement de la valeur ici, ce sont les TICKETS déjà vendus : ils
 * n'existent que sur le routeur. Si le boîtier meurt, les clients qui ont payé
 * perdent leur accès. Le reste (bridge, IP, NAT) est reconstruit par
 * l'auto-setup, qui sait le faire correctement pour chaque modèle.
 */
export const BACKUP_VERSION = 1 as const;

/**
 * Retenues par routeur ; au-delà, les plus anciennes sont purgées automatiquement
 * après chaque capture (pruneOldBackups). Fixé à 2 : on ne garde que la dernière
 * bonne sauvegarde + la précédente comme filet de sécurité.
 */
export const BACKUP_RETENTION = 2;

export type BackupSection = Record<string, string>[];

export type BackupSnapshot = {
  version: typeof BACKUP_VERSION;
  capturedAt: string;
  router: {
    name: string;
    model: string | null;
    rosVersion: string | null;
    serialNumber: string | null;
    identity: string | null;
  };
  sections: Record<string, BackupSection>;
  /**
   * Identité de la zone WiFi, capturée sous une forme NEUTRE (voir
   * wifi-compat) : le SSID et le nom DNS du portail sont ce que les clients
   * connaissent. Un rechange d'un autre modèle ne peut pas rejouer la config
   * radio brute — il peut en revanche reprendre cette identité.
   */
  identity?: {
    /** API WiFi de la SOURCE — indicatif ; la cible est détectée à la restauration. */
    wifiApi: WifiApi;
    ssid: string | null;
    /** dns-name du profil hotspot actif (l'URL du portail, ex. "yahya.ci"). */
    hotspotDnsName: string | null;
    hotspotServerName: string | null;
  };
  /**
   * Le portail captif LUI-MÊME n'est pas sauvegardable : ses fichiers vivent sur
   * la flash du routeur, et un rechange les recevrait vides. On mémorise donc
   * QUEL modèle était installé — la restauration le réinstalle depuis le SaaS,
   * ce qui repose les fichiers, le html-directory et le walled-garden. Sans ça,
   * le rechange servirait la page de connexion RouterOS par défaut.
   */
  portal?: {
    htmlDirectory: string | null;
    templateId: string | null;
    templateName: string | null;
  };
  /** Sections illisibles au moment de la capture — voir readSection. */
  warnings: string[];
};

/**
 * Sections lues. `restorable: true` = rejouée par restoreBackupToRouter ; les
 * autres sont capturées pour l'audit et la reconstruction manuelle (NAT/filter
 * référencent des interfaces propres au modèle, les rejouer à l'aveugle sur un
 * rechange d'un autre modèle produirait une config incohérente).
 */
const SECTIONS: {
  key: string;
  cmd: string;
  restorable?: boolean;
  proplist?: string[];
  /** Mots `?...` de filtrage RouterOS, appliqués côté routeur (voir mikhmonSales). */
  query?: string[];
}[] = [
  // Le trésor : codes vendus, mots de passe, profil, et surtout le commentaire
  // (MikHmon y écrit la date d'expiration absolue — voir restoreHotspotUsers).
  //
  // proplist : sur un RB951 (mono-cœur 128 Mo), lire les ~5 000 tickets en
  // renvoyant TOUS les champs fait grimper le CPU à 100 % — mesuré — et le
  // portail des clients connectés en pâtit. Les champs coûteux (bytes-in/out,
  // packets-*, uptime) sont des compteurs en LECTURE SEULE : impossibles à
  // réinjecter, donc inutiles ici. Les demander en moins réduit la lecture de
  // 41 % en octets et 37 % en durée. `dynamic` et `default` restent
  // indispensables : ils pilotent le filtrage (voir isDynamic /
  // restoreHotspotUsers), et les omettre ferait silencieusement sauvegarder
  // des entrées éphémères.
  {
    key: "hotspotUsers",
    cmd: "/ip/hotspot/user/print",
    restorable: true,
    proplist: [
      ".id",
      "name",
      "password",
      "profile",
      "server",
      "comment",
      "disabled",
      "dynamic",
      "default",
      "limit-uptime",
      "limit-bytes-total",
      "email",
      "address",
      "mac-address",
      "routes",
    ],
  },
  { key: "hotspotUserProfiles", cmd: "/ip/hotspot/user/profile/print", restorable: true },
  // Les sessions actives ne sont pas réinjectables telles quelles (RouterOS les
  // expose en lecture seule). Elles permettent toutefois de recréer, sur le
  // rechange, un accès MAC TEMPORAIRE borné par l'expiration déjà inscrite sur
  // le ticket — voir restoreActiveSessionHandover.
  {
    key: "hotspotActive",
    cmd: "/ip/hotspot/active/print",
    proplist: ["user", "mac-address", "server", "session-time-left", "login-by"],
  },
  { key: "walledGarden", cmd: "/ip/hotspot/walled-garden/print", restorable: true },
  { key: "walledGardenIp", cmd: "/ip/hotspot/walled-garden/ip/print", restorable: true },
  /**
   * Le journal de ventes de MikHmon. Il n'a rien d'un « script » malgré la
   * table où il vit : à chaque première connexion d'un voucher, l'on-login du
   * profil écrit une ligne `/system script` dont le NOM porte toute la vente —
   * `date-|-heure-|-code-|-prix-|-ip-|-mac-|-durée-|-profil-|-expiration` — et
   * dont `owner` porte le mois ("jul2026"). Les rapports de MikHmon (recettes du
   * jour, du mois) ne lisent QUE ça. Sans cette section, le rechange démarre à
   * 0 F de recettes alors que les tickets, eux, ont bien été repris.
   *
   * `?comment=mikhmon` filtre CÔTÉ ROUTEUR : la table contient aussi les scripts
   * de l'auto-setup (export-all…), qu'il ne faut ni sauvegarder ni rejouer.
   */
  {
    key: "mikhmonSales",
    cmd: "/system/script/print",
    restorable: true,
    query: ["?comment=mikhmon"],
    // `source` porte juste la date, `policy` les droits : le reste (run-count,
    // last-started) est un compteur en lecture seule, impossible à réinjecter.
    proplist: [".id", "name", "owner", "source", "comment", "policy"],
  },
  // Capturées pour référence uniquement.
  { key: "hotspotServers", cmd: "/ip/hotspot/print" },
  { key: "hotspotServerProfiles", cmd: "/ip/hotspot/profile/print" },
  // Sert au scan de pré-vol à comparer le nombre de prises de l'ancien et du
  // rechange (voir buildRestorePlan) — pas rejoué, les noms sont propres au modèle.
  { key: "ethernet", cmd: "/interface/ethernet/print" },
  { key: "natRules", cmd: "/ip/firewall/nat/print" },
  { key: "filterRules", cmd: "/ip/firewall/filter/print" },
  { key: "ipAddresses", cmd: "/ip/address/print" },
  { key: "ipPools", cmd: "/ip/pool/print" },
  { key: "bridges", cmd: "/interface/bridge/print" },
  { key: "bridgePorts", cmd: "/interface/bridge/port/print" },
  { key: "dhcpServers", cmd: "/ip/dhcp-server/print" },
  { key: "dhcpNetworks", cmd: "/ip/dhcp-server/network/print" },
  { key: "queues", cmd: "/queue/simple/print" },
  /**
   * Restaurée SÉLECTIVEMENT (voir restoreMikhmonSchedulers) : seuls les
   * balayages d'expiration MikHmon en sortent. Les autres jobs (MIKHMON_BOOT,
   * CLEAN_JOB) appartiennent à l'auto-setup, qui les repose lui-même.
   */
  { key: "schedulers", cmd: "/system/scheduler/print", restorable: true },
];

/**
 * Les règles dynamiques sont recréées par RouterOS lui-même (walled-garden
 * résolu en IP, règles hotspot…). Les rejouer créerait des doublons statiques
 * qui ne disparaîtraient jamais ; les capturer gonfle le payload pour rien.
 */
function isDynamic(row: Record<string, string>): boolean {
  return row.dynamic === "true";
}

/**
 * Une section illisible ne fait pas échouer la sauvegarde — le jour où le
 * routeur meurt, un snapshot partiel vaut infiniment mieux que rien. Mais elle
 * doit le DIRE : un `catch(() => [])` muet rendait "0 scheduler" indiscernable
 * de "aucun scheduler", et une section vide par erreur ne se voit jamais.
 */
async function readSection(
  client: RouterOSClient,
  cmd: string,
  proplist?: string[],
  query?: string[],
): Promise<{ rows: BackupSection; error?: string }> {
  try {
    const words = [cmd];
    if (proplist) words.push(`=.proplist=${proplist.join(",")}`);
    if (query) words.push(...query);
    const rows = await client.talk(words, 45000);
    return { rows: rows.filter((r) => !isDynamic(r)) };
  } catch (err) {
    return { rows: [], error: err instanceof Error ? err.message : "lecture impossible" };
  }
}

/**
 * Respiration entre deux sections. La capture d'un gros hotspot fait grimper le
 * CPU d'un RB951 à ~100 % ; sans pause, les lectures s'enchaînent et le hotspot
 * n'a aucun créneau pour servir le portail des clients déjà connectés. C'est
 * peu cher payé : ~4 s ajoutées sur une capture nocturne.
 */
const SECTION_PAUSE_MS = 250;
const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Lit tout le routeur et enregistre la sauvegarde. Ne jette pas sur une section
 * illisible : une sauvegarde partielle vaut infiniment mieux que pas de
 * sauvegarde du tout le jour où le routeur meurt.
 */
export async function captureRouterBackup(
  routerId: string,
  opts: { trigger?: "auto" | "manual" } = {},
) {
  const db = getDb();
  const [router] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!router) return { error: "Routeur introuvable." };

  let client: RouterOSClient;
  try {
    client = await connectToRouter(router);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Connexion au routeur impossible : ${err.message}`
          : "Connexion au routeur impossible.",
    };
  }

  try {
    const [resource] = await client
      .talk(["/system/resource/print"], 20000)
      .catch(() => [] as Record<string, string>[]);
    const [board] = await client
      .talk(["/system/routerboard/print"], 20000)
      .catch(() => [] as Record<string, string>[]);
    const [identityRow] = await client
      .talk(["/system/identity/print"], 20000)
      .catch(() => [] as Record<string, string>[]);

    const sections: Record<string, BackupSection> = {};
    const warnings: string[] = [];
    for (const section of SECTIONS) {
      const { rows, error } = await readSection(client, section.cmd, section.proplist, section.query);
      sections[section.key] = rows;
      if (error) warnings.push(`${section.key} : ${error}`);
      await pause(SECTION_PAUSE_MS);
    }

    const identity = await readIdentity(client, sections).catch(() => undefined);
    const portal = await readPortalInfo(router.id, sections).catch(() => undefined);

    const snapshot: BackupSnapshot = {
      version: BACKUP_VERSION,
      capturedAt: new Date().toISOString(),
      router: {
        name: router.name,
        model: resource?.["board-name"] ?? router.model ?? null,
        rosVersion: resource?.version ?? null,
        serialNumber: board?.["serial-number"] ?? null,
        identity: identityRow?.name ?? null,
      },
      sections,
      identity,
      portal,
      warnings,
    };

    const raw = Buffer.from(JSON.stringify(snapshot), "utf8");
    const payload = gzipSync(raw).toString("base64");
    const counts = Object.fromEntries(
      Object.entries(sections).map(([k, v]) => [k, v.length]),
    );

    const [row] = await db
      .insert(routerBackups)
      .values({
        orgId: router.orgId,
        routerId: router.id,
        routerName: router.name,
        model: snapshot.router.model,
        rosVersion: snapshot.router.rosVersion,
        serialNumber: snapshot.router.serialNumber,
        identity: snapshot.router.identity,
        trigger: opts.trigger ?? "manual",
        payload,
        sizeBytes: raw.length,
        counts,
      })
      .returning();

    await pruneOldBackups(router.id);

    return {
      success: true as const,
      id: row.id,
      counts,
      warnings,
      sizeBytes: raw.length,
      compressedBytes: Buffer.byteLength(payload, "utf8"),
    };
  } catch (err) {
    return {
      error: err instanceof Error ? `Sauvegarde échouée : ${err.message}` : "Sauvegarde échouée.",
    };
  } finally {
    client.close();
  }
}

/**
 * Identité de la zone WiFi : ce que les clients connaissent (le SSID auquel
 * leur téléphone se reconnecte, l'URL du portail). Volontairement lue via
 * wifi-compat plutôt que d'une section brute : la source peut être legacy et la
 * cible en ax, et seul ce couple SSID/dns-name traverse la frontière.
 */
async function readIdentity(client: RouterOSClient, sections: Record<string, BackupSection>) {
  const wifi = await readWifiState(client);
  // Le hotspot réellement actif, sans rien présumer de son nom : un routeur
  // configuré à la main n'a aucune raison de suivre nos conventions.
  const servers = sections.hotspotServers ?? [];
  const server = servers.find((s) => s.disabled !== "true") ?? servers[0];
  const profiles = sections.hotspotServerProfiles ?? [];
  const profile = server?.profile ? profiles.find((p) => p.name === server.profile) : undefined;

  return {
    wifiApi: wifi.api,
    ssid: primarySsid(wifi),
    hotspotDnsName: profile?.["dns-name"] ?? null,
    hotspotServerName: server?.name ?? null,
  };
}

/**
 * Quel portail captif ce routeur servait. Le modèle vient de la base (le SaaS
 * le mémorise à l'installation), pas du routeur : sur la flash il n'y a que des
 * fichiers, sans indication de leur origine.
 */
async function readPortalInfo(routerId: string, sections: Record<string, BackupSection>) {
  const servers = sections.hotspotServers ?? [];
  const server = servers.find((s) => s.disabled !== "true") ?? servers[0];
  const profiles = sections.hotspotServerProfiles ?? [];
  const profile = server?.profile ? profiles.find((p) => p.name === server.profile) : undefined;
  // L'override prime quand il est posé (cas de l'auto-setup) — c'est lui que le
  // hotspot sert réellement.
  const htmlDirectory =
    profile?.["html-directory-override"]?.trim() || profile?.["html-directory"]?.trim() || null;

  const db = getDb();
  // routers.captiveTemplateId d'abord : c'est la source fiable, posée à chaque
  // installation. Les bridges ne servent que de repli pour les routeurs
  // installés AVANT l'ajout de cette colonne et qui ont un bridge suivi.
  const [direct] = await db
    .select({ id: captiveTemplates.id, name: captiveTemplates.name })
    .from(routers)
    .innerJoin(captiveTemplates, eq(routers.captiveTemplateId, captiveTemplates.id))
    .where(eq(routers.id, routerId))
    .limit(1);

  const [fallback] = direct
    ? [undefined]
    : await db
        .select({ id: captiveTemplates.id, name: captiveTemplates.name })
        .from(bridges)
        .innerJoin(captiveTemplates, eq(bridges.captiveTemplateId, captiveTemplates.id))
        .where(eq(bridges.routerId, routerId))
        .limit(1);

  const row = direct ?? fallback;
  return {
    htmlDirectory,
    templateId: row?.id ?? null,
    templateName: row?.name ?? null,
  };
}

/** Ne garde que les BACKUP_RETENTION dernières sauvegardes du routeur. */
async function pruneOldBackups(routerId: string) {
  const db = getDb();
  const keep = await db
    .select({ id: routerBackups.id })
    .from(routerBackups)
    .where(eq(routerBackups.routerId, routerId))
    .orderBy(desc(routerBackups.createdAt))
    .limit(BACKUP_RETENTION);
  if (keep.length < BACKUP_RETENTION) return;
  const oldest = keep[keep.length - 1];
  const [{ createdAt } = { createdAt: null }] = await db
    .select({ createdAt: routerBackups.createdAt })
    .from(routerBackups)
    .where(eq(routerBackups.id, oldest.id))
    .limit(1);
  if (!createdAt) return;
  await db
    .delete(routerBackups)
    .where(and(eq(routerBackups.routerId, routerId), lt(routerBackups.createdAt, createdAt)));
}

export function decodeSnapshot(payload: string): BackupSnapshot {
  return JSON.parse(gunzipSync(Buffer.from(payload, "base64")).toString("utf8"));
}

/**
 * Champs recopiés à la restauration d'un ticket.
 *
 * `comment` est le plus important et le moins évident : MikHmon n'utilise PAS
 * limit-uptime (0 ticket sur 4 869 en avait un) — il écrit l'expiration absolue
 * dans le commentaire ("jul/18/2026 14:00:28"). Le recopier fait qu'un ticket
 * DÉJÀ EN COURS garde exactement sa date de fin sur le rechange.
 *
 * Les compteurs (uptime, bytes-in/out) sont volontairement absents : RouterOS
 * les expose en lecture seule, ils sont donc impossibles à réinjecter. Ce n'est
 * pas une perte : la validité est une date, pas un quota d'uptime.
 */
const USER_FIELDS = [
  "name",
  "password",
  "profile",
  "server",
  "comment",
  "disabled",
  "limit-uptime",
  "limit-bytes-total",
  "email",
  "address",
  "mac-address",
  "routes",
] as const;

const PROFILE_FIELDS = [
  "name",
  "shared-users",
  "rate-limit",
  "session-timeout",
  "idle-timeout",
  "keepalive-timeout",
  "status-autorefresh",
  "transparent-proxy",
  "address-list",
  "on-login",
  "on-logout",
] as const;

/**
 * Champs RÉÉCRITS sur un profil qui existe déjà sur le rechange.
 *
 * Ailleurs, « le nom existe déjà » veut dire « ne touche à rien » — pour un
 * ticket c'est vital. Pour un profil, c'est précisément ce qui cassait la
 * reprise : le rechange sort de l'auto-setup avec ses propres 01-JOUR/01-MOIS
 * aux tarifs par défaut, donc TOUS les profils de l'ancien étaient ignorés au
 * nom d'un doublon, et le rechange continuait de vendre aux prix d'usine. Or
 * `on-login` n'est pas décoratif : MikHmon y encode le tarif et la validité
 * (",remc,<prix>,<durée>,…" — voir voucher-profiles.ts), et c'est cette
 * chaîne-là que relisent et le journal de ventes et l'adoption des forfaits
 * (hotspot-profile-import.ts). La recopier est ce que « synchroniser les
 * profils » veut dire, et ça ne détruit aucun ticket : un profil n'est qu'un
 * gabarit.
 *
 * `name` est volontairement absent (c'est la clé), et les champs de RÉSEAU
 * (address-pool, parent-queue) aussi : ils nomment des objets propres au
 * matériel de l'ancien, que le rechange n'a aucune raison d'avoir.
 */
const PROFILE_SYNC_FIELDS = [
  "on-login",
  "on-logout",
  "rate-limit",
  "shared-users",
  "session-timeout",
  "idle-timeout",
  "keepalive-timeout",
] as const;

/**
 * Le balayage d'expiration. `on-event` porte le filtre `where profile="<nom>"`
 * et `policy` les droits sans lesquels il ne peut pas supprimer un ticket —
 * les deux sont indispensables, un scheduler restauré sans policy tourne mais
 * n'expire personne.
 */
const SCHEDULER_FIELDS = [
  "name",
  "interval",
  "on-event",
  "policy",
  "start-date",
  "start-time",
  "comment",
  "disabled",
] as const;

/** Le nom EST la vente (voir la section mikhmonSales) ; `owner` est le mois lu par les rapports. */
const SALES_FIELDS = ["name", "owner", "source", "comment", "policy"] as const;

function pick(row: Record<string, string>, fields: readonly string[]): string[] {
  const words: string[] = [];
  for (const f of fields) {
    const v = row[f];
    if (v === undefined || v === "") continue;
    words.push(`=${f}=${v}`);
  }
  return words;
}

export type RestoreReport = {
  section: string;
  created: number;
  skipped: number;
  /** Existait déjà et a été RÉALIGNÉ sur la sauvegarde — voir PROFILE_SYNC_FIELDS. */
  updated: number;
  failed: { name: string; error: string }[];
};

/**
 * Avancement émis pendant une restauration, persisté par le job (backup-actions)
 * pour que le navigateur qui sonde affiche une vraie barre de progression. Les
 * tickets sont écrits un par un et c'est la phase longue : `ticketsDone` /
 * `ticketsTotal` la suivent en continu.
 */
export type RestoreProgress = {
  phase:
    | "remodel"
    | "hotspotUserProfiles"
    | "hotspotUserProfileLinks"
    | "mikhmonSchedulers"
    | "hotspotUsers"
    | "activeSessionHandover"
    | "mikhmonSales"
    | "walledGarden"
    | "walledGardenIp"
    | "done";
  reports: RestoreReport[];
  plan: RestorePlan;
  ticketsDone?: number;
  ticketsTotal?: number;
  /** Journal de ventes MikHmon : seconde phase longue, après les tickets. */
  salesDone?: number;
  salesTotal?: number;
};

/** Un tick de progression tous les N tickets : assez pour une barre fluide sans
 * inonder la base (chaque persistance = une requête HTTP neon). */
const PROGRESS_EVERY = 200;

/**
 * Rejoue une sauvegarde sur un routeur (typiquement le rechange).
 *
 * Le matériel de la cible est SCANNÉ d'abord (router-preflight) : le plan qui
 * en sort dit ce qui sera repris, adapté, ou est impossible. Les blocages
 * arrêtent la restauration — restaurer 4 800 tickets sur un routeur sans
 * hotspot ne produirait que 4 800 échecs.
 *
 * Idempotent par nom : ce qui existe déjà est laissé intact plutôt qu'écrasé —
 * une restauration relancée après une coupure réseau reprend là où elle en
 * était, et ne peut pas détruire un ticket déjà recréé. `dryRun` compte ce qui
 * serait fait sans rien écrire.
 */
export async function restoreBackupToRouter(
  backupId: string,
  targetRouterId: string,
  opts: {
    dryRun?: boolean;
    force?: boolean;
    /** Notifié après chaque section, et toutes les ~200 écritures de tickets. */
    onProgress?: (p: RestoreProgress) => void | Promise<void>;
  } = {},
) {
  const db = getDb();
  const [backup] = await db
    .select()
    .from(routerBackups)
    .where(eq(routerBackups.id, backupId))
    .limit(1);
  if (!backup) return { error: "Sauvegarde introuvable." };

  const [target] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, targetRouterId))
    .limit(1);
  if (!target) return { error: "Routeur cible introuvable." };
  if (target.orgId !== backup.orgId) {
    return { error: "Ce routeur n'appartient pas à la même organisation que la sauvegarde." };
  }

  let snapshot: BackupSnapshot;
  try {
    snapshot = decodeSnapshot(backup.payload);
  } catch {
    return { error: "Sauvegarde illisible (payload corrompu)." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(target);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Connexion au routeur cible impossible : ${err.message}`
          : "Connexion au routeur cible impossible.",
    };
  }

  const reports: RestoreReport[] = [];
  let scan: HardwareScan;
  let plan: RestorePlan;
  try {
    scan = await scanRouterHardware(client);
    plan = buildRestorePlan(snapshot, scan);
  } catch (err) {
    client.close();
    return {
      error:
        err instanceof Error
          ? `Scan du routeur cible impossible : ${err.message}`
          : "Scan du routeur cible impossible.",
    };
  }

  // Un blocage arrête l'écriture : sans hotspot sur la cible, les ~5 000 ajouts
  // de tickets échoueraient un par un. La simulation, elle, va au bout — c'est
  // justement là qu'on veut VOIR le blocage.
  if (plan.blockers.length > 0 && !opts.dryRun && !opts.force) {
    client.close();
    return {
      error: `Restauration refusée : ${plan.blockers.join(" ")}`,
      plan,
      blocked: true as const,
    };
  }

  // Notifie l'avancement sans jamais faire échouer la restauration : une erreur
  // de persistance du progrès ne doit pas interrompre l'écriture des tickets.
  const emit = async (p: Omit<RestoreProgress, "plan">) => {
    if (!opts.onProgress) return;
    try {
      await opts.onProgress({ ...p, plan });
    } catch {
      /* le suivi est best-effort */
    }
  };

  try {
    await applyRemodel(client, snapshot, plan, opts.dryRun);
    // Ordre imposé par les dépendances : un ticket référence son profil, donc
    // les profils doivent exister d'abord, sinon RouterOS refuse le ticket.
    reports.push(
      await restoreNamed(client, {
        section: "hotspotUserProfiles",
        rows: snapshot.sections.hotspotUserProfiles ?? [],
        listCmd: "/ip/hotspot/user/profile/print",
        addCmd: "/ip/hotspot/user/profile/add",
        fields: PROFILE_FIELDS,
        updateFields: PROFILE_SYNC_FIELDS,
        updateCmd: "/ip/hotspot/user/profile/set",
        dryRun: opts.dryRun,
      }),
    );
    await emit({ phase: "hotspotUserProfiles", reports: [...reports] });

    // Un profil peut avoir été supprimé puis recréé par une ancienne version
    // de l'auto-setup. RouterOS conserve alors l'ancien ID sur les tickets,
    // mais cet ID ne désigne plus aucun profil (Winbox affiche "unknown").
    // Cette passe ne touche QUE ces références orphelines ; une modification
    // manuelle qui vise encore un profil existant reste donc prioritaire.
    reports.push(
      await repairDanglingHotspotUserProfiles(
        client,
        snapshot.sections.hotspotUsers ?? [],
        snapshot.sections.hotspotUserProfiles ?? [],
        opts.dryRun,
        (done, total) =>
          emit({
            phase: "hotspotUserProfileLinks",
            reports: [
              ...reports,
              {
                section: "hotspotUserProfileLinks",
                created: 0,
                skipped: 0,
                updated: done,
                failed: [],
              },
            ],
            ticketsDone: done,
            ticketsTotal: total,
          }),
      ),
    );
    await emit({ phase: "hotspotUserProfileLinks", reports: [...reports] });

    // Aussitôt après les profils, et avant les tickets : c'est ce balayage qui
    // fera expirer les tickets qu'on s'apprête à recréer.
    reports.push(
      await restoreMikhmonSchedulers(
        client,
        snapshot.sections.schedulers ?? [],
        snapshot.sections.hotspotUserProfiles ?? [],
        opts.dryRun,
      ),
    );
    await emit({ phase: "mikhmonSchedulers", reports: [...reports] });

    const ticketRows = (snapshot.sections.hotspotUsers ?? []).filter(
      (r) => r.name && r.default !== "true",
    );
    reports.push(
      await restoreHotspotUsers(client, snapshot.sections.hotspotUsers ?? [], opts.dryRun, (done) =>
        emit({
          phase: "hotspotUsers",
          reports: [
            ...reports,
            { section: "hotspotUsers", created: done, skipped: 0, updated: 0, failed: [] },
          ],
          ticketsDone: done,
          ticketsTotal: ticketRows.length,
        }),
      ),
    );
    await emit({ phase: "hotspotUsers", reports: [...reports], ticketsTotal: ticketRows.length });

    // Les clients réellement connectés au moment de la capture peuvent revenir
    // sur le nouveau routeur sans retaper leur code. RouterOS ne permet pas de
    // réinsérer une ligne /ip/hotspot/cookie (lecture seule), donc on crée à la
    // place un compte MAC temporaire, sans on-login, qui s'efface à la MÊME
    // date d'expiration que le ticket source. Les sessions sans expiration
    // explicite restent volontairement ignorées : ne jamais transformer une
    // restauration en accès illimité.
    reports.push(
      await restoreActiveSessionHandover(
        client,
        snapshot.sections.hotspotActive ?? [],
        snapshot.sections.hotspotUsers ?? [],
        snapshot.sections.hotspotUserProfiles ?? [],
        opts.dryRun,
      ),
    );
    await emit({ phase: "activeSessionHandover", reports: [...reports] });

    // Après les tickets : une vente n'a de sens qu'une fois son ticket là. Comme
    // les tickets, ces lignes s'écrivent une par une et se comptent par milliers
    // — d'où le suivi d'avancement.
    const salesRows = (snapshot.sections.mikhmonSales ?? []).filter((r) => r.name);
    reports.push(
      await restoreMikhmonSales(client, salesRows, opts.dryRun, (done) =>
        emit({
          phase: "mikhmonSales",
          reports: [
            ...reports,
            { section: "mikhmonSales", created: done, skipped: 0, updated: 0, failed: [] },
          ],
          salesDone: done,
          salesTotal: salesRows.length,
        }),
      ),
    );
    await emit({ phase: "mikhmonSales", reports: [...reports], salesTotal: salesRows.length });

    reports.push(
      await restoreWalledGarden(client, snapshot.sections.walledGarden ?? [], opts.dryRun),
    );
    await emit({ phase: "walledGarden", reports: [...reports] });

    reports.push(
      await restoreWalledGardenIp(client, snapshot.sections.walledGardenIp ?? [], opts.dryRun),
    );
    await emit({ phase: "walledGardenIp", reports: [...reports] });
  } catch (err) {
    return {
      error: err instanceof Error ? `Restauration interrompue : ${err.message}` : "Restauration interrompue.",
      reports,
      plan,
    };
  } finally {
    client.close();
  }

  return { success: true as const, dryRun: !!opts.dryRun, reports, plan, scan };
}

/**
 * Applique au rechange ce que le plan a décidé — le « remodelage ».
 *
 * Ce qui NE traverse volontairement PAS la frontière entre modèles :
 *   - bridge, ports, adresses IP, NAT, filter : ils nomment des interfaces
 *     (ether2, wlan2, wifi1) qui n'existent pas à l'identique ailleurs. Un
 *     RB951 a 5 ports et wlan2, un hAP ax² a wifi1+wifi2 ; rejouer ces règles
 *     produirait une config qui référence le vide.
 *   - le conteneur MikHmon : son support (USB / flash / eMMC / tmpfs) dépend du
 *     modèle, et l'auto-setup sait déjà choisir le bon (voir device-catalog).
 *     Le refaire ici le referait mal.
 *
 * Ce qui traverse : le nom RouterOS, le SSID et le dns-name du portail —
 * l'identité que le parc et les clients connaissent — plus les tickets et
 * profils, qui ne nomment aucun matériel.
 */
async function applyRemodel(
  client: RouterOSClient,
  snapshot: BackupSnapshot,
  plan: RestorePlan,
  dryRun?: boolean,
) {
  // Le rechange prend le nom de l'ancien : pour le parc, il EST l'ancien. Le
  // prochain sync relira cette identité et renommera la ligne en base.
  if (plan.identity.willApply && plan.identity.to) {
    const res = await applyIdentity(client, plan.identity.to, dryRun);
    if (!res.applied && res.error) {
      plan.adjustments.push(`Nom RouterOS refusé : ${res.error}`);
    }
  }

  const ssid = plan.wifi.ssid?.trim();
  if (ssid && plan.wifi.targetApi !== "none") {
    const applied = await applySsid(client, ssid, { dryRun });
    for (const f of applied.failed) {
      plan.adjustments.push(`SSID refusé sur ${f.radio} : ${f.error}`);
    }
  }

  // dns-name du portail : neutre vis-à-vis du matériel, mais il faut le poser
  // sur le profil du hotspot ACTIF de la cible, dont le nom n'a aucune raison
  // de coïncider avec celui de la source.
  const dnsName = snapshot.identity?.hotspotDnsName?.trim();
  if (!dnsName || dryRun) return;

  const servers = await client
    .talk(["/ip/hotspot/print"], 20000)
    .catch(() => [] as Record<string, string>[]);
  const server = servers.find((s) => s.disabled !== "true") ?? servers[0];
  if (!server?.profile) return;
  try {
    await client.talk(
      ["/ip/hotspot/profile/set", `=numbers=${server.profile}`, `=dns-name=${dnsName}`],
      20000,
    );
    plan.adjustments.push(`Nom DNS du portail « ${dnsName} » repris sur « ${server.name} ».`);
  } catch (err) {
    plan.adjustments.push(
      `Nom DNS « ${dnsName} » refusé : ${err instanceof Error ? err.message : "erreur"}`,
    );
  }
}

/** Restaure une section identifiée par un champ "name" unique. */
async function restoreNamed(
  client: RouterOSClient,
  args: {
    section: string;
    rows: BackupSection;
    listCmd: string;
    addCmd: string;
    fields: readonly string[];
    dryRun?: boolean;
    /**
     * Fourni ⇒ un élément qui existe DÉJÀ sur la cible est réaligné sur la
     * sauvegarde au lieu d'être ignoré (voir PROFILE_SYNC_FIELDS). Omis ⇒
     * comportement historique : on n'écrase rien. Les tickets ne doivent JAMAIS
     * le recevoir — une restauration relancée écraserait alors le commentaire
     * d'expiration d'un ticket déjà repris et en cours de validité.
     */
    updateFields?: readonly string[];
    updateCmd?: string;
    /** Appelé tous les PROGRESS_EVERY éléments traités (créés + ignorés). */
    onProgress?: (processed: number) => void | Promise<void>;
  },
): Promise<RestoreReport> {
  const report: RestoreReport = {
    section: args.section,
    created: 0,
    skipped: 0,
    updated: 0,
    failed: [],
  };
  const existing = await client
    .talk([args.listCmd], 45000)
    .catch(() => [] as Record<string, string>[]);
  // On garde le .id de la cible, pas seulement son nom : c'est lui qui adresse
  // la ligne à réaligner, sans dépendre du fait que RouterOS accepte (ou pas)
  // un nom comme =numbers= sur cette table.
  const known = new Map<string, string | undefined>();
  for (const r of existing) {
    if (r.name) known.set(r.name, r[".id"]);
  }

  let processed = 0;
  for (const row of args.rows) {
    const name = row.name;
    if (!name) continue;
    // Le profil "default" est livré avec RouterOS : il existe toujours, et
    // tenter de le recréer échoue systématiquement.
    if (name === "default") {
      report.skipped++;
    } else if (known.has(name)) {
      const words = args.updateFields ? pick(row, args.updateFields) : [];
      const id = known.get(name);
      // Rien à réaligner (section sans updateFields, ou sauvegarde qui ne porte
      // aucun de ces champs) ⇒ on laisse la cible strictement intacte.
      if (words.length === 0 || !args.updateCmd || !id) {
        report.skipped++;
      } else if (args.dryRun) {
        report.updated++;
      } else {
        try {
          await client.talk([args.updateCmd, `=numbers=${id}`, ...words], 30000);
          report.updated++;
        } catch (err) {
          report.failed.push({
            name,
            error: err instanceof Error ? err.message : "Erreur inconnue",
          });
        }
      }
    } else if (args.dryRun) {
      report.created++;
      known.set(name, undefined);
    } else {
      try {
        await client.talk([args.addCmd, ...pick(row, args.fields)], 30000);
        report.created++;
        known.set(name, undefined);
      } catch (err) {
        report.failed.push({ name, error: err instanceof Error ? err.message : "Erreur inconnue" });
      }
    }
    processed++;
    if (args.onProgress && processed % PROGRESS_EVERY === 0) await args.onProgress(processed);
  }
  return report;
}

/**
 * Les tickets sont recréés un à un (RouterOS n'a pas d'ajout en lot). Sur un
 * parc à ~5 000 tickets, c'est long mais c'est exactement la donnée qu'on ne
 * peut pas se permettre de perdre.
 */
async function restoreHotspotUsers(
  client: RouterOSClient,
  rows: BackupSection,
  dryRun?: boolean,
  onProgress?: (processed: number) => void | Promise<void>,
): Promise<RestoreReport> {
  return restoreNamed(client, {
    section: "hotspotUsers",
    // Les comptes de service MikHmon (role=vendeur) sont recréés comme les
    // autres : ce sont les identifiants de vos vendeurs.
    rows: rows.filter((r) => r.name && r.default !== "true"),
    listCmd: "/ip/hotspot/user/print",
    addCmd: "/ip/hotspot/user/add",
    fields: USER_FIELDS,
    dryRun,
    onProgress,
  });
}

export type RecoverableHotspotSession = {
  /** Ticket d'origine, conservé pour les logs d'erreur uniquement. */
  username: string;
  /** MAC normalisé de l'appareil qui était réellement connecté. */
  macAddress: string;
  /** Profil de débit/quotas du ticket d'origine. */
  profile: string;
  /** Commentaire original, dont les 20 premiers caractères portent l'expiration. */
  comment: string;
  /** Date RouterOS à laquelle l'accès temporaire doit disparaître. */
  expiresOn: string;
  expiresAt: string;
};

function normalizeMacAddress(raw: string | undefined): string | null {
  const hex = (raw ?? "").replace(/[^0-9a-f]/gi, "").toUpperCase();
  if (hex.length !== 12) return null;
  return (hex.match(/.{2}/g) ?? []).join(":");
}

function profileNameBySourceReference(profile: string, profiles: BackupSection): string | null {
  const names = new Set(profiles.map((row) => row.name).filter((name): name is string => !!name));
  if (names.has(profile)) return profile;
  return profiles.find((row) => row[".id"] === profile)?.name ?? null;
}

/**
 * Énumère les clients à reprendre sans recopier de cookie RouterOS — son menu
 * est explicitement en lecture seule. Un accès ne sera proposé que si le
 * ticket porte déjà une expiration absolue et que son profil existe sur la
 * cible. Un MAC vu avec deux tickets est rejeté : choisir arbitrairement l'un
 * d'eux donnerait l'accès au mauvais client.
 */
export function selectRecoverableHotspotSessions(
  activeRows: BackupSection,
  sourceProfiles: BackupSection,
  sourceUsers: BackupSection,
  targetProfiles: BackupSection,
  now = new Date(),
): RecoverableHotspotSession[] {
  const sourceUserByName = new Map(
    sourceUsers.filter((user) => !!user.name && user.default !== "true").map((user) => [user.name!, user]),
  );
  const targetProfileNames = new Set(
    targetProfiles.map((profile) => profile.name).filter((name): name is string => !!name),
  );
  const byMac = new Map<string, RecoverableHotspotSession | null>();

  for (const active of activeRows) {
    const username = active.user;
    const macAddress = normalizeMacAddress(active["mac-address"]);
    if (!username || !macAddress) continue;

    const ticket = sourceUserByName.get(username);
    if (!ticket?.profile || ticket.disabled === "true") continue;
    const profile = profileNameBySourceReference(ticket.profile, sourceProfiles);
    if (!profile || !targetProfileNames.has(profile)) continue;

    const comment = ticket.comment ?? "";
    const expiry = parseExpiryComment(comment);
    if (!expiry || wallToDate(expiry).getTime() <= now.getTime()) continue;

    const candidate: RecoverableHotspotSession = {
      username,
      macAddress,
      profile,
      comment,
      expiresOn: comment.slice(0, 11),
      expiresAt: comment.slice(12, 20),
    };
    const existing = byMac.get(macAddress);
    // Une répétition exacte de la même session est sans effet ; deux tickets
    // différents pour un même MAC sont ambigus et sont donc tous deux écartés.
    if (!byMac.has(macAddress)) {
      byMac.set(macAddress, candidate);
    } else if (!existing || existing.username !== candidate.username) {
      byMac.set(macAddress, null);
    }
  }
  return [...byMac.values()].filter((session): session is RecoverableHotspotSession => !!session);
}

const SESSION_PROFILE_COPY_FIELDS = [
  "address-pool",
  "shared-users",
  "rate-limit",
  "session-timeout",
  "idle-timeout",
  "keepalive-timeout",
  "address-list",
  "transparent-proxy",
] as const;

function recoveryProfileName(profileName: string): string {
  let hash = 5381;
  for (const char of profileName) hash = ((hash << 5) + hash) ^ char.charCodeAt(0);
  const readable = profileName.replace(/[^a-z0-9-]/gi, "").slice(0, 14) || "profile";
  return `SLH-S-${readable}-${(hash >>> 0).toString(36)}`;
}

function recoverySchedulerName(macAddress: string): string {
  return `SLH-RST-${macAddress.replace(/:/g, "")}`;
}

/**
 * Reconstruit l'expérience « je reviens sur le Wi‑Fi et je suis reconnecté »
 * pour les appareils qui étaient ACTIFS à la capture. Chaque compte MAC est
 * affecté à une copie sans on-login du profil de départ (pas de nouvelle vente
 * MikHmon, pas de prolongation) et un scheduler le supprime exactement à la
 * date du ticket d'origine.
 */
async function restoreActiveSessionHandover(
  client: RouterOSClient,
  activeRows: BackupSection,
  sourceUsers: BackupSection,
  sourceProfiles: BackupSection,
  dryRun?: boolean,
): Promise<RestoreReport> {
  const targetProfiles = await client.talk(["/ip/hotspot/user/profile/print"], 45000);
  const sessions = selectRecoverableHotspotSessions(
    activeRows,
    sourceProfiles,
    sourceUsers,
    targetProfiles,
  );
  const report: RestoreReport = {
    section: "activeSessionHandover",
    created: 0,
    skipped: 0,
    updated: 0,
    failed: [],
  };
  if (sessions.length === 0) return report;
  if (dryRun) {
    report.created = sessions.length;
    return report;
  }

  // `mac` authentifie les comptes nommés par leur MAC ; `mac-cookie` maintient
  // ensuite le confort de reconnexion tant que le routeur restauré est en vie.
  await ensureMacAutoLogin(client);

  const existingUsers = await client.talk(
    ["/ip/hotspot/user/print", "=.proplist=.id,name"],
    45000,
  );
  const existingUserNames = new Set(
    existingUsers.map((user) => user.name).filter((name): name is string => !!name),
  );
  const profilesByName = new Map(
    targetProfiles.filter((profile) => !!profile.name).map((profile) => [profile.name!, profile]),
  );

  for (const session of sessions) {
    // Ne remplace jamais un compte MAC déjà existant (roaming/admin) : il est
    // déjà une source d'autorité plus récente que cette sauvegarde.
    if (existingUserNames.has(session.macAddress)) {
      report.skipped++;
      continue;
    }
    const baseProfile = profilesByName.get(session.profile);
    if (!baseProfile) {
      report.failed.push({ name: session.username, error: "Profil de session introuvable." });
      continue;
    }

    const sessionProfile = recoveryProfileName(session.profile);
    if (!profilesByName.has(sessionProfile)) {
      try {
        await client.talk([
          "/ip/hotspot/user/profile/add",
          `=name=${sessionProfile}`,
          ...pick(baseProfile, SESSION_PROFILE_COPY_FIELDS),
        ]);
        profilesByName.set(sessionProfile, { name: sessionProfile });
      } catch (err) {
        report.failed.push({
          name: session.username,
          error: err instanceof Error ? err.message : "Création du profil de session impossible.",
        });
        continue;
      }
    }

    const schedulerName = recoverySchedulerName(session.macAddress);
    const cleanupEvent = [
      `/ip hotspot active remove [find where user="${session.macAddress}"]`,
      `/ip hotspot user remove [find where name="${session.macAddress}"]`,
      `/system scheduler remove [find where name="${schedulerName}"]`,
    ].join("; ");
    try {
      await client.talk([
        "/ip/hotspot/user/add",
        `=name=${session.macAddress}`,
        `=password=${session.macAddress}`,
        `=mac-address=${session.macAddress}`,
        `=profile=${sessionProfile}`,
        `=comment=${session.comment}`,
        "=server=all",
      ]);
      await client
        .talk(["/system/scheduler/remove", `=numbers=${schedulerName}`])
        .catch(() => {});
      await client.talk([
        "/system/scheduler/add",
        `=name=${schedulerName}`,
        `=start-date=${session.expiresOn}`,
        `=start-time=${session.expiresAt}`,
        "=interval=0s",
        `=on-event=${cleanupEvent}`,
        "=policy=read,write,policy,test",
        "=comment=SafeLinkHub temporary restored session",
      ]);
      existingUserNames.add(session.macAddress);
      report.created++;
    } catch (err) {
      // Sans scheduler, le profil de reprise ne doit jamais devenir une porte
      // d'accès qui survivrait au ticket. On retire donc immédiatement le user
      // temporaire créé juste avant l'erreur éventuelle.
      await client
        .talk(["/ip/hotspot/user/remove", `=numbers=${session.macAddress}`])
        .catch(() => {});
      report.failed.push({
        name: session.username,
        error: err instanceof Error ? err.message : "Reprise de session impossible.",
      });
    }
  }
  return report;
}

export type HotspotUserProfileRepair = {
  /** ID interne du ticket à modifier, propre au routeur cible. */
  id: string;
  /** Utilisé uniquement pour identifier une éventuelle erreur de restauration. */
  name: string;
  /** Nom du profil encore présent sur la cible. */
  profile: string;
};

/**
 * Sélectionne les tickets dont le champ `profile` pointe vers un ID RouterOS
 * qui n'existe plus. C'est volontairement une fonction pure : le moteur de
 * restauration peut la tester sans routeur, puis n'écrit que le sous-ensemble
 * sûr qu'elle retourne.
 */
export function findDanglingHotspotUserProfileRepairs(
  backupUsers: BackupSection,
  backupProfiles: BackupSection,
  targetUsers: BackupSection,
  targetProfiles: BackupSection,
): HotspotUserProfileRepair[] {
  const sourceProfileNames = new Set(
    backupProfiles.map((profile) => profile.name).filter((name): name is string => !!name),
  );
  const sourceProfileNamesById = new Map(
    backupProfiles
      .filter((profile) => !!profile[".id"] && !!profile.name)
      .map((profile) => [profile[".id"]!, profile.name!]),
  );
  const expectedProfileByUser = new Map<string, string>();
  for (const user of backupUsers) {
    if (!user.name || user.default === "true" || !user.profile) continue;
    const profile = sourceProfileNames.has(user.profile)
      ? user.profile
      : sourceProfileNamesById.get(user.profile);
    if (profile) expectedProfileByUser.set(user.name, profile);
  }

  const targetProfileNames = new Set(
    targetProfiles.map((profile) => profile.name).filter((name): name is string => !!name),
  );
  const repairs: HotspotUserProfileRepair[] = [];
  for (const user of targetUsers) {
    const id = user[".id"];
    const currentProfile = user.profile;
    if (!id || !user.name || !currentProfile || targetProfileNames.has(currentProfile)) continue;

    const expectedProfile = expectedProfileByUser.get(user.name);
    if (!expectedProfile || !targetProfileNames.has(expectedProfile)) continue;
    repairs.push({ id, name: user.name, profile: expectedProfile });
  }
  return repairs;
}

/**
 * Répare une restauration déjà affectée, sans écraser les tickets qui ont un
 * profil valide sur le routeur cible. Une relance de restauration devient ainsi
 * auto-réparatrice après la mise à jour de SafeLinkHub.
 */
async function repairDanglingHotspotUserProfiles(
  client: RouterOSClient,
  backupUsers: BackupSection,
  backupProfiles: BackupSection,
  dryRun?: boolean,
  onProgress?: (done: number, total: number) => void | Promise<void>,
): Promise<RestoreReport> {
  const targetUsers = await client.talk(
    ["/ip/hotspot/user/print", "=.proplist=.id,name,profile"],
    45000,
  );
  const targetProfiles = await client.talk(
    ["/ip/hotspot/user/profile/print", "=.proplist=.id,name"],
    30000,
  );
  const repairs = findDanglingHotspotUserProfileRepairs(
    backupUsers,
    backupProfiles,
    targetUsers,
    targetProfiles,
  );
  const report: RestoreReport = {
    section: "hotspotUserProfileLinks",
    created: 0,
    skipped: 0,
    updated: 0,
    failed: [],
  };

  for (const repair of repairs) {
    if (dryRun) {
      report.updated++;
    } else {
      try {
        await client.talk(
          [
            "/ip/hotspot/user/set",
            `=numbers=${repair.id}`,
            `=profile=${repair.profile}`,
          ],
          30000,
        );
        report.updated++;
      } catch (err) {
        report.failed.push({
          name: repair.name,
          error: err instanceof Error ? err.message : "Erreur inconnue",
        });
      }
    }
    if (onProgress && (report.updated + report.failed.length) % PROGRESS_EVERY === 0) {
      await onProgress(report.updated + report.failed.length, repairs.length);
    }
  }
  return report;
}

/**
 * Les balayages d'expiration MikHmon — LA raison pour laquelle un ticket
 * restauré finit par expirer.
 *
 * Deux mécanismes font expirer un voucher, et un seul survit à la restauration
 * sans aide : l'`on-login` du profil pose un job à usage unique, mais seulement
 * à la PREMIÈRE connexion — un ticket déjà en cours, lui, a son expiration figée
 * dans son commentaire et ne repassera jamais par on-login. Ce qui le supprime
 * le jour venu, c'est le scheduler permanent, nommé exactement comme son profil,
 * qui balaye toutes les ~2 min les commentaires échus. La section `schedulers`
 * était capturée mais jamais rejouée : le rechange reprenait donc les tickets et
 * les gardait ÉTERNELLEMENT valides. Les clients gardaient un accès qu'ils
 * n'avaient plus payé.
 *
 * Le filtre est le nom : chez MikHmon, un balayage porte le nom de son profil.
 * Ça exclut d'office les jobs à usage unique (nommés d'après un utilisateur) et
 * ceux de l'auto-setup (MIKHMON_BOOT, CLEAN_JOB), qu'il repose lui-même et qui
 * n'ont rien à faire ici.
 */
export function selectMikhmonSchedulers(
  schedulerRows: BackupSection,
  profileRows: BackupSection,
): BackupSection {
  const profileNames = new Set(
    profileRows.map((p) => p.name).filter((n): n is string => !!n && n !== "default"),
  );
  return schedulerRows.filter((r) => !!r.name && profileNames.has(r.name));
}

async function restoreMikhmonSchedulers(
  client: RouterOSClient,
  rows: BackupSection,
  profileRows: BackupSection,
  dryRun?: boolean,
): Promise<RestoreReport> {
  return restoreNamed(client, {
    section: "mikhmonSchedulers",
    rows: selectMikhmonSchedulers(rows, profileRows),
    listCmd: "/system/scheduler/print",
    addCmd: "/system/scheduler/add",
    fields: SCHEDULER_FIELDS,
    // Réaligné comme les profils, et pour la même raison : l'auto-setup a posé
    // ses propres balayages sur le rechange, or c'est celui de l'ancien qui sait
    // quelle durée il balaye.
    updateFields: SCHEDULER_FIELDS.filter((f) => f !== "name"),
    updateCmd: "/system/scheduler/set",
    dryRun,
  });
}

/**
 * Le journal de ventes MikHmon (voir la section mikhmonSales) : ce sont ces
 * lignes, et elles seules, que les rapports additionnent. Sans elles le
 * rechange affiche 0 F alors qu'il porte des milliers de tickets vendus.
 *
 * Jamais réaligné : une vente est un fait daté, pas un réglage. Si le nom existe
 * déjà, la vente est déjà là — la réécrire ne changerait rien et risquerait de
 * corrompre une ligne saine.
 */
async function restoreMikhmonSales(
  client: RouterOSClient,
  rows: BackupSection,
  dryRun?: boolean,
  onProgress?: (processed: number) => void | Promise<void>,
): Promise<RestoreReport> {
  return restoreNamed(client, {
    section: "mikhmonSales",
    rows: rows.filter((r) => r.name),
    listCmd: "/system/script/print",
    addCmd: "/system/script/add",
    fields: SALES_FIELDS,
    dryRun,
    onProgress,
  });
}

/** Walled-garden HTTP : identifié par dst-host (pas de champ "name"). */
async function restoreWalledGarden(
  client: RouterOSClient,
  rows: BackupSection,
  dryRun?: boolean,
): Promise<RestoreReport> {
  const report: RestoreReport = {
    section: "walledGarden",
    created: 0,
    skipped: 0,
    updated: 0,
    failed: [],
  };
  const existing = await client
    .talk(["/ip/hotspot/walled-garden/print"], 45000)
    .catch(() => [] as Record<string, string>[]);
  const known = new Set(existing.map((r) => `${r["dst-host"] ?? ""}|${r["dst-port"] ?? ""}`));

  for (const row of rows) {
    const host = row["dst-host"];
    if (!host) continue;
    const key = `${host}|${row["dst-port"] ?? ""}`;
    if (known.has(key)) {
      report.skipped++;
      continue;
    }
    if (dryRun) {
      report.created++;
      known.add(key);
      continue;
    }
    try {
      await client.talk(
        ["/ip/hotspot/walled-garden/add", ...pick(row, ["dst-host", "dst-port", "action", "comment"])],
        30000,
      );
      report.created++;
      known.add(key);
    } catch (err) {
      report.failed.push({ name: host, error: err instanceof Error ? err.message : "Erreur inconnue" });
    }
  }
  return report;
}

/** Walled-garden IP (HTTPS) : identifié par dst-host + protocole + port. */
async function restoreWalledGardenIp(
  client: RouterOSClient,
  rows: BackupSection,
  dryRun?: boolean,
): Promise<RestoreReport> {
  const report: RestoreReport = {
    section: "walledGardenIp",
    created: 0,
    skipped: 0,
    updated: 0,
    failed: [],
  };
  const existing = await client
    .talk(["/ip/hotspot/walled-garden/ip/print"], 45000)
    .catch(() => [] as Record<string, string>[]);
  const key = (r: Record<string, string>) =>
    `${r["dst-host"] ?? ""}|${r.protocol ?? ""}|${r["dst-port"] ?? ""}`;
  const known = new Set(existing.map(key));

  for (const row of rows) {
    if (!row["dst-host"]) continue;
    if (known.has(key(row))) {
      report.skipped++;
      continue;
    }
    if (dryRun) {
      report.created++;
      known.add(key(row));
      continue;
    }
    try {
      await client.talk(
        [
          "/ip/hotspot/walled-garden/ip/add",
          ...pick(row, ["dst-host", "protocol", "dst-port", "action", "comment"]),
        ],
        30000,
      );
      report.created++;
      known.add(key(row));
    } catch (err) {
      report.failed.push({
        name: row["dst-host"],
        error: err instanceof Error ? err.message : "Erreur inconnue",
      });
    }
  }
  return report;
}

/**
 * Scanne le rechange et rend le plan, SANS rien écrire ni tenter la moindre
 * restauration. Séparé de la simulation à dessein : simuler lit les ~5 000
 * tickets de la cible pour compter les doublons, alors que la question « ce
 * matériel peut-il reprendre l'ancien ? » se tranche en quelques commandes.
 */
export async function scanRestoreTarget(backupId: string, targetRouterId: string) {
  const db = getDb();
  const [backup] = await db
    .select()
    .from(routerBackups)
    .where(eq(routerBackups.id, backupId))
    .limit(1);
  if (!backup) return { error: "Sauvegarde introuvable." };

  const [target] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, targetRouterId))
    .limit(1);
  if (!target) return { error: "Routeur cible introuvable." };
  if (target.orgId !== backup.orgId) {
    return { error: "Ce routeur n'appartient pas à la même organisation que la sauvegarde." };
  }

  let snapshot: BackupSnapshot;
  try {
    snapshot = decodeSnapshot(backup.payload);
  } catch {
    return { error: "Sauvegarde illisible (payload corrompu)." };
  }

  let client: RouterOSClient;
  try {
    client = await connectToRouter(target);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Connexion au routeur cible impossible : ${err.message}`
          : "Connexion au routeur cible impossible.",
    };
  }

  try {
    const scan = await scanRouterHardware(client);
    return { success: true as const, scan, plan: buildRestorePlan(snapshot, scan) };
  } catch (err) {
    return {
      error: err instanceof Error ? `Scan impossible : ${err.message}` : "Scan impossible.",
    };
  } finally {
    client.close();
  }
}

/** Sauvegardes d'une org, sans le payload (lourd) — pour l'affichage. */
export async function listOrgBackups(orgId: string) {
  const db = getDb();
  return db
    .select({
      id: routerBackups.id,
      routerId: routerBackups.routerId,
      routerName: routerBackups.routerName,
      model: routerBackups.model,
      rosVersion: routerBackups.rosVersion,
      serialNumber: routerBackups.serialNumber,
      trigger: routerBackups.trigger,
      sizeBytes: routerBackups.sizeBytes,
      counts: routerBackups.counts,
      createdAt: routerBackups.createdAt,
      // Un routeur supprimé laisse routerId à NULL : la sauvegarde survit, et
      // c'est précisément le cas où elle sert.
      orphan: sql<boolean>`${routerBackups.routerId} is null`,
    })
    .from(routerBackups)
    .where(eq(routerBackups.orgId, orgId))
    .orderBy(desc(routerBackups.createdAt));
}

/** Capture les routeurs en ligne d'un coup (cron quotidien). */
export async function captureAllOnlineRouters() {
  const db = getDb();
  const online = await db
    .select({ id: routers.id, name: routers.name })
    .from(routers)
    .where(inArray(routers.status, ["online"]));

  const results: { id: string; name: string; ok: boolean; error?: string }[] = [];
  // Séquentiel : les sondes passent toutes par le même relais, et une salve de
  // connexions API concurrentes le fait tomber (voir le health-check cron).
  for (const r of online) {
    const res = await captureRouterBackup(r.id, { trigger: "auto" });
    results.push({
      id: r.id,
      name: r.name,
      ok: "success" in res && !!res.success,
      error: "error" in res ? res.error : undefined,
    });
  }
  return results;
}
