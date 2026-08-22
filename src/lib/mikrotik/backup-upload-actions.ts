"use server";

import { revalidatePath } from "next/cache";
import { randomUUID } from "crypto";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { organizations, routers, routerUploadedBackups } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/net/app-url";
import { RouterOSClient } from "./client";
import { connectToRouter } from "./router-sync";
import { hashToken } from "./install-token";
import { inspectRouterOsBackup } from "./routeros-backup-file";
import {
  binaryBackupRestoreGuard,
  binaryBackupVersionVerdict,
  classifyBackupLoadOutcome,
} from "./binary-backup-restore-guard";

const PAGE = "/admin/router/backups";

/** TTL du jeton de fetch présenté par le routeur pendant la restauration. */
const FETCH_TOKEN_TTL_MS = 5 * 60 * 1000;
const RESTORE_FILE_NAME = "slh-restore";

/**
 * Reçoit un fichier `.backup` binaire uploadé, le valide (magic RouterOS, taille,
 * chiffrement) et le stocke en base64. Refuse tout ce qui n'est pas une vraie
 * sauvegarde RouterOS pour ne jamais pousser un blob arbitraire vers un routeur.
 */
export async function uploadRouterBackup(formData: FormData) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Aucun fichier reçu." };

  const buf = new Uint8Array(await file.arrayBuffer());
  const inspection = inspectRouterOsBackup(buf);
  if (!inspection.valid) return { error: inspection.error ?? "Fichier invalide." };

  const db = getDb();
  const [row] = await db
    .insert(routerUploadedBackups)
    .values({
      orgId: session.orgId,
      uploadedByEmail: session.email ?? null,
      uploadedByName: session.name ?? null,
      fileName: file.name || "sauvegarde.backup",
      sizeBytes: inspection.sizeBytes,
      encrypted: inspection.encrypted,
      data: Buffer.from(buf).toString("base64"),
    })
    .returning({ id: routerUploadedBackups.id });

  revalidatePath(PAGE);
  return {
    success: true as const,
    id: row.id,
    encrypted: inspection.encrypted,
    sizeBytes: inspection.sizeBytes,
  };
}

/** Liste des sauvegardes uploadées de l'org (SANS le blob, pour l'affichage). */
export async function getOrgUploadedBackups() {
  const session = await getSession();
  if (!session) return [];
  const db = getDb();
  return db
    .select({
      id: routerUploadedBackups.id,
      fileName: routerUploadedBackups.fileName,
      sizeBytes: routerUploadedBackups.sizeBytes,
      encrypted: routerUploadedBackups.encrypted,
      uploadedByName: routerUploadedBackups.uploadedByName,
      createdAt: routerUploadedBackups.createdAt,
    })
    .from(routerUploadedBackups)
    .where(eq(routerUploadedBackups.orgId, session.orgId))
    .orderBy(desc(routerUploadedBackups.createdAt));
}

export async function deleteUploadedBackup(id: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const db = getDb();
  await db
    .delete(routerUploadedBackups)
    .where(and(eq(routerUploadedBackups.id, id), eq(routerUploadedBackups.orgId, session.orgId)));
  revalidatePath(PAGE);
  return { success: true as const };
}

async function loadUploadedAndTarget(uploadedId: string, targetRouterId: string, orgId: string, role: string) {
  const db = getDb();
  const [uploaded] = await db
    .select()
    .from(routerUploadedBackups)
    .where(and(eq(routerUploadedBackups.id, uploadedId), eq(routerUploadedBackups.orgId, orgId)))
    .limit(1);
  if (!uploaded) return { error: "Sauvegarde uploadée introuvable." as const };

  const [target] = await db
    .select()
    .from(routers)
    .where(eq(routers.id, targetRouterId))
    .limit(1);
  if (!target || (target.orgId !== orgId && !isSuperAdmin(role))) {
    return { error: "Routeur cible introuvable." as const };
  }
  return { uploaded, target };
}

/**
 * SIMULATION (lecture seule) : lit le modèle/identité du routeur cible et rend le
 * plan + les avertissements, SANS rien écrire. À faire avant toute restauration.
 */
