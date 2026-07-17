import { gzipSync, gunzipSync } from "zlib";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { bridges, captiveTemplates, routerBackups, routers } from "@/lib/db/schema";
import { connectToRouter } from "./router-sync";
import type { RouterOSClient } from "./client";
import { applySsid, primarySsid, readWifiState, type WifiApi } from "./wifi-compat";
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

/** Retenues par routeur ; au-delà, les plus anciennes sont purgées. */
export const BACKUP_RETENTION = 7;

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
const SECTIONS: { key: string; cmd: string; restorable?: boolean; proplist?: string[] }[] = [
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
  { key: "walledGarden", cmd: "/ip/hotspot/walled-garden/print", restorable: true },
  { key: "walledGardenIp", cmd: "/ip/hotspot/walled-garden/ip/print", restorable: true },
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
  { key: "schedulers", cmd: "/system/scheduler/print" },
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
): Promise<{ rows: BackupSection; error?: string }> {
  try {
    const words = proplist ? [cmd, `=.proplist=${proplist.join(",")}`] : [cmd];
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
      const { rows, error } = await readSection(client, section.cmd, section.proplist);
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
  failed: { name: string; error: string }[];
};

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
  opts: { dryRun?: boolean; force?: boolean } = {},
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
        dryRun: opts.dryRun,
      }),
    );
    reports.push(
      await restoreHotspotUsers(client, snapshot.sections.hotspotUsers ?? [], opts.dryRun),
    );
    reports.push(
      await restoreWalledGarden(client, snapshot.sections.walledGarden ?? [], opts.dryRun),
    );
    reports.push(
      await restoreWalledGardenIp(client, snapshot.sections.walledGardenIp ?? [], opts.dryRun),
    );
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
  },
): Promise<RestoreReport> {
  const report: RestoreReport = { section: args.section, created: 0, skipped: 0, failed: [] };
  const existing = await client
    .talk([args.listCmd], 45000)
    .catch(() => [] as Record<string, string>[]);
  const known = new Set(existing.map((r) => r.name).filter(Boolean));

  for (const row of args.rows) {
    const name = row.name;
    if (!name) continue;
    // Le profil "default" est livré avec RouterOS : il existe toujours, et
    // tenter de le recréer échoue systématiquement.
    if (known.has(name) || name === "default") {
      report.skipped++;
      continue;
    }
    if (args.dryRun) {
      report.created++;
      known.add(name);
      continue;
    }
    try {
      await client.talk([args.addCmd, ...pick(row, args.fields)], 30000);
      report.created++;
      known.add(name);
    } catch (err) {
      report.failed.push({ name, error: err instanceof Error ? err.message : "Erreur inconnue" });
    }
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
  });
}

/** Walled-garden HTTP : identifié par dst-host (pas de champ "name"). */
async function restoreWalledGarden(
  client: RouterOSClient,
  rows: BackupSection,
  dryRun?: boolean,
): Promise<RestoreReport> {
  const report: RestoreReport = { section: "walledGarden", created: 0, skipped: 0, failed: [] };
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
  const report: RestoreReport = { section: "walledGardenIp", created: 0, skipped: 0, failed: [] };
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
