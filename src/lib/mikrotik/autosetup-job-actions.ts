"use server";

import { after } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRestoreJobs, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getAutoSetupGateStatus } from "@/lib/billing/auto-setup-authorization-actions";
import { provisionHotspotStack, type HotspotStackOptions } from "./container-setup";

/**
 * Auto-setup en TÂCHE DE FOND, suivi par getRestoreJob.
 *
 * Pourquoi : provisionHotspotStack enchaîne des centaines de commandes
 * RouterOS (et le téléchargement de MikHmon) ; sur un routeur lent ou un
 * tunnel chargé, l'appel dépasse les ~100 s au-delà desquels Cloudflare coupe
 * la réponse (524) — le navigateur perdait alors le résultat d'une
 * configuration pourtant posée. Même remède que la sauvegarde et la
 * restauration : réponse immédiate, travail dans after(), sondage court.
 *
 * Bonus : le moteur signale chaque étape qu'il attaque (hooks.onStep), l'écran
 * affiche donc un avancement RÉEL au lieu d'une attente muette.
 *
 * ponytail: réutilise router_restore_jobs (progress.phase = "autosetup"),
 * comme startBackupJob ; une colonne `kind` le jour où il faut lister les jobs
 * par type. Le verrou « une opération vivante par routeur » vaut ainsi aussi
 * entre auto-setup, sauvegarde et restauration.
 */

// Même seuil que backup-actions : sans battement de cœur depuis 2 min, le
// conteneur a redémarré en plein travail.
const JOB_STALE_MS = 120_000;

export type AutoSetupJobProgress = {
  phase: "autosetup";
  /** Étape en cours (AUTOSETUP_STEPS), ou "done" une fois terminé. */
  step: string;
  result?: Awaited<ReturnType<typeof provisionHotspotStack>>;
};

export async function startAutoSetupJob(routerId: string, opts: HotspotStackOptions) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  const router = await ownedRouter(routerId, session);
  if (!router) return { error: "Routeur introuvable." };
  return enqueue(session.orgId, routerId, opts, { precheckGate: true });
}

/**
 * « Continuer l'auto-setup » du bandeau d'audit : rejoue la dernière
 * configuration enregistrée, sans redémarrage, dans le même job asynchrone.
 * Pas de pré-contrôle de paiement : un routeur déjà configuré par ce compte
 * se relance gratuitement, et le moteur tranche de toute façon.
 */
export async function startRepairJob(routerId: string) {
  const session = await getSession();
  if (!session) return { error: "Not authenticated." };
  const router = await ownedRouter(routerId, session);
  if (!router) return { error: "Routeur introuvable." };
  if (!router.lastAutoSetupConfig) {
    return {
      error:
        "Aucune configuration d'auto-setup enregistrée pour ce routeur — lancez d'abord l'assistant complet (Configuration routeur) une fois avant de pouvoir réparer une étape manquante.",
    };
  }
  return enqueue(
    session.orgId,
    routerId,
    { ...(router.lastAutoSetupConfig as HotspotStackOptions), reboot: false },
    { precheckGate: false },
  );
}

async function ownedRouter(
  routerId: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
) {
  const [router] = await getDb()
    .select({ id: routers.id, orgId: routers.orgId, lastAutoSetupConfig: routers.lastAutoSetupConfig })
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  return router && (router.orgId === session.orgId || isSuperAdmin(session.role)) ? router : null;
}

async function enqueue(
  orgId: string,
  routerId: string,
  opts: HotspotStackOptions,
  { precheckGate }: { precheckGate: boolean },
) {
  const db = getDb();

  const [running] = await db
    .select({
      id: routerRestoreJobs.id,
      updatedAt: routerRestoreJobs.updatedAt,
      progress: routerRestoreJobs.progress,
    })
    .from(routerRestoreJobs)
    .where(
      and(eq(routerRestoreJobs.targetRouterId, routerId), eq(routerRestoreJobs.status, "running")),
    )
    .orderBy(desc(routerRestoreJobs.updatedAt))
    .limit(1);
  if (running && Date.now() - running.updatedAt.getTime() < JOB_STALE_MS) {
    // Rechargement de page pendant l'installation : on RACCROCHE au job en
    // cours au lieu d'en lancer un second sur le même routeur.
    if ((running.progress as { phase?: string } | null)?.phase === "autosetup") {
      return { success: true as const, jobId: running.id, resumed: true };
    }
    return { error: "Une opération est déjà en cours sur ce routeur — attendez qu'elle finisse." };
  }

  // La porte de paiement est revérifiée par provisionHotspotStack ; ce
  // pré-contrôle ne sert qu'à répondre TOUT DE SUITE au navigateur, qui repasse
  // alors en attente de confirmation au lieu d'ouvrir un job voué à l'échec.
  if (precheckGate) {
    const gate = await getAutoSetupGateStatus(routerId);
    if (!gate.superadmin && !gate.authorized) return { needsAuthorization: true as const };
  }

  const [job] = await db
    .insert(routerRestoreJobs)
    .values({
      orgId,
      backupId: null,
      targetRouterId: routerId,
      status: "running",
      progress: { phase: "autosetup", step: "connect" } satisfies AutoSetupJobProgress,
    })
    .returning({ id: routerRestoreJobs.id });

  after(async () => {
    const touch = (progress?: AutoSetupJobProgress) =>
      db
        .update(routerRestoreJobs)
        .set({ updatedAt: new Date(), ...(progress ? { progress } : {}) })
        .where(eq(routerRestoreJobs.id, job.id));
    // MikHmon peut télécharger plusieurs minutes sans changer d'étape.
    const heartbeat = setInterval(() => {
      touch().catch(() => {
        /* best-effort */
      });
    }, 30_000);

    let result: AutoSetupJobProgress["result"];
    try {
      result = await provisionHotspotStack(routerId, opts, {
        onStep: async (step) => {
          await touch({ phase: "autosetup", step });
        },
      });
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "Erreur inattendue." };
    } finally {
      clearInterval(heartbeat);
    }

    const failed = !result || ("error" in result && !!result.error) || "needsAuthorization" in result;
    await db
      .update(routerRestoreJobs)
      .set({
        status: failed ? "error" : "done",
        error: failed
          ? result && "error" in result && result.error
            ? result.error
            : "Paiement non confirmé."
          : null,
        progress: { phase: "autosetup", step: "done", result } satisfies AutoSetupJobProgress,
        updatedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(routerRestoreJobs.id, job.id))
      .catch(() => {
        /* best-effort : la configuration est sur le routeur même si le suivi échoue */
      });
  });

  return { success: true as const, jobId: job.id, resumed: false };
}