export async function scanUploadedBackupRestore(uploadedId: string, targetRouterId: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const loaded = await loadUploadedAndTarget(uploadedId, targetRouterId, session.orgId, session.role);
  if ("error" in loaded) return { error: loaded.error };
  const { uploaded, target } = loaded;

  let client: RouterOSClient;
  try {
    client = await connectToRouter(target);
  } catch (err) {
    return {
      error:
        err instanceof Error
          ? `Routeur cible injoignable : ${err.message}. Il doit être en ligne pour simuler la restauration.`
          : "Routeur cible injoignable (doit être en ligne).",
    };
  }
  try {
    const [res] = await client.talk(["/system/resource/print"], 15000).catch(() => []);
    const [rb] = await client.talk(["/system/routerboard/print"], 15000).catch(() => []);
    const targetBoard = res?.["board-name"] ?? rb?.["board-name"] ?? "?";
    const targetVersion = res?.version ?? "?";

    const warnings: string[] = [
      "Un « /system backup load » remplace TOUTE la configuration du routeur cible par celle de la sauvegarde (interfaces, IP, users, WiFi, portail…).",
      "Cette fonction est réservée au MÊME routeur physique : une sauvegarde binaire restaure aussi les adresses MAC et l'identité. Elle ne doit jamais servir à migrer vers un routeur de remplacement, même de même modèle.",
      // La version n'a PAS à être identique — seul le sens compte. Annoncer
      // l'inverse faisait déclarer incompatible un cas que RouterOS accepte
      // (sauvegarde 7.8 sur un routeur passé en 7.24).
      "La sauvegarde peut venir d'une version RouterOS plus ANCIENNE : RouterOS migre la configuration au chargement. L'inverse (sauvegarde plus récente que le routeur) et le passage d'une branche majeure à l'autre ne sont pas pris en charge.",
      "Pour migrer tickets, profils et portail vers un autre MikroTik, utilisez la sauvegarde SafeLinkHub (logique), qui restaure les données sans écraser les interfaces, WiFi ni tunnel.",
    ];
    if (uploaded.encrypted) {
      warnings.push("Cette sauvegarde semble CHIFFRÉE : le mot de passe du backup sera requis à la restauration.");
    }

    return {
      success: true as const,
      plan: {
        fileName: uploaded.fileName,
        sizeBytes: uploaded.sizeBytes,
        encrypted: uploaded.encrypted,
        targetBoard,
        targetVersion,
        targetName: target.name,
      },
      warnings,
    };
  } finally {
    client.close();
  }
}

/**
 * RESTAURATION RÉELLE d'une sauvegarde binaire sur le routeur cible : pousse le
 * fichier via /tool fetch (URL tokenisée), puis /system backup load → le routeur
 * REDÉMARRE (le tunnel tombe, c'est attendu). N'exécute AUCUN self-heal en ligne
 * (le canal distant est justement coupé par le reboot) : renvoie les étapes de
 * ré-adoption. Synchrone mais bref (~10–30 s), bien en deçà de la coupure
 * Cloudflare.
 */
