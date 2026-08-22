import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, FileText, History, Users } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getKycDetail } from "@/lib/kyc/queries";
import { decideVerification } from "@/lib/kyc/actions";
import { KYC_STATUS_LABELS, statusTone } from "../status";

export const dynamic = "force-dynamic";

const PIECES: Record<string, string> = {
  cni: "Carte nationale d'identité",
  passeport: "Passeport",
  permis: "Permis de conduire",
};

export default async function KycDetailPage({ params }: { params: Promise<{ orgId: string }> }) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return <p className="text-sm text-ink-soft">Accès réservé au superadmin.</p>;
  }

  const { orgId } = await params;
  const d = await getKycDetail(orgId);
  if (!d) notFound();

  const fmt = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" });
  const decidable = d.status === "under_review";

  /* Le journal se reconstitue à partir des horodatages déjà en base : y
     ajouter une table d'événements dupliquerait une information qu'on possède
     déjà, et il faudrait ensuite les garder d'accord. */
  const journal = [
    { quand: d.createdAt, quoi: "Dossier ouvert" },
    d.agreedAt && { quand: d.agreedAt, quoi: "Accord accepté" },
    d.submittedAt && { quand: d.submittedAt, quoi: `Dossier soumis (tentative ${d.attempts})` },
    d.decidedAt && {
      quand: d.decidedAt,
      quoi: d.status === "approved" ? "Validé" : d.status === "rejected" ? "Refusé" : "Décidé",
    },
  ].filter(Boolean) as { quand: Date; quoi: string }[];

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/admin/kyc" className="inline-flex items-center gap-1.5 text-sm text-brand-deep hover:underline">
        <ArrowLeft className="h-3.5 w-3.5" />
        Vérifications
      </Link>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <Building2 className="h-5 w-5" />
          {d.orgName}
        </h1>
        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(d.status)}`}>
          {KYC_STATUS_LABELS[d.status] ?? d.status}
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <section className="border border-line bg-paper p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <FileText className="h-4 w-4 text-brand-deep" />
            Déclaration
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            {[
              ["Nom complet", d.fullName],
              ["Adresse", d.fullAddress],
              ["Pièce annoncée", d.documentType ? PIECES[d.documentType] ?? d.documentType : null],
              ["Tentatives", `${d.attempts}`],
            ].map(([k, v]) => (
              <div key={k as string}>
                <dt className="text-xs uppercase tracking-wider text-ink-soft">{k}</dt>
                <dd className="mt-0.5 text-ink">{v || "—"}</dd>
              </div>
            ))}
          </dl>
          {/* Rappel permanent : les pièces ne sont pas ici, et pourquoi. */}
          <p className="mt-4 bg-clay px-3 py-2 text-xs leading-5 text-ink-soft">
            Les pièces d&apos;identité ne sont pas stockées par SafeLinkHub : elles arrivent sur
            le canal privé. Rapprochez-les de cette déclaration avant de décider.
          </p>
        </section>

        <section className="border border-line bg-paper p-5">
          <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
            <Users className="h-4 w-4 text-brand-deep" />
            Comptes de l&apos;organisation
          </h2>
          <ul role="list" className="mt-3 divide-y divide-line-soft">
            {d.membres.map((m) => (
              <li key={m.email} className="py-2.5">
                <p className="text-sm font-medium text-ink">{m.name}</p>
                <p className="font-mono text-xs text-ink-soft">{m.email}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {m.role} · inscrit le {fmt.format(m.createdAt)}
                </p>
              </li>
            ))}
            {d.membres.length === 0 && (
              <li className="py-3 text-sm text-ink-soft">Aucun compte rattaché.</li>
            )}
          </ul>
        </section>
      </div>

      <section className="mt-5 border border-line bg-paper p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <History className="h-4 w-4 text-brand-deep" />
          Journal
        </h2>
        <ol className="mt-3 space-y-2 text-sm" role="list">
          {journal.map((e) => (
            <li key={e.quoi} className="flex flex-wrap justify-between gap-2 border-b border-line-soft pb-2">
              <span className="text-ink">{e.quoi}</span>
              <span className="font-mono text-xs text-ink-soft">{fmt.format(e.quand)}</span>
            </li>
          ))}
        </ol>
        {d.adminNote && (
          <p className="mt-4 border-l-2 border-line bg-clay px-3 py-2 text-sm leading-6 text-ink">
            <span className="block text-xs uppercase tracking-wider text-ink-soft">Motif</span>
            {d.adminNote}
          </p>
        )}
      </section>

      {decidable ? (
        <form action={decideVerification} className="mt-5 border border-line bg-paper p-5">
          <input type="hidden" name="orgId" value={d.orgId} />
          <label className="block">
            <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
              Motif (visible par l&apos;opérateur en cas de refus)
            </span>
            <textarea
              name="adminNote"
              rows={2}
              className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              name="decision"
              value="approved"
              className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-deep-line"
            >
              Valider
            </button>
            <button
              name="decision"
              value="rejected"
              className="rounded-md border border-red-600 px-5 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-50"
            >
              Refuser
            </button>
          </div>
        </form>
      ) : (
        <p className="mt-5 text-sm text-ink-soft">
          {d.status === "approved" || d.status === "rejected"
            ? `Décidé le ${d.decidedAt ? fmt.format(d.decidedAt) : "—"}.`
            : "L'opérateur n'a pas encore soumis son dossier."}
        </p>
      )}
    </div>
  );
}
