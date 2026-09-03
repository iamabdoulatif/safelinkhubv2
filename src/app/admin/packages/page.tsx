import { eq, asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import CreatePackageModal from "./CreatePackageModal";
import PackageCatalog from "./PackageCatalog";
import { grouperForfaits } from "./package-ladder";

export default async function PackagesPage() {
  const session = await getSession();
  const db = getDb();

  // Forfaits + nom du routeur rattaché. Left join : les forfaits globaux
  // (routerId null) restent listés, dans leur propre groupe.
  const orgPackages = session
    ? await db
        .select({
          id: packages.id,
          name: packages.name,
          priceCents: packages.priceCents,
          durationValue: packages.durationValue,
          durationUnit: packages.durationUnit,
          commissionCents: packages.commissionCents,
          uploadMbps: packages.uploadMbps,
          downloadMbps: packages.downloadMbps,
          active: packages.active,
          routerId: packages.routerId,
          routerName: routers.name,
        })
        .from(packages)
        .leftJoin(routers, eq(packages.routerId, routers.id))
        .where(eq(packages.orgId, session.orgId))
        .orderBy(desc(packages.createdAt))
    : [];

  // Routeurs de l'org pour le sélecteur de zone du modal de création.
  const orgRouters = session
    ? await db
        .select({ id: routers.id, name: routers.name })
        .from(routers)
        .where(eq(routers.orgId, session.orgId))
        .orderBy(asc(routers.name))
    : [];

  const zones = grouperForfaits(orgPackages);
  const zonesARevoir = zones.filter((z) => z.forfaits.some((f) => f.inversion)).length;

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Forfaits</h1>
          {orgPackages.length === 0 ? (
            <p className="mt-1 text-sm text-ink-soft">
              Ce que le client achète au portail : un prix, une durée, un débit.
            </p>
          ) : (
            <p className="mt-1 text-sm text-ink-soft">
              {zones.length} zone{zones.length > 1 ? "s" : ""} · {orgPackages.length} forfait
              {orgPackages.length > 1 ? "s" : ""}
              {zonesARevoir > 0 && (
                <span className="font-medium text-warn">
                  {" · "}
                  {zonesARevoir} zone{zonesARevoir > 1 ? "s" : ""} à revoir
                </span>
              )}
            </p>
          )}
        </div>
        <CreatePackageModal routers={orgRouters} />
      </div>

      {/* Ont disparu d'ici : un bouton « Colonnes », un champ « Filtrer » et
          une pagination « Précédent / Suivant » qui ne faisaient RIEN, des
          cases à cocher sans état, et un compteur « 0 sur N sélectionnée(s) »
          affichant éternellement zéro. Un contrôle qui ne répond pas est pire
          qu'un contrôle absent : il use la confiance à chaque clic. */}
      {orgPackages.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-line-soft bg-paper p-10 text-center">
          <p className="font-display text-lg font-bold text-ink">Aucun forfait pour l&apos;instant</p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-ink-soft">
            Un forfait, c&apos;est ce que le client achète au portail : un prix, une durée, un débit.
            Créez le premier et il sera posé sur vos routeurs.
          </p>
        </div>
      ) : (
        <div className="mt-6">
          <PackageCatalog zones={zones} />
        </div>
      )}
    </div>
  );
}
