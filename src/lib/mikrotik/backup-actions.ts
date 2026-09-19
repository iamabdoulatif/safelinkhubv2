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

/**
 * Sauvegarde manuelle en TÂCHE DE FOND, suivie par getRestoreJob.
 *
 * Pourquoi : lire ~1 000 tickets sur un routeur chargé (DIAK-HSPT, L009 à
 * 95 % de CPU) dépasse les ~100 s au-delà desquels Cloudflare coupe la réponse
 * (524) — la Server Action synchrone mourait en plein vol et
 * l'UI affichait une erreur générique. Même remède que la restauration :
 * réponse immédiate, travail dans after(), sondage côté navigateur.
 *
 * ponytail: réutilise router_restore_jobs (backupId null, targetRouterId =
 * routeur sauvegardé, progress.phase = "backup") plutôt qu'une table dédiée ;
 * ajouter une colonne `kind` si un jour il faut lister les jobs par type.
 */
export async function startBackupJob(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };

  const db = getDb();
  const [router] = await db
    .select({ id: routers.id })
    .from(routers)
    .where(and(eq(routers.id, routerId), eq(routers.orgId, session.orgId)))
    .limit(1);
  if (!router) return { error: "Routeur introuvable." };

  // Une seule opération vivante par routeur (sauvegarde OU restauration) : deux
  // lectures complètes en parallèle sur un boîtier déjà à 95 % de CPU
  // étrangleraient le portail des clients connectés.
  const [running] = await db
    .select({ id: routerRestoreJobs.id, updatedAt: routerRestoreJobs.updatedAt })
    .from(routerRestoreJobs)
    .where(
      and(eq(routerRestoreJobs.targetRouterId, routerId), eq(routerRestoreJobs.status, "running")),
    )
    .orderBy(desc(routerRestoreJobs.updatedAt))
    .limit(1);
  if (running && Date.now() - running.updatedAt.getTime() < RESTORE_JOB_STALE_MS) {
    return { error: "Une opération est déjà en cours sur ce routeur — attendez qu'elle finisse." };
  }

  const [job] = await db
    .insert(routerRestoreJobs)
    .values({
      orgId: session.orgId,
      backupId: null,
      targetRouterId: routerId,
      status: "running",
      progress: { phase: "backup" },
    })
    .returning({ id: routerRestoreJobs.id });

  after(async () => {
    // Battement de cœur : la capture n'a pas d'étapes persistées, or au-delà de
    // RESTORE_JOB_STALE_MS sans écriture getRestoreJob la déclare « périmée »
    // et l'UI accuse un redémarrage du serveur. Lire ~1 000 tickets et des
    // dizaines de milliers de recettes MikHmon dépasse ces 2 min (DIAK-HSPT-ROXY).
    const heartbeat = setInterval(() => {
      db.update(routerRestoreJobs)
        .set({ updatedAt: new Date() })
        .where(eq(routerRestoreJobs.id, job.id))
        .catch(() => {
          /* best-effort */
        });
    }, 30_000);
    // captureRouterBackup ne jette pas : toute erreur revient dans `error`.
    const result = await captureRouterBackup(routerId, { trigger: "manual" }).finally(() =>
      clearInterval(heartbeat),
    );
    const failed = "error" in result && !!result.error;
    await db
      .update(routerRestoreJobs)
      .set({
        status: failed ? "error" : "done",
        error: failed ? result.error : null,
        progress: { phase: "done", backup: failed ? null : result },
        updatedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(routerRestoreJobs.id, job.id))
      .catch(() => {
        /* best-effort : la sauvegarde est en base même si le suivi échoue */
      });
  });

  return { success: true as const, jobId: job.id };
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
  purgeTarget = false,
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

  const result = await restoreBackupToRouter(backupId, targetRouterId, { dryRun, purgeTarget });

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
export async function startRestoreJob(backupId: string, targetRouterId: string, purgeTarget = false) {
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
  after(() => runRestoreJob(job.id, backupId, targetRouterId, session.orgId, purgeTarget));

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
  purgeTarget = false,
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
    // Annulation : le bouton passe le job en « cancelled » ; le moteur le relit
    // à chaque tick (au plus toutes les 5 s) et s'arrête au tick suivant.
    let lastStatusRead = 0;
    let cancelled = false;
    const shouldStop = async () => {
      if (cancelled) return true;
      const now = Date.now();
      if (now - lastStatusRead < 5000) return false;
      lastStatusRead = now;
      const [row] = await db
        .select({ status: routerRestoreJobs.status })
        .from(routerRestoreJobs)
        .where(eq(routerRestoreJobs.id, jobId))
        .limit(1)
        .catch(() => [] as { status: string }[]);
      cancelled = row?.status === "cancelled";
      return cancelled;
    };

    const result = await restoreBackupToRouter(backupId, targetRouterId, {
      dryRun: false,
      purgeTarget,
      onProgress: (p: RestoreProgress) => persist({ progress: p }),
      shouldStop,
    });

    if (cancelled) {
      await persist(
        {
          status: "cancelled",
          error: "Restauration annulée par l'opérateur — ce qui était déjà écrit reste sur le routeur, un nouveau passage le réaligne.",
          progress: { phase: "done", reports: "reports" in result ? result.reports : [], plan: "plan" in result ? result.plan : null },
          finishedAt: new Date(),
        },
        true,
      );
      markRevalidated();
      return;
    }

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

    // « Remplacer » : la cible a pris l'identité, le SSID et le nom DNS de
    // l'ancien ; le prochain sync renommera sa ligne. Sans ceci, le parc
    // afficherait DEUX routeurs du même nom — on retire l'ancien, comme le fait
    // la reprise de routeur (router-recovery-service).
    if (purgeTarget) {
      const [src] = await db
        .select({ routerId: routerBackups.routerId })
        .from(routerBackups)
        .where(eq(routerBackups.id, backupId))
        .limit(1);
      if (src?.routerId && src.routerId !== targetRouterId) {
        await db
          .update(routers)
          .set({ status: "replaced" })
          .where(and(eq(routers.id, src.routerId), eq(routers.orgId, orgId)))
          .catch(() => {
            /* best-effort : la restauration est faite, le statut se corrige à la main */
          });
      }
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
          ticketsTotal: usersReport
            ? usersReport.created + usersReport.updated + usersReport.skipped
            : undefined,
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

/** Demande l'arrêt d'une restauration en cours ; effectif au tick suivant du moteur (≤ ~200 tickets). */
export async function cancelRestoreJob(jobId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  const db = getDb();
  const [job] = await db
    .update(routerRestoreJobs)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(
      and(
        eq(routerRestoreJobs.id, jobId),
        eq(routerRestoreJobs.orgId, session.orgId),
        eq(routerRestoreJobs.status, "running"),
      ),
    )
    .returning({ id: routerRestoreJobs.id });
  if (!job) return { error: "Aucune restauration en cours à annuler." };
  return { success: true as const };
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