export async function restoreUploadedBackup(
  uploadedId: string,
  targetRouterId: string,
  opts: {
    backupPassword?: string;
    sameDeviceConfirmed?: boolean;
    /** Version RouterOS d'origine de la sauvegarde, déclarée par l'opérateur. */
    sourceRouterOsVersion?: string;
  } = {},
) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  // Le volet « même appareil » se tranche sans le routeur ; le volet version
  // exige de LIRE la cible, donc il attend la connexion, plus bas.
  const sameDevice = binaryBackupRestoreGuard({ sameDeviceConfirmed: opts.sameDeviceConfirmed === true });
  if (!sameDevice.ok) return { error: sameDevice.error };

  const loaded = await loadUploadedAndTarget(uploadedId, targetRouterId, session.orgId, session.role);
  if ("error" in loaded) return { error: loaded.error };
  const { uploaded, target } = loaded;

  const db = getDb();
  const [org] = await db
    .select({ slug: organizations.slug })
    .from(organizations)
    .where(eq(organizations.id, uploaded.orgId))
    .limit(1);
  if (!org) return { error: "Organisation introuvable." };

  // Jeton one-shot que le routeur présentera pour récupérer le binaire.
  const fetchToken = randomUUID();
  await db
    .update(routerUploadedBackups)
    .set({
      fetchTokenHash: hashToken(fetchToken),
      fetchTokenExpiresAt: new Date(Date.now() + FETCH_TOKEN_TTL_MS),
    })
    .where(eq(routerUploadedBackups.id, uploaded.id));

  const clearToken = () =>
    db
      .update(routerUploadedBackups)
      .set({ fetchTokenHash: null, fetchTokenExpiresAt: null })
      .where(eq(routerUploadedBackups.id, uploaded.id))
      .catch(() => {});

  const appUrl = getAppUrl();
  const url = `${appUrl}/api/router/v1/${org.slug}/uploaded-backup/${uploaded.id}`;
  const mode = url.startsWith("https://") ? "https" : "http";

  let client: RouterOSClient;
  try {
    client = await connectToRouter(target);
  } catch (err) {
    await clearToken();
    return {
      error:
        err instanceof Error
          ? `Routeur cible injoignable : ${err.message}. Il doit être en ligne pour la restauration.`
          : "Routeur cible injoignable (doit être en ligne).",
    };
  }

  try {
    // [0] Compatibilité de version, sur la version LUE en direct — pas sur une
    //     case à cocher. Avant le transfert : inutile de pousser 9 Mo vers un
    //     routeur qui refusera le chargement.
    const [resource] = await client.talk(["/system/resource/print"], 15000).catch(() => []);
    const verdict = binaryBackupVersionVerdict({
      sourceVersion: opts.sourceRouterOsVersion ?? null,
      targetVersion: resource?.version ?? null,
    });
    if (verdict.kind === "blocked") {
      await clearToken();
      return { error: verdict.message };
    }

    // [1] Récupération du binaire sur le routeur (bloque jusqu'à la fin).
    try {
      await client.talk(
        [
          "/tool/fetch",
          `=url=${url}`,
          `=http-header-field=Authorization: Bearer ${fetchToken}`,
          `=dst-path=${RESTORE_FILE_NAME}.backup`,
          `=mode=${mode}`,
        ],
        90000,
      );
    } catch (err) {
      await clearToken();
      return {
        error: `Le routeur n'a pas pu récupérer la sauvegarde (${err instanceof Error ? err.message : "fetch échoué"}). Vérifiez qu'il atteint ${appUrl} (WAN/DNS).`,
      };
    }

    // [2] Vérifie que le fichier est bien arrivé avant de charger.
    const files = await client
      .talk(["/file/print", `?name=${RESTORE_FILE_NAME}.backup`], 15000)
      .catch(() => []);
    if (files.length === 0) {
      await clearToken();
      return { error: "La sauvegarde n'apparaît pas sur le routeur après le transfert — restauration annulée." };
    }

    // [3] Chargement : REDÉMARRE le routeur. La connexion API tombe pendant le
    //     reboot → l'erreur/timeout qui suit est ATTENDU, pas un échec.
    const loadWords = [
      "/system/backup/load",
      `=name=${RESTORE_FILE_NAME}`,
    ];
    if (opts.backupPassword) loadWords.push(`=password=${opts.backupPassword}`);
    // Un refus (`!trap`) et un redémarrage (transport coupé) remontent tous
    // deux en exception. Les confondre — ce que faisait `.catch(() => {})` —
    // annonçait « le routeur redémarre » alors que RouterOS venait de refuser
    // le fichier et n'avait rien fait.
    const issue = await client
      .talk(loadWords, 12000)
      .then(() => null)
      .catch((err: unknown) => classifyBackupLoadOutcome(err));
    if (issue && !issue.rebooting) {
      await clearToken();
      return {
        error: `RouterOS a refusé la sauvegarde : ${issue.routerMessage}. Le routeur n'a pas redémarré et sa configuration est intacte.`,
      };
    }

    await clearToken();
    return {
      success: true as const,
      summary: `Sauvegarde « ${uploaded.fileName} » chargée sur ${target.name} — le routeur REDÉMARRE. Il revient avec l'identité de la sauvegarde, donc son tunnel actuel tombe.`,
      nextSteps: [
        "Attendez ~2 min le redémarrage complet du routeur.",
        "Sur place / même LAN, recollez la commande d'installation SafeLinkHub (Réglages → Ajouter un routeur) pour réattribuer son identité propre.",
        "Lancez ensuite le Diagnostic du routeur et appliquez les correctifs (droits API MikHmon, walled-garden, canal WiFi) pour rétablir portail + code.",
      ],
    };
  } catch (err) {
    await clearToken();
    return {
      error: err instanceof Error ? `Restauration interrompue : ${err.message}` : "Restauration interrompue.",
    };
  } finally {
    client.close();
  }
}
