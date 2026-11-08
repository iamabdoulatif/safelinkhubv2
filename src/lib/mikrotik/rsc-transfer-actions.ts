"use server";

/**
 * Applique un transfert sélectif `.rsc` sur un routeur d'accueil.
 *
 * La décision de CE QUI passe vit dans rsc-selective-restore.ts, en fonctions
 * pures ; ce module ne fait que lire le routeur d'accueil, appeler le
 * planificateur, puis exécuter. Toute la logique testable est de l'autre côté.
 */
import { after } from "next/server";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers, routerRestoreJobs } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { connectToRouter } from "./router-sync";
import {
  planifierTransfert,
  type CibleRouteur,
  estSauvegardeBinaire,
  MESSAGE_BACKUP_BINAIRE,
} from "./rsc-selective-restore";
import { executerPlan } from "./rsc-transfer-exec";

/**
 * Refuse un `.backup` AVANT de joindre le routeur.
 *
 * Le contrôle porte sur la SIGNATURE, pas sur l'extension : un binaire renommé
 * en `.rsc` produirait sinon un plan vide, et l'exploitant chercherait
 * longtemps pourquoi son transfert ne reprend rien.
 */
function refuserSiBinaire(rsc: string): string | null {
  return estSauvegardeBinaire(Buffer.from(rsc, "utf8")) ? MESSAGE_BACKUP_BINAIRE : null;
}

type Sentence = Record<string, string>;

/**
 * Lit sur le routeur d'accueil ce à quoi le transfert doit s'adapter.
 *
 * ON LIT PLUTÔT QUE DE SUPPOSER : le pool et le serveur hotspot du routeur
 * d'accueil viennent de SON auto-setup, avec son propre sous-réseau. Deviner
 * « POOL-HOTSPOT » et « hotspot1 » marcherait sur la plupart des cartes et
 * échouerait en silence sur celles qui ont été configurées autrement — les
 * profils pointeraient un pool inexistant, et le hotspot cesserait
 * d'attribuer des adresses.
 */
async function lireCible(client: Awaited<ReturnType<typeof connectToRouter>>): Promise<
  { ok: true; cible: CibleRouteur } | { ok: false; erreur: string }
> {
  const pools: Sentence[] = await client.talk(["/ip/pool/print"]).catch(() => []);
  const serveurs: Sentence[] = await client.talk(["/ip/hotspot/print"]).catch(() => []);

  const pool = pools.find((p) => (p.name ?? "").toUpperCase().includes("HOTSPOT")) ?? pools[0];
  const serveur = serveurs[0];

  if (!pool?.name || !pool.ranges) {
    return {
      ok: false,
      erreur:
        "Le routeur d'accueil n'a aucun pool d'adresses : lancez d'abord son auto-setup, le transfert s'y adaptera ensuite.",
    };
  }
  if (!serveur?.name) {
    return {
      ok: false,
      erreur:
        "Le routeur d'accueil n'a aucun serveur hotspot : lancez d'abord son auto-setup.",
    };
  }
  return {
    ok: true,
    cible: {
      poolName: pool.name,
      poolRanges: pool.ranges,
      hotspotServer: serveur.name,
      /* Le bridge que le hotspot d'accueil dessert déjà. On l'ANNONCE sans y
         toucher : c'est là que les tickets transférés atterriront. */
      hotspotBridge: serveur.interface ?? "(inconnu)",
    },
  };
}

