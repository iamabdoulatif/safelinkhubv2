"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerBackups, routerRestoreJobs, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { installTemplateOnRouter } from "@/lib/captive-templates/actions";
import {
  captureRouterBackup,
  listOrgBackups,
  restoreBackupToRouter,
  scanRestoreTarget,
  type RestoreProgress,
} from "./router-backup";

const PAGE = "/admin/router/backups";

// Un job « running » dont le heartbeat (updatedAt) n'a pas bougé depuis ce délai
// est considéré périmé : le conteneur a redémarré en pleine restauration. L'UI le
// signale et autorise une relance (la restauration est idempotente).
const RESTORE_JOB_STALE_MS = 120_000;

/** Sauvegarde immédiate d'un routeur (bouton « Sauvegarder maintenant »). */
export async function backupRouterNow(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  // Garde d'org : sans elle, un routerId deviné suffirait à siphonner les
  // tickets d'un autre opérateur.
  const [router] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  const result = await captureRouterBackup(routerId, { trigger: "manual" });
  if ("error" in result && result.error) return { error: result.error };

  revalidatePath(PAGE);
  return result;
}

/**
 * Restaure une sauvegarde sur un routeur cible (le rechange).
 *
 * `dryRun` est proposé dans l'UI avant toute écriture : sur ~5 000 tickets, on
 * veut voir ce qui va être créé avant de le faire.
 */
export async function restoreBackup(
  backupId: string,
  targetRouterId: string,
  dryRun: boolean,
) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [backup] = await db
    .select({ id: routerBackups.id })
    .from(routerBackups)
    .where(and(eq(routerBackups.id, backupId), eq(routerBackups.orgId, session.orgId)))
    .limit(1);
  if (!backup) return { error: "Sauvegarde introuvable." };

  const [target] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, targetRouterId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!target) return { error: "Routeur cible introuvable." };

  const result = await restoreBackupToRouter(backupId, targetRouterId, { dryRun });

  // Le portail captif est la dernière étape, et elle est indispensable : ses
  // fichiers ne sont pas dans la sauvegarde (ils vivent sur la flash), donc sans
  // ça le rechange servirait la page de connexion RouterOS par défaut — ni
  // forfaits, ni paiement. installTemplateOnRouter repose les fichiers, règle le
  // html-directory, le walled-garden, et adopte au passage les profils tout
  // juste restaurés comme forfaits (import v70) : les prix affichés sont donc
  // ceux du routeur, pas les tarifs legacy de l'org.
  let portal: { installed: boolean; templateName?: string | null; error?: string } | undefined;
  const templateId =
    "plan" in result && result.plan ? result.plan.portal.templateId : null;
  if (!dryRun && "success" in result && result.success && templateId) {
    const install = await installTemplateOnRouter(targetRouterId, templateId);
    portal =
      install && "error" in install && install.error
        ? { installed: false, error: install.error }
        : {
            installed: true,
            templateName: "plan" in result ? result.plan.portal.templateName : null,
          };
  }

  if (!dryRun) revalidatePath(PAGE);
  return { ...result, portal };
}

/**
 * Lance une restauration RÉELLE en tâche de fond et rend aussitôt un identifiant
 * de job. Le navigateur interroge ensuite getRestoreJob.
 *
 * Pourquoi asynchrone : recréer des milliers de tickets un par un prend plusieurs
 * minutes, or safelinkhub.io passe par Cloudflare, qui coupe toute réponse
 * d'origine au-delà de ~100 s (524). Une Server Action synchrone était donc tuée
 * en plein vol et l'UI tombait sur la frontière d'erreur générique. Ici la réponse
 * part en quelques millisecondes (Cloudflare est content) et le vrai travail
 * tourne dans after(), hors du cycle requête/réponse. La simulation (dryRun) et le
 * scan restent synchrones : ce sont des lectures brèves, bien en deçà des 100 s.
 */
export async function startRestoreJob(backupId: string, targetRouterId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  // Mêmes gardes d'org que restoreBackup : un id deviné ne doit pas donner accès
  // à la sauvegarde ou au routeur d'un autre opérateur.
  const [backup] = await db
    .select({ id: routerBackups.id })
    .from(routerBackups)
    .where(and(eq(routerBackups.id, backupId), eq(routerBackups.orgId, session.orgId)))
    .limit(1);
  if (!backup) return { error: "Sauvegarde introuvable." };

  const [target] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, targetRouterId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!target) return { error: "Routeur cible introuvable." };

  // Un seul job actif par rechange : deux restaurations simultanées sur le même
  // routeur se marcheraient dessus (doublons, CPU à 100 %).
  const [running] = await db
    .select({ id: routerRestoreJobs.id, updatedAt: routerRestoreJobs.updatedAt })
    .from(routerRestoreJobs)
    .where(
      and(
        eq(routerRestoreJobs.targetRouterId, targetRouterId),
        eq(routerRestoreJobs.status, "running"),
      ),
    )
    .orderBy(desc(routerRestoreJobs.updatedAt))
    .limit(1);
  if (running && Date.now() - running.updatedAt.getTime() < RESTORE_JOB_STALE_MS) {
    return {
      error: "Une restauration est déjà en cours sur ce routeur — attendez qu'elle finisse.",
      jobId: running.id,
    };
  }

  const [job] = await db
    .insert(routerRestoreJobs)
    .values({
      orgId: session.orgId,
      backupId,
      targetRouterId,
      status: "running",
      progress: { phase: "remodel", reports: [], plan: null },
    })
    .returning({ id: routerRestoreJobs.id });

  // after() exécute le callback APRÈS l'envoi de la réponse : la restauration
  // longue tourne alors sans qu'aucune requête HTTP ne l'attende. orgId est
  // capturée ici et passée explicitement (le cookie de session n'existera plus
  // dans le job).
  after(() => runRestoreJob(job.id, backupId, targetRouterId, session.orgId));

  return { success: true as const, jobId: job.id };
}

