import Link from "next/link";
import { ShieldCheck, Search } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { countKycByStatus, listKycRows, KYC_TABS, type KycTab } from "@/lib/kyc/queries";
import { KYC_STATUS_LABELS, statusTone } from "./status";

export const dynamic = "force-dynamic";

const est = (v: string): v is KycTab => KYC_TABS.some((t) => t.key === v);

export default async function KycAdminPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; q?: string }>;
}) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return <p className="text-sm text-ink-soft">Accès réservé au superadmin.</p>;
  }

  const { statut, q } = await searchParams;
  const onglet: KycTab = statut && est(statut) ? statut : "under_review";
  const recherche = (q ?? "").trim();
  const [lignes, compteurs] = await Promise.all([
    listKycRows(onglet, recherche),
    countKycByStatus(),
  ]);
  const dateFmt = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" });

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
        <ShieldCheck className="h-5 w-5" />
        Vérifications d&apos;identité
      </h1>
      <p className="mt-1 text-sm text-ink-soft">
        Chaque organisation passée par le parcours KYC, son état et sa déclaration.
      </p>

      {/* Onglets par statut, avec leur compte — l'examinateur voit d'un coup
          d'œil ce qui l'attend, sans ouvrir chaque file. */}
      <nav className="mt-6 flex flex-wrap gap-1 border-b border-line" aria-label="Filtrer par statut">
        {KYC_TABS.map((t) => {
          const actif = t.key === onglet;
          const n = compteurs[t.key] ?? 0;
          return (
            <Link
              key={t.key}
              href={`/admin/kyc?statut=${t.key}${recherche ? `&q=${encodeURIComponent(recherche)}` : ""}`}
              aria-current={actif ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2 text-sm ${
                actif
                  ? "border-brand font-semibold text-ink"
                  : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
              <span className="ml-1.5 rounded-full bg-clay px-1.5 py-0.5 text-[11px] tabular-nums text-ink-soft">
                {n}
              </span>
            </Link>
          );
        })}
      </nav>

      <form method="get" className="mt-4 flex gap-2">
        <input type="hidden" name="statut" value={onglet} />
        <label htmlFor="q" className="sr-only">
          Rechercher une organisation
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={recherche}
          placeholder="Organisation ou nom déclaré…"
          className="min-w-0 flex-1 rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
        />
        <button className="inline-flex items-center gap-2 rounded-md border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-clay">
          <Search className="h-4 w-4" />
          Chercher
        </button>
      </form>

      {lignes.length === 0 ? (
        <p className="mt-6 border border-dashed border-line bg-clay/40 p-6 text-sm text-ink-soft">
          Aucun dossier dans cette file{recherche ? ` pour « ${recherche} »` : ""}.
        </p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-sm">
            <thead>
              <tr className="border-y border-line text-left text-xs uppercase tracking-wider text-ink-soft">
                <th className="px-3 py-2 font-semibold">Organisation</th>
                <th className="px-3 py-2 font-semibold">Contact</th>
                <th className="px-3 py-2 font-semibold">Nom déclaré</th>
                <th className="px-3 py-2 font-semibold">Statut</th>
                <th className="px-3 py-2 font-semibold">Tentatives</th>
                <th className="px-3 py-2 font-semibold">Soumis le</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map((l) => (
                <tr key={l.orgId} className="border-b border-line-soft hover:bg-clay">
                  <td className="px-3 py-3">
                    <Link
                      href={`/admin/kyc/${l.orgId}`}
                      className="font-medium text-ink hover:underline"
                    >
                      {l.orgName}
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-mono text-xs text-ink-soft">{l.email ?? "—"}</td>
                  <td className="px-3 py-3 text-ink">{l.fullName ?? "—"}</td>
                  <td className="px-3 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusTone(l.status)}`}>
                      {KYC_STATUS_LABELS[l.status] ?? l.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 tabular-nums text-ink-soft">{l.attempts}</td>
                  <td className="px-3 py-3 text-xs text-ink-soft">
                    {l.submittedAt ? dateFmt.format(l.submittedAt) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