/** Ce que l'écran affiche AVANT d'écrire quoi que ce soit. */
export async function planifierTransfertRsc(routerId: string, rsc: string) {
  const binaire = refuserSiBinaire(rsc);
  if (binaire) return { error: binaire };

  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [routeur] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!routeur || (routeur.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  let client;
  try {
    client = await connectToRouter(routeur);
    const cible = await lireCible(client);
    if (!cible.ok) return { error: cible.erreur };
    const plan = planifierTransfert(rsc, cible.cible);
    return {
      success: true as const,
      cible: cible.cible,
      resume: plan.resume,
      ecartees: plan.ecartees,
      total: plan.commandes.length,
    };
  } catch (cause) {
    return { error: cause instanceof Error ? cause.message : "Connexion au routeur impossible." };
  } finally {
    client?.close();
  }
}

/** Battement de cœur / péremption d'un job — aligné sur la restauration. */
const TRANSFERT_JOB_STALE_MS = 120_000;

/**
 * Démarre le transfert en TÂCHE DE FOND et rend la main tout de suite.
 *
 * L'ancienne version posait les ~13 400 commandes d'un gros site (tickets +
 * ventes) une par une DANS la requête : au-delà des ~100 s de Cloudflare, la
 * requête était coupée (« aborted »), l'écran basculait sur l'erreur, et le
 * transfert restait à moitié fait. On reprend donc le patron de la restauration
 * (startBackupJob) : une ligne router_restore_jobs (backup_id NULL), un
 * `after()` qui applique le plan avec heartbeat, et l'UI qui sonde getRestoreJob.
 */
export async function demarrerTransfertRscJob(routerId: string, rsc: string) {
  const binaire = refuserSiBinaire(rsc);
  if (binaire) return { error: binaire };

  const session = await getSession();
  if (!session) return { error: "Non authentifié." };

  const db = getDb();
  const [routeur] = await db.select().from(routers).where(eq(routers.id, routerId)).limit(1);
  if (!routeur || (routeur.orgId !== session.orgId && !isSuperAdmin(session.role))) {
    return { error: "Routeur introuvable." };
  }

  // Une seule opération vivante par routeur (transfert / restauration /
  // sauvegarde partagent router_restore_jobs) : deux écritures de masse en
  // parallèle sur un boîtier déjà chargé étrangleraient le portail des clients.
  const [running] = await db
    .select({ id: routerRestoreJobs.id, updatedAt: routerRestoreJobs.updatedAt })
    .from(routerRestoreJobs)
    .where(
      and(eq(routerRestoreJobs.targetRouterId, routerId), eq(routerRestoreJobs.status, "running")),
    )
    .orderBy(desc(routerRestoreJobs.updatedAt))
    .limit(1);
  if (running && Date.now() - running.updatedAt.getTime() < TRANSFERT_JOB_STALE_MS) {
    return { error: "Une opération est déjà en cours sur ce routeur — attendez qu'elle finisse." };
  }

  const [job] = await db
    .insert(routerRestoreJobs)
    .values({
      orgId: session.orgId,
      backupId: null,
      targetRouterId: routerId,
      status: "running",
      progress: { phase: "transfert", posees: 0, total: 0 },
    })
    .returning({ id: routerRestoreJobs.id });

  after(async () => {
    // Heartbeat : getRestoreJob déclare « périmé » un running sans écriture
    // depuis TRANSFERT_JOB_STALE_MS. Poser des milliers de tickets dépasse ces
    // 2 min, et talk() peut rester long sur un boîtier chargé.
    const heartbeat = setInterval(() => {
      db.update(routerRestoreJobs)
        .set({ updatedAt: new Date() })
        .where(eq(routerRestoreJobs.id, job.id))
        .catch(() => {
          /* best-effort */
        });
    }, 30_000);

    let client: Awaited<ReturnType<typeof connectToRouter>> | undefined;
    try {
      client = await connectToRouter(routeur, 60_000);
      const cible = await lireCible(client);
      if (!cible.ok) throw new Error(cible.erreur);

      const plan = planifierTransfert(rsc, cible.cible);
      const total = plan.commandes.length;
      const bilan = await executerPlan(client, plan.commandes, (posees) =>
        db
          .update(routerRestoreJobs)
          .set({ progress: { phase: "transfert", posees, total }, updatedAt: new Date() })
          .where(eq(routerRestoreJobs.id, job.id))
          .then(() => {})
          .catch(() => {
            /* best-effort */
          }),
      );

      await db
        .update(routerRestoreJobs)
        .set({
          status: "done",
          progress: {
            phase: "done",
            posees: bilan.posees,
            total,
            echecs: bilan.echecs,
            resume: plan.resume,
            cible: cible.cible,
          },
          updatedAt: new Date(),
          finishedAt: new Date(),
        })
        .where(eq(routerRestoreJobs.id, job.id))
        .catch(() => {
          /* best-effort */
        });
    } catch (cause) {
      await db
        .update(routerRestoreJobs)
        .set({
          status: "error",
          error: cause instanceof Error ? cause.message : "Transfert impossible.",
          updatedAt: new Date(),
          finishedAt: new Date(),
        })
        .where(eq(routerRestoreJobs.id, job.id))
        .catch(() => {
          /* best-effort */
        });
    } finally {
      clearInterval(heartbeat);
      client?.close();
    }
  });

  return { success: true as const, jobId: job.id };
}