/**
 * Le travail de fond. NON exporté : dans un fichier "use server", seul du code
 * non exporté échappe au traitement « Server Action ». Écrit son avancement dans
 * la ligne de job à chaque étape ; ne jette jamais — toute erreur devient un
 * statut "error" lisible par l'UI.
 */
async function runRestoreJob(
  jobId: string,
  backupId: string,
  targetRouterId: string,
  orgId: string,
) {
  const db = getDb();
  let lastWrite = 0;

  const persist = async (
    patch: {
      status?: string;
      error?: string;
      progress?: unknown;
      finishedAt?: Date;
    },
    force = false,
  ) => {
    // Throttle : pendant les tickets, un tick toutes les ~200 écritures suffit à
    // une barre fluide ; inutile de marteler la base à chaque persistance.
    const now = Date.now();
    if (!force && now - lastWrite < 1500) return;
    lastWrite = now;
    await db
      .update(routerRestoreJobs)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(routerRestoreJobs.id, jobId))
      .catch(() => {
        /* best-effort : la restauration continue même si le suivi échoue */
      });
  };

  const markRevalidated = () => {
    try {
      revalidatePath(PAGE);
    } catch {
      /* hors contexte de requête : l'UI se rafraîchit de toute façon au polling */
    }
  };

  try {
    const result = await restoreBackupToRouter(backupId, targetRouterId, {
      dryRun: false,
      onProgress: (p: RestoreProgress) => persist({ progress: p }),
    });

    if ("error" in result && result.error) {
      // Refus pour blocage, connexion perdue, restauration interrompue… tout ce
      // que le moteur signale au lieu de jeter.
      await persist(
        {
          status: "error",
          error: result.error,
          progress: {
            phase: "done",
            reports: "reports" in result ? result.reports : [],
            plan: "plan" in result ? result.plan : null,
          },
          finishedAt: new Date(),
        },
        true,
      );
      markRevalidated();
      return;
    }

    const plan = "plan" in result ? result.plan : null;
    const reports = ("reports" in result ? result.reports : []) ?? [];

    // Portail captif : dernière étape, indispensable (ses fichiers vivent sur la
    // flash, pas dans la sauvegarde). Voir le commentaire dans restoreBackup.
    let portal: { installed: boolean; templateName?: string | null; error?: string } | undefined;
    const templateId = plan ? plan.portal.templateId : null;
    if (templateId) {
      const install = await installTemplateOnRouter(targetRouterId, templateId, { orgId });
      portal =
        install && "error" in install && install.error
          ? { installed: false, error: install.error }
          : { installed: true, templateName: plan?.portal.templateName ?? null };
    }

    const usersReport = reports.find((r) => r.section === "hotspotUsers");
    await persist(
      {
        status: "done",
        progress: {
          phase: "done",
          reports,
          plan,
          portal,
          ticketsTotal: usersReport ? usersReport.created + usersReport.skipped : undefined,
        },
        finishedAt: new Date(),
      },
      true,
    );
    markRevalidated();
  } catch (err) {
    await persist(
      {
        status: "error",
        error: err instanceof Error ? `Restauration interrompue : ${err.message}` : "Restauration interrompue.",
        finishedAt: new Date(),
      },
      true,
    );
    markRevalidated();
  }
}

/**
 * État courant d'un job de restauration, interrogé par le navigateur toutes les
 * ~2,5 s. `stale` = job « running » dont le heartbeat est figé : le conteneur a
 * redémarré, on peut relancer.
 */
export async function getRestoreJob(jobId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [job] = await db
    .select({
      id: routerRestoreJobs.id,
      status: routerRestoreJobs.status,
      progress: routerRestoreJobs.progress,
      error: routerRestoreJobs.error,
      updatedAt: routerRestoreJobs.updatedAt,
    })
    .from(routerRestoreJobs)
    .where(and(eq(routerRestoreJobs.id, jobId), eq(routerRestoreJobs.orgId, session.orgId)))
    .limit(1);
  if (!job) return { error: "Job de restauration introuvable." };

  const stale =
    job.status === "running" && Date.now() - job.updatedAt.getTime() > RESTORE_JOB_STALE_MS;

  return {
    success: true as const,
    status: job.status,
    progress: job.progress,
    error: job.error,
    stale,
  };
}

/**
 * Scan matériel du rechange + plan d'adaptation. Lecture seule — c'est l'étape
 * à faire AVANT de restaurer, pour savoir si ce boîtier peut reprendre l'ancien.
 */
export async function scanTargetForRestore(backupId: string, targetRouterId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [backup] = await db
    .select({ id: routerBackups.id })
    .from(routerBackups)
    .where(and(eq(routerBackups.id, backupId), eq(routerBackups.orgId, session.orgId)))
    .limit(1);
  if (!backup) return { error: "Sauvegarde introuvable." };

  const [target] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, targetRouterId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!target) return { error: "Routeur cible introuvable." };

  return scanRestoreTarget(backupId, targetRouterId);
}

export async function deleteBackup(backupId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  await db
    .delete(routerBackups)
    .where(and(eq(routerBackups.id, backupId), eq(routerBackups.orgId, session.orgId)));

  revalidatePath(PAGE);
  return { success: true as const };
}

export async function getOrgBackups() {
  const session = await getSession();
  if (!session) return [];
  return listOrgBackups(session.orgId);
}
