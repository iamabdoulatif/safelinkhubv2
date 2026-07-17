import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import { listOrgBackups } from "@/lib/mikrotik/router-backup";
import BackupsManager from "./BackupsManager";
import RestoreGuide from "./RestoreGuide";

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
      />
    </div>
  );
}
