import { and, asc, desc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routerRestoreJobs, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { listOrgBackups } from "@/lib/mikrotik/router-backup";
import { getOrgUploadedBackups } from "@/lib/mikrotik/backup-upload-actions";
import BackupsManager from "./BackupsManager";
import RestoreGuide from "./RestoreGuide";
import RscTransferCard from "./RscTransferCard";
import UploadedBackupsCard from "./UploadedBackupsCard";

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

  // Tolérant à l'ordre migration/déploiement : si la table n'existe pas encore,
  // on dégrade en liste vide au lieu de casser toute la page (même garde-fou que
  // la requête runningJobs ci-dessus).
  const uploadedBackups = session ? await getOrgUploadedBackups().catch(() => []) : [];

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Sauvegardes des routeurs</h1>
        <p className="mt-1 max-w-3xl text-sm text-ink-soft">
          Tickets vendus, profils tarifaires et walled-garden de chaque MikroTik. Si un routeur
          meurt, sa sauvegarde se restaure sur le rechange — même d&apos;un autre modèle.
        </p>
        <ul className="mt-3 flex flex-wrap gap-2 text-xs text-ink-soft" role="list">
          <li className="rounded-full border border-line bg-paper px-3 py-1">Capture automatique chaque nuit à 02:30</li>
          <li className="rounded-full border border-line bg-paper px-3 py-1">7 dernières conservées par routeur</li>
        </ul>
      </div>

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

      {/* Outils ponctuels, sous la liste : on s'en sert lors d'une migration,
          pas au quotidien. */}
      <section className="space-y-4 pt-2">
        <div>
          <h2 className="text-base font-semibold text-ink">Autres outils</h2>
          <p className="text-[13px] text-ink-soft">
            Transfert d&apos;une configuration exportée et fichiers .backup RouterOS.
          </p>
        </div>
      <RscTransferCard routers={orgRouters} />
      <UploadedBackupsCard
        routers={orgRouters}
        initialItems={uploadedBackups.map((b) => ({
          id: b.id,
          fileName: b.fileName,
          sizeBytes: b.sizeBytes,
          encrypted: b.encrypted,
          uploadedByName: b.uploadedByName,
          createdAt: b.createdAt.toISOString(),
        }))}
      />
      </section>
    </div>
  );
}
