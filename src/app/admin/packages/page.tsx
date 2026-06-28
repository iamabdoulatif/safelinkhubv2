import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { packages } from "@/lib/db/schema";
import { getSession } from "@/lib/auth/session";
import CreatePackageModal from "./CreatePackageModal";
import StatusToggle from "./StatusToggle";

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

  const orgPackages = session
    ? await db
        .select()
        .from(packages)
        .where(eq(packages.orgId, session.orgId))
        .orderBy(desc(packages.createdAt))
    : [];

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Gérer les forfaits</h1>
          <p className="mt-1 text-sm text-slate-500">
            Créez et gérez vos forfaits Hotspot et abonnements PPPoE.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CreatePackageModal />
          <button className="rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50">
            Colonnes
          </button>
        </div>
      </div>

      <input
        placeholder="Filtrer les forfaits..."
        className="mt-4 w-full sm:w-64 rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
      />

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="table-mobile-wrapper">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" />
                </th>
                <th className="px-4 py-3 font-medium">Nom du forfait</th>
                <th className="px-4 py-3 font-medium">Prix</th>
                <th className="px-4 py-3 font-medium">Durée</th>
                <th className="px-4 py-3 font-medium">Commission agent</th>
                <th className="px-4 py-3 font-medium">Limite de débit</th>
                <th className="px-4 py-3 font-medium">Statut</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orgPackages.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                    Aucun forfait pour le moment. Créez le premier.
                  </td>
                </tr>
              )}
              {orgPackages.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3">
                    <input type="checkbox" />
                  </td>
                  <td className="px-4 py-3 text-slate-900">{p.name}</td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatUgx(p.priceCents)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatDuration(p.durationValue, p.durationUnit)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatUgx(p.commissionCents)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {p.uploadMbps}M/{p.downloadMbps}M
                  </td>
                  <td className="px-4 py-3">
                    <StatusToggle packageId={p.id} active={p.active} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>0 sur {orgPackages.length} ligne(s) sélectionnée(s).</span>
          <div className="flex gap-2">
            <button className="rounded-md border border-slate-300 px-3 py-1">
              Précédent
            </button>
            <button className="rounded-md border border-slate-300 px-3 py-1">
              Suivant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
