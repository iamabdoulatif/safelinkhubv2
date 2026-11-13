"use server";

import { after } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRestoreJobs, routers } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import type { RouterOSClient } from "./client";
import {
  isKnownArch,
  npkFileName,
  npkUrl,
  validateDowngradeTarget,
} from "./routeros-downgrade";

/**
 * Rétrograder RouterOS (ex. 7.25 → 7.8) en TÂCHE DE FOND.
 *
 * Pourquoi asynchrone : le téléchargement du .npk combiné (~15–25 Mo) par le WAN
 * du routeur, puis le `downgrade` qui redémarre, dépassent les ~100 s au-delà
 * desquels Cloudflare coupe une réponse. Même patron que l'auto-setup / la
 * restauration : réponse immédiate, travail dans after(), suivi par getRestoreJob
 * (progress.phase = "downgrade"), battement de cœur pendant le téléchargement.
 */

const JOB_STALE_MS = 120_000;
// Le routeur télécharge depuis download.mikrotik.com par son propre WAN : sur un
// lien chargé c'est long, mais ça ne passe pas par Cloudflare. On laisse une
// large fenêtre, le battement de cœur garde le job frais.
const FETCH_TIMEOUT_MS = 6 * 60 * 1000;

export type DowngradeJobProgress = {
  phase: "downgrade";
  /** "connect" | "detect" | "download" | "verify" | "reboot" | "done" */
  step: string;
  result?: {
    error?: string;
    rebooting?: boolean;
    from?: string;
    to?: string;
    arch?: string;
  };
};

async function ownedRouter(
  routerId: string,
  session: NonNullable<Awaited<ReturnType<typeof getSession>>>,
) {
  const [router] = await getDb()
    .select()
    .from(routers)
    .where(eq(routers.id, routerId))
    .limit(1);
  return router && (router.orgId === session.orgId || isSuperAdmin(session.role)) ? router : null;
}

export async function startRouterOsDowngradeJob(routerId: string, targetVersion: string) {
  const session = await getSession();
  if (!session) return { error: "Non authentifié." };
  const router = await ownedRouter(routerId, session);
  if (!router) return { error: "Routeur introuvable." };

  // Garde-fou de FORMAT tout de suite (7.x, lisible) : une saisie absurde est
  // rejetée sans ouvrir de job. Le contrôle « strictement inférieur à la version
  // actuelle » se refait dans after() une fois la version réelle lue.
  const format = validateDowngradeTarget(targetVersion, null);
  if (!format.ok) return { error: format.error };

  const db = getDb();
  const [running] = await db
    .select({ id: routerRestoreJobs.id, updatedAt: routerRestoreJobs.updatedAt })
    .from(routerRestoreJobs)
    .where(and(eq(routerRestoreJobs.targetRouterId, routerId), eq(routerRestoreJobs.status, "running")))
    .orderBy(desc(routerRestoreJobs.updatedAt))
    .limit(1);
  if (running && Date.now() - running.updatedAt.getTime() < JOB_STALE_MS) {
    return { error: "Une opération est déjà en cours sur ce routeur — attendez qu'elle finisse." };
  }

  const [job] = await db
    .insert(routerRestoreJobs)
    .values({
      orgId: router.orgId,
      backupId: null,
      targetRouterId: routerId,
      status: "running",
      progress: { phase: "downgrade", step: "connect" } satisfies DowngradeJobProgress,
    })
    .returning({ id: routerRestoreJobs.id });

  after(async () => {
    const touch = (progress?: DowngradeJobProgress) =>
      db
        .update(routerRestoreJobs)
        .set({ updatedAt: new Date(), ...(progress ? { progress } : {}) })
        .where(eq(routerRestoreJobs.id, job.id));
    const heartbeat = setInterval(() => {
      touch().catch(() => {});
    }, 30_000);

    let result: DowngradeJobProgress["result"];
    let client: RouterOSClient | null = null;
    try {
      client = await connectToRouter(router);
      await touch({ phase: "downgrade", step: "detect" });

      const [resource] = await client.talk(["/system/resource/print"], 20000);
      const current = resource?.version ?? null;
      const arch = String(resource?.["architecture-name"] ?? "").trim();

      const v = validateDowngradeTarget(targetVersion, current);
      if (!v.ok) throw new Error(v.error);
      if (!isKnownArch(arch)) {
        throw new Error(
          `Architecture du routeur inconnue (« ${arch || "?"} ») : impossible de choisir le bon paquet. Rétrogradation annulée.`,
        );
      }

      const file = npkFileName(v.version, arch);
      const url = npkUrl(v.version, arch);

      // Le routeur télécharge lui-même par son WAN, en HTTPS, vers sa racine.
      await touch({ phase: "downgrade", step: "download" });
      await client.talk(["/tool/fetch", `=url=${url}`, `=dst-path=${file}`, "=mode=https"], FETCH_TIMEOUT_MS);

      // Paquet réellement présent et de taille plausible (un .npk combiné fait
      // plusieurs Mo). Un fichier minuscule = téléchargement avorté (WAN coupé,
      // 404, filtrage) : on refuse de lancer un downgrade sur un paquet tronqué.
      await touch({ phase: "downgrade", step: "verify" });
      const [onDisk] = await client.talk(["/file/print", `?name=${file}`], 20000);
      const size = Number(onDisk?.size);
      if (!onDisk) {
        throw new Error("Le paquet n'est pas arrivé sur le routeur — vérifiez son accès à download.mikrotik.com.");
      }
      if (Number.isFinite(size) && size < 5_000_000) {
        throw new Error(`Paquet incomplet (${size} o) — téléchargement interrompu. Réessayez, de préférence hors des heures de pointe.`);
      }

      // `downgrade` installe la version plus ancienne ET redémarre. La connexion
      // tombe pendant le reboot : une erreur APRÈS l'envoi est donc ATTENDUE et
      // ne doit pas être signalée comme un échec.
      await touch({ phase: "downgrade", step: "reboot" });
      try {
        await client.talk(["/system/package/downgrade"], 15000);
      } catch {
        // connexion coupée par le redémarrage — comportement normal.
      }
      result = { rebooting: true, from: current ?? undefined, to: v.version, arch };
    } catch (err) {
      result = { error: err instanceof Error ? err.message : "Erreur inattendue pendant la rétrogradation." };
    } finally {
      clearInterval(heartbeat);
      try {
        client?.close();
      } catch {
        /* best-effort */
      }
    }

    const failed = !!result?.error;
    await db
      .update(routerRestoreJobs)
      .set({
        status: failed ? "error" : "done",
        error: failed ? result?.error ?? "Échec." : null,
        progress: { phase: "downgrade", step: "done", result } satisfies DowngradeJobProgress,
        updatedAt: new Date(),
        finishedAt: new Date(),
      })
      .where(eq(routerRestoreJobs.id, job.id))
      .catch(() => {});
  });

  return { success: true as const, jobId: job.id };
}
