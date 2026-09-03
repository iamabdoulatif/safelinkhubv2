import { eq, asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import CreatePackageModal from "./CreatePackageModal";
import StatusToggle from "./StatusToggle";
import PriceEditor from "./PriceEditor";
import { grouperForfaits, libelleDuree, type ZoneCatalogue } from "./package-ladder";

function formatFcfa(value: number) {
  return `FCFA ${value.toLocaleString("fr-FR")}`;
}

/** Ce qui est vrai pour TOUS les forfaits d'une zone se dit une fois, en tête
 *  de zone : répété sur chaque ligne, « 5M/5M » et « FCFA 0 » occupaient deux
 *  colonnes entières sans jamais rien distinguer. */
function reglesCommunes(zone: ZoneCatalogue): string {
  const parts: string[] = [];
  if (zone.debitCommun) parts.push(`Débit ${zone.debitCommun}`);
  if (zone.commissionCommune === 0) parts.push("sans commission agent");
  else if (zone.commissionCommune !== null)
    parts.push(`commission agent ${formatFcfa(zone.commissionCommune)}`);
  return parts.join(" · ");
}

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
  const inactifs = orgPackages.filter((p) => !p.active).length;

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-bold text-ink">Forfaits</h1>
          <p className="mt-1 text-sm text-ink-soft">
            {orgPackages.length === 0
              ? "Ce que le client achète au portail : un prix, une durée, un débit."
              : `${orgPackages.length} forfait${orgPackages.length > 1 ? "s" : ""} sur ${zones.length} zone${zones.length > 1 ? "s" : ""}${inactifs > 0 ? ` · ${inactifs} désactivé${inactifs > 1 ? "s" : ""}` : ""}.`}
          </p>
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
        /* Une carte par zone, et dans la carte l'échelle des durées du plus
           court au plus long. La zone n'est plus une pastille recopiée sur
           chaque ligne : c'est le titre de ce qu'on lit. */
        <div className="mt-6 space-y-4">
          {zones.map((zone) => {
            const regles = reglesCommunes(zone);
            const zoneInactifs = zone.forfaits.filter((f) => !f.active).length;
            return (
              <section
                key={zone.cle}
                className="overflow-hidden rounded-xl border border-line bg-paper"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-line-soft px-4 py-3">
                  <h2 className="font-display text-base font-bold text-ink">{zone.nom}</h2>
                  <p className="text-xs text-ink-soft">
                    {zone.forfaits.length} forfait{zone.forfaits.length > 1 ? "s" : ""}
                    {zoneInactifs > 0 ? ` · ${zoneInactifs} désactivé${zoneInactifs > 1 ? "s" : ""}` : ""}
                    {regles ? ` · ${regles}` : ""}
                  </p>
                </div>

                <ul role="list" className="divide-y divide-line-soft">
                  {zone.forfaits.map((f) => (
                    <li key={f.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                      <div className="min-w-0 flex-1 basis-48">
                        <p
                          className={`font-medium ${f.active ? "text-ink" : "text-ink-soft"}`}
                        >
                          {f.name}
                        </p>
                        <p className="mt-0.5 text-xs text-ink-soft">
                          {libelleDuree(f.durationValue, f.durationUnit)}
                          {f.parJour !== null && ` · ≈ ${formatFcfa(f.parJour)}/jour`}
                          {!zone.debitCommun && ` · ${f.uploadMbps ?? 0}M/${f.downloadMbps ?? 0}M`}
                          {zone.commissionCommune === null &&
                            ` · commission ${formatFcfa(f.commissionCents)}`}
                          {!f.active && " · désactivé"}
                        </p>
                        {/* Une grille saine coûte de moins en moins cher par jour
                            à mesure que la durée s'allonge. Quand ce n'est pas le
                            cas, le palier ne se vendra pas — et rien, dans un
                            tableau de prix bruts, ne le faisait voir. */}
                        {f.inversion && (
                          <p className="mt-1 text-xs font-medium text-warn">
                            Plus cher par jour que {f.inversionContre} — aucun intérêt à le prendre.
                          </p>
                        )}
                      </div>
                      <div className="ml-auto text-right text-base font-semibold tabular-nums text-ink">
                        <PriceEditor
                          packageId={f.id}
                          priceCents={f.priceCents}
                          formatted={formatFcfa(f.priceCents)}
                        />
                      </div>
                      <StatusToggle packageId={f.id} active={f.active} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
