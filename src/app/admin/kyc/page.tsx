import Link from "next/link";
import { ShieldCheck, Search } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { countKycByStatus, listKycRows } from "@/lib/kyc/queries";
import {
  KYC_STATUS_LABELS,
  KYC_TABS,
  isKycTab,
  statusTone,
  type KycTab,
} from "@/lib/kyc/statuses";
import RowActions from "./RowActions";
import { Table, Td, Th, Tr } from "@/components/ui/Table";

export const dynamic = "force-dynamic";

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
  const onglet: KycTab = statut && isKycTab(statut) ? statut : "under_review";
  const recherche = (q ?? "").trim();
  const [lignes, compteurs] = await Promise.all([
    listKycRows(onglet, recherche),
    countKycByStatus(),
  ]);
  const dateFmt = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" });

  const initiales = (nom: string) =>
    nom
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((m) => m[0]?.toUpperCase())
      .join("") || "?";

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Vérifications d&apos;identité</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Chaque organisation passée par le parcours KYC, son état et sa déclaration. Une décision
          est définitive : ouvrez le dossier avant de valider ou refuser.
        </p>
      </div>

      {/* Files par statut (avec leur compte) et recherche, sur une ligne : le
          même contrôle segmenté que le parc de routeurs. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <nav aria-label="Filtrer par statut" className="-mx-4 overflow-x-auto px-4 lg:mx-0 lg:px-0">
          <div className="inline-flex gap-1 rounded-full bg-line-soft p-1">
            {KYC_TABS.map((t) => {
              const actif = t.key === onglet;
              const n = compteurs[t.key] ?? 0;
              return (
                <Link
                  key={t.key}
                  href={`/admin/kyc?statut=${t.key}${recherche ? `&q=${encodeURIComponent(recherche)}` : ""}`}
                  aria-current={actif ? "page" : undefined}
                  className={`flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors ${
                    actif
                      ? "border-line bg-paper font-semibold text-ink"
                      : "border-transparent font-medium text-ink-soft hover:text-ink"
                  }`}
                >
                  {t.label}
                  <span className={`tabular-nums ${n > 0 && t.key === "under_review" ? "font-semibold text-warn" : "text-ink-soft"}`}>
                    {n}
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>

        <form method="get" className="relative lg:w-80">
          <input type="hidden" name="statut" value={onglet} />
          <label htmlFor="q" className="sr-only">
            Rechercher une organisation
          </label>
          <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={recherche}
            placeholder="Organisation ou nom déclaré…"
            className="field pl-9"
          />
        </form>
      </div>

      {lignes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line-strong/50 bg-paper px-4 py-10 text-center">
          <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-clay">
            <ShieldCheck aria-hidden="true" className="h-5 w-5 text-brand-deep" />
          </span>
          <p className="mt-3 text-sm font-semibold text-ink">
            Aucun dossier dans cette file{recherche ? ` pour « ${recherche} »` : ""}
          </p>
          {recherche && (
            <Link href={`/admin/kyc?statut=${onglet}`} className="btn btn-md btn-outline mt-4">
              Effacer la recherche
            </Link>
          )}
        </div>
      ) : (
        <Table caption="Dossiers de vérification d'identité">
          <thead>
            <tr>
              <Th>Organisation</Th>
              <Th>Nom déclaré</Th>
              <Th>Statut</Th>
              <Th numeric>Tentatives</Th>
              <Th>Soumis le</Th>
              <Th>
                <span className="sr-only">Actions</span>
              </Th>
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <Tr key={l.orgId}>
                <Td>
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden="true"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-deep text-xs font-semibold text-white"
                    >
                      {initiales(l.orgName)}
                    </span>
                    <div className="min-w-0">
                      <Link href={`/admin/kyc/${l.orgId}`} className="block max-w-[18rem] truncate font-semibold text-ink hover:text-brand-deep">
                        {l.orgName}
                      </Link>
                      <span className="block max-w-[18rem] truncate font-mono text-xs text-ink-soft">{l.email ?? "—"}</span>
                    </div>
                  </div>
                </Td>
                <Td className="text-ink">{l.fullName ?? "—"}</Td>
                <Td>
                  <span
                    className={`inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${statusTone(l.status)}`}
                  >
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
                    {KYC_STATUS_LABELS[l.status] ?? l.status}
                  </span>
                </Td>
                <Td numeric className="text-ink-soft">{l.attempts}</Td>
                <Td className="whitespace-nowrap text-ink-soft">
                  {l.submittedAt ? dateFmt.format(l.submittedAt) : "—"}
                </Td>
                <Td>
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      href={`/admin/kyc/${l.orgId}`}
                      className={`btn btn-sm ${l.status === "under_review" ? "btn-secondary" : "btn-outline"}`}
                    >
                      {l.status === "under_review" ? "Examiner le dossier" : "Voir le dossier"}
                    </Link>
                    <RowActions
                      orgId={l.orgId}
                      orgName={l.orgName}
                      decidable={l.status === "under_review"}
                    />
                  </div>
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
