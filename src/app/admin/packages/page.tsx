import { eq, asc, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages, routers } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import CreatePackageModal from "./CreatePackageModal";
import StatusToggle from "./StatusToggle";
import PriceEditor from "./PriceEditor";

function formatUgx(value: number) {
  return `FCFA ${value.toLocaleString("en-US")}`;
}

function formatDuration(value: number, unit: string) {
  const suffix =
    unit === "Minutes"
      ? "Min"
      : unit === "Hours"
        ? "H"
        : unit === "Days"
          ? "J"
          : unit === "Months"
            ? "Mois"
            : "Sem";
  return `${value} ${suffix}`;
}

export default async function PackagesPage() {
  const session = await getSession();
  const db = getDb();

  // Forfaits + nom du routeur rattaché (badge de zone). Left join : les
  // forfaits globaux (routerId null) restent listés, sans badge.
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

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-ink">Gérer les forfaits</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Créez et gérez vos forfaits Hotspot et abonnements PPPoE.
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
      <div className="mt-6 overflow-hidden rounded-xl border border-line bg-paper">
        {/* Cartes sous md : huit colonnes ne tiennent pas dans un téléphone,
            et le défilement latéral séparait le prix de son forfait. */}
        <ul role="list" className="divide-y divide-line-soft md:hidden">
          {orgPackages.map((p) => (
            <li key={`m-${p.id}`} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium text-ink">{p.name}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {p.routerName ?? "Tous les routeurs"} · {formatDuration(p.durationValue, p.durationUnit)}
                  </p>
                </div>
                <StatusToggle packageId={p.id} active={p.active} />
              </div>
              <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Prix</dt>
                  <dd className="font-semibold tabular-nums text-ink">{formatUgx(p.priceCents)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Commission</dt>
                  <dd className="tabular-nums text-ink">{formatUgx(p.commissionCents)}</dd>
                </div>
                <div className="flex gap-1.5">
                  <dt className="text-ink-soft">Débit</dt>
                  <dd className="tabular-nums text-ink">{p.uploadMbps}M/{p.downloadMbps}M</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <table className="hidden w-full text-left text-sm md:table">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Nom du forfait</th>
              <th className="px-4 py-3 font-medium">Zone / Routeur</th>
              <th className="px-4 py-3 text-right font-medium">Prix</th>
              <th className="px-4 py-3 font-medium">Durée</th>
              <th className="px-4 py-3 text-right font-medium">Commission agent</th>
              <th className="px-4 py-3 font-medium">Limite de débit</th>
              <th className="px-4 py-3 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {orgPackages.map((p) => (
              <tr key={p.id} className="hover:bg-clay">
                <td className="px-4 py-3 font-medium text-ink">{p.name}</td>
                <td className="px-4 py-3">
                  {p.routerName ? (
                    <span className="inline-flex items-center rounded-full bg-brand/10 px-2.5 py-0.5 text-xs font-medium text-brand">
                      {p.routerName}
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-clay px-2.5 py-0.5 text-xs font-medium text-ink-soft">
                      Tous les routeurs
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right">
                  <PriceEditor packageId={p.id} priceCents={p.priceCents} formatted={formatUgx(p.priceCents)} />
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                  {formatDuration(p.durationValue, p.durationUnit)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums text-ink-soft">
                  {formatUgx(p.commissionCents)}
                </td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums text-ink-soft">
                  {p.uploadMbps}M/{p.downloadMbps}M
                </td>
                <td className="px-4 py-3">
                  <StatusToggle packageId={p.id} active={p.active} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-line-soft px-4 py-3 text-xs text-ink-soft">
          {orgPackages.length} forfait{orgPackages.length > 1 ? "s" : ""}.
        </p>
      </div>
      )}
    </div>
  );
}
