import { gzipSync, gunzipSync } from "zlib";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerBackups, routers } from "@/lib/db/schema";
import { connectToRouter } from "./router-sync";
import type { RouterOSClient } from "./client";

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
};

/**
 * Sections lues. `restorable: true` = rejouée par restoreBackupToRouter ; les
 * autres sont capturées pour l'audit et la reconstruction manuelle (NAT/filter
 * référencent des interfaces propres au modèle, les rejouer à l'aveugle sur un
 * rechange d'un autre modèle produirait une config incohérente).
 */
const SECTIONS: { key: string; cmd: string; restorable?: boolean }[] = [
  // Le trésor : codes vendus, mots de passe, profil, et surtout le commentaire
  // (MikHmon y écrit la date d'expiration absolue — voir restoreHotspotUsers).
  { key: "hotspotUsers", cmd: "/ip/hotspot/user/print", restorable: true },
  { key: "hotspotUserProfiles", cmd: "/ip/hotspot/user/profile/print", restorable: true },
  { key: "walledGarden", cmd: "/ip/hotspot/walled-garden/print", restorable: true },
  { key: "walledGardenIp", cmd: "/ip/hotspot/walled-garden/ip/print", restorable: true },
  // Capturées pour référence uniquement.
  { key: "hotspotServers", cmd: "/ip/hotspot/print" },
  { key: "hotspotServerProfiles", cmd: "/ip/hotspot/profile/print" },
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

async function readSection(client: RouterOSClient, cmd: string): Promise<BackupSection> {
  const rows = await client.talk([cmd], 45000).catch(() => [] as Record<string, string>[]);
  return rows.filter((r) => !isDynamic(r));
}

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
    for (const section of SECTIONS) {
      sections[section.key] = await readSection(client, section.cmd);
    }

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
 * Idempotent par nom : ce qui existe déjà est laissé intact plutôt qu'écrasé —
 * une restauration relancée après une coupure réseau reprend là où elle en
 * était, et ne peut pas détruire un ticket déjà recréé. `dryRun` compte ce qui
 * serait fait sans rien écrire.
 */
export async function restoreBackupToRouter(
  backupId: string,
  targetRouterId: string,
  opts: { dryRun?: boolean } = {},
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
  try {
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
    };
  } finally {
    client.close();
  }

  return { success: true as const, dryRun: !!opts.dryRun, reports };
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
