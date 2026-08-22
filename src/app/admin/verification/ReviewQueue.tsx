"use client";

import { useState } from "react";
import { Gavel } from "lucide-react";
import { decideVerification } from "@/lib/kyc/actions";

type Demande = {
  orgId: string;
  orgName: string;
  documentType: string | null;
  fullName: string | null;
  fullAddress: string | null;
  attempts: number;
  submittedAt: Date | null;
};

const PIECES: Record<string, string> = {
  cni: "Carte nationale d'identité",
  passeport: "Passeport",
  permis: "Permis de conduire",
};

/** File d'examen — superadmin. Les PIÈCES ne sont pas ici : elles arrivent par
 *  le canal privé. Cet écran ne porte que la décision et sa motivation. */
export default function ReviewQueue({ demandes }: { demandes: Demande[] }) {
  const [ouvert, setOuvert] = useState<string | null>(null);

  return (
    <section className="mx-auto mt-10 max-w-4xl border-t border-line pt-8">
      <h2 className="flex items-center gap-2 text-xl font-bold text-ink">
        <Gavel className="h-5 w-5" />
        Dossiers à examiner <span className="text-ink-soft">({demandes.length})</span>
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Les pièces arrivent sur le canal privé ; rapprochez-les de la déclaration ci-dessous
        avant de décider.
      </p>

      {demandes.length === 0 ? (
        <p className="mt-4 border border-dashed border-line bg-clay/40 p-5 text-sm text-ink-soft">
          Aucun dossier en attente.
        </p>
      ) : (
        <ul role="list" className="mt-4 space-y-4">
          {demandes.map((d) => (
            <li key={d.orgId} className="border border-line bg-paper p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{d.orgName}</p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {PIECES[d.documentType ?? ""] ?? "Pièce non précisée"} · tentative{" "}
                    {d.attempts}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setOuvert(ouvert === d.orgId ? null : d.orgId)}
                  className="rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-ink hover:bg-clay"
                >
                  {ouvert === d.orgId ? "Fermer" : "Décider"}
                </button>
              </div>

              <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-ink-soft">Nom déclaré</dt>
                  <dd className="text-ink">{d.fullName ?? "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-ink-soft">Adresse déclarée</dt>
                  <dd className="text-ink">{d.fullAddress ?? "—"}</dd>
                </div>
              </dl>

              {ouvert === d.orgId && (
                <form action={decideVerification} className="mt-4 space-y-3 border-t border-line pt-4">
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
                  <div className="flex flex-wrap gap-2">
                    <button
                      name="decision"
                      value="approved"
                      className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line"
                    >
                      Valider
                    </button>
                    <button
                      name="decision"
                      value="rejected"
                      className="rounded-md border border-red-600 px-4 py-2 text-sm font-semibold text-red-700 hover:bg-red-50"
                    >
                      Refuser
                    </button>
                  </div>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
