import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Building2, Mail } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getKycDetail } from "@/lib/kyc/queries";
import { decideVerification } from "@/lib/kyc/actions";
import { MAX_KYC_ATTEMPTS } from "@/lib/kyc/constants";
import { KYC_STATUS_LABELS, statusTone } from "@/lib/kyc/statuses";

export const dynamic = "force-dynamic";

const PIECES: Record<string, string> = {
  cni: "Carte nationale d'identité",
  passeport: "Passeport",
  permis: "Permis de conduire",
};

/* Les quatre volets de la fiche. L'onglet vit dans l'URL : la page reste
   rendue côté serveur, l'examinateur peut envoyer un lien qui rouvre le même
   volet, et il n'y a aucun état client à synchroniser. */
const VUES = [
  { key: "profil", label: "Déclaration" },
  { key: "verification", label: "Vérification KYC" },
  { key: "comptes", label: "Comptes rattachés" },
  { key: "journal", label: "Journal" },
] as const;

type Vue = (typeof VUES)[number]["key"];
const estVue = (v: string): v is Vue => VUES.some((o) => o.key === v);

function Champ({ label, valeur }: { label: string; valeur: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wider text-ink-soft">{label}</dt>
      <dd className="mt-0.5 text-ink">{valeur || "—"}</dd>
    </div>
  );
}

export default async function KycDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ orgId: string }>;
  searchParams: Promise<{ vue?: string }>;
}) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return <p className="text-sm text-ink-soft">Accès réservé au superadmin.</p>;
  }

  const { orgId } = await params;
  const { vue } = await searchParams;
  const onglet: Vue = vue && estVue(vue) ? vue : "profil";
  const d = await getKycDetail(orgId);
  if (!d) notFound();

  const fmt = new Intl.DateTimeFormat("fr", { dateStyle: "medium", timeStyle: "short" });
  const date = (v: Date | null) => (v ? fmt.format(v) : null);
  const decidable = d.status === "under_review";
  // Le compte le plus ancien de l'organisation, c'est-à-dire celui qui l'a créée.
  const contact = d.membres[0];

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
      <Link
        href="/admin/kyc"
        className="inline-flex items-center gap-1.5 text-sm text-brand-deep hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Vérifications
      </Link>

      {/* En-tête : qui, comment le joindre, où en est le dossier, et la
          décision — tout ce dont l'examinateur a besoin avant de fouiller. */}
      <header className="mt-4 border border-line bg-paper p-6 text-center">
        <h1 className="flex items-center justify-center gap-2 font-display text-2xl font-bold text-ink">
          <Building2 className="h-5 w-5" />
          {d.orgName}
        </h1>
        {contact && (
          <p className="mt-1 flex items-center justify-center gap-1.5 font-mono text-xs text-ink-soft">
            <Mail className="h-3.5 w-3.5" />
            {contact.email}
          </p>
        )}
        <p className="mt-3">
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(d.status)}`}>
            {KYC_STATUS_LABELS[d.status] ?? d.status}
          </span>
        </p>

        {decidable ? (
          <form action={decideVerification} className="mx-auto mt-5 max-w-md text-left">
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
            <div className="mt-3 flex flex-wrap justify-center gap-2">
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
                className="rounded-md border border-err px-5 py-2.5 text-sm font-semibold text-err hover:bg-err-soft"
              >
                Refuser
              </button>
            </div>
          </form>
        ) : (
          <p className="mt-3 text-sm text-ink-soft">
            {d.status === "approved" || d.status === "rejected"
              ? `Décidé le ${date(d.decidedAt) ?? "—"}.`
              : "L'opérateur n'a pas encore soumis son dossier."}
          </p>
        )}
      </header>

      <nav className="mt-6 flex flex-wrap gap-1 border-b border-line" aria-label="Volets du dossier">
        {VUES.map((o) => {
          const actif = o.key === onglet;
          return (
            <Link
              key={o.key}
              href={`/admin/kyc/${d.orgId}?vue=${o.key}`}
              aria-current={actif ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-2 text-sm ${
                actif
                  ? "border-brand font-semibold text-ink"
                  : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              {o.label}
            </Link>
          );
        })}
      </nav>

      <section className="border-x border-b border-line bg-paper p-6">
        {onglet === "profil" && (
          <dl className="grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">
            <Champ label="Nom complet déclaré" valeur={d.fullName} />
            <Champ label="Organisation" valeur={d.orgName} />
            <Champ label="Adresse déclarée" valeur={d.fullAddress} />
            <Champ label="Courriel de contact" valeur={contact?.email} />
            <Champ label="Dossier ouvert le" valeur={date(d.createdAt)} />
            <Champ label="Accord accepté le" valeur={date(d.agreedAt)} />
          </dl>
        )}

        {onglet === "verification" && (
          <>
            <dl className="grid grid-cols-1 gap-5 text-sm sm:grid-cols-2">
              <Champ label="Statut" valeur={KYC_STATUS_LABELS[d.status] ?? d.status} />
              <Champ
                label="Pièce annoncée"
                valeur={d.documentType ? PIECES[d.documentType] ?? d.documentType : null}
              />
              <Champ label="Tentatives" valeur={`${d.attempts} / ${MAX_KYC_ATTEMPTS}`} />
              <Champ label="Soumis le" valeur={date(d.submittedAt)} />
              <Champ label="Décidé le" valeur={date(d.decidedAt)} />
              <Champ label="Motif de la décision" valeur={d.adminNote} />
            </dl>
            {/* Rappel permanent : les pièces ne sont pas ici, et pourquoi. */}
            <p className="mt-6 bg-clay px-3 py-2 text-xs leading-5 text-ink-soft">
              Les pièces d&apos;identité ne sont pas stockées par SafeLinkHub : elles arrivent sur
              le canal privé. Rapprochez-les de cette déclaration avant de décider.
            </p>
          </>
        )}

        {onglet === "comptes" && (
          <ul role="list" className="divide-y divide-line-soft">
            {d.membres.map((m) => (
              <li key={m.email} className="py-3 first:pt-0">
                <p className="text-sm font-medium text-ink">{m.name}</p>
                <p className="font-mono text-xs text-ink-soft">{m.email}</p>
                <p className="mt-0.5 text-xs text-ink-soft">
                  {m.role} · inscrit le {fmt.format(m.createdAt)}
                </p>
              </li>
            ))}
            {d.membres.length === 0 && (
              <li className="text-sm text-ink-soft">Aucun compte rattaché.</li>
            )}
          </ul>
        )}

        {onglet === "journal" && (
          <ol className="space-y-2 text-sm" role="list">
            {journal.map((e) => (
              <li
                key={e.quoi}
                className="flex flex-wrap justify-between gap-2 border-b border-line-soft pb-2 last:border-0"
              >
                <span className="text-ink">{e.quoi}</span>
                <span className="font-mono text-xs text-ink-soft">{fmt.format(e.quand)}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}
