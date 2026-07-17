import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRestoreJobs, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { listOrgBackups } from "@/lib/mikrotik/router-backup";
import BackupsManager from "./BackupsManager";
import RestoreGuide from "./RestoreGuide";

// La restauration réelle recrée les tickets UN À UN (RouterOS n'a pas d'ajout en
// lot), soit plusieurs minutes pour un gros site comme RUE-NICOLAS. Elle tourne
// désormais en tâche de fond via after() (voir startRestoreJob) : le clic répond
// tout de suite et le navigateur sonde l'avancement, ce qui contourne la coupure
// à ~100 s de Cloudflare qui tuait l'ancienne requête synchrone.
//
// Ce plafond borne la durée du callback after() (et des autres Server Actions de
// la page : sauvegarde manuelle, scan, simulation). 800 s = même budget que la
// sauvegarde nocturne (cron router-backup), qui lit autant de tickets.
export const maxDuration = 800;

export default async function RouterBackupsPage() {
  const session = await getSession();
  const db = getDb();

  const [backups, orgRouters] = session
    ? await Promise.all([
        listOrgBackups(session.orgId),
        db
          .select({ id: routers.id, name: routers.name, status: routers.status, model: routers.model })
          .from(routers)
          .where(eq(routers.orgId, session.orgId))
          .orderBy(asc(routers.name)),
      ])
    : [[], []];

  // Job de restauration encore VIVANT : permet de reprendre le suivi si l'admin a
  // rafraîchi ou rouvert la page pendant une restauration longue. Le seuil de
  // fraîcheur du heartbeat (120 s, aligné sur RESTORE_JOB_STALE_MS) est évalué en
  // SQL (now()) pour ne pas dépendre de l'horloge du rendu — un job figé est
  // présumé mort et n'est pas rattaché.
  //
  // Requête ISOLÉE et tolérante : si la table n'existe pas encore (déploiement
  // arrivé avant la migration), on dégrade en « pas de reprise auto » au lieu de
  // faire planter toute la page — sans ce garde-fou, l'ordre migration/déploiement
  // deviendrait un piège capable de casser la page qu'on répare.
  const runningJobs = session
    ? await db
        .select({
          id: routerRestoreJobs.id,
          backupId: routerRestoreJobs.backupId,
          targetRouterId: routerRestoreJobs.targetRouterId,
        })
        .from(routerRestoreJobs)
        .where(
          and(
            eq(routerRestoreJobs.orgId, session.orgId),
            eq(routerRestoreJobs.status, "running"),
            sql`${routerRestoreJobs.updatedAt} > now() - interval '120 seconds'`,
          ),
        )
        .orderBy(desc(routerRestoreJobs.updatedAt))
        .limit(1)
        .catch(() => [])
    : [];

  // Ne rattache l'UI qu'à un job dont la sauvegarde et la cible existent encore.
  const live = runningJobs[0];
  const initialJob =
    live && live.backupId && live.targetRouterId
      ? { jobId: live.id, backupId: live.backupId, targetRouterId: live.targetRouterId }
      : null;

  return (
    <div className="mx-auto max-w-5xl animate-fade-in-up">
      <Link
        href="/admin/router"
        className="mb-4 inline-flex items-center gap-1.5 rounded-md border border-line-soft bg-clay px-3 py-1.5 text-sm font-medium text-ink hover:border-ok"
      >
        <ArrowLeft className="h-4 w-4" />
        Revenir aux routeurs
      </Link>

      <h1 className="text-xl font-semibold text-ink">Sauvegardes des routeurs</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Chaque sauvegarde capture les tickets vendus (code, mot de passe, profil et date
        d&apos;expiration), les profils tarifaires et le walled-garden. Si un MikroTik meurt, sa
        sauvegarde survit et se restaure sur le routeur de rechange — même d&apos;un autre modèle.
        Une capture automatique a lieu chaque nuit à 02:30 ; les 7 dernières sont conservées par
        routeur.
      </p>
      <p className="mt-2 text-xs text-ink-soft">
        Lire plusieurs milliers de tickets charge le routeur quelques secondes — mesuré à 100 % de
        CPU sur un RB951. C&apos;est sans conséquence à 02:30, mais une sauvegarde manuelle en
        pleine journée peut ralentir brièvement le portail de vos clients connectés.
      </p>

      <RestoreGuide />

      <BackupsManager
        backups={backups.map((b) => ({
          id: b.id,
          routerId: b.routerId,
          routerName: b.routerName,
          model: b.model,
          rosVersion: b.rosVersion,
          trigger: b.trigger,
          sizeBytes: b.sizeBytes,
          counts: (b.counts ?? {}) as Record<string, number>,
          createdAt: b.createdAt.toISOString(),
          orphan: b.orphan,
        }))}
        routers={orgRouters}
        initialJob={initialJob}
      />
    </div>
  );
}
