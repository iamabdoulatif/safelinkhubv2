"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowRightLeft, Loader2 } from "lucide-react";
import {
  cancelRouterTransfer,
  decideRouterTransfer,
  requestRouterTransfer,
} from "@/lib/mikrotik/router-transfer-actions";
import { ETAPES_APRES_TRANSFERT } from "@/lib/mikrotik/router-transfer";

type Etat = { error?: string; success?: true } | null;
type Routeur = { id: string; name: string; model: string | null };
type Demande = {
  id: string;
  routerName: string;
  routerModel: string | null;
  fromOrg: string;
  toEmail: string;
  reason: string | null;
  status: string;
  adminNote: string | null;
  createdAt: Date;
};
type Mienne = { id: string; routerName: string; toEmail: string; createdAt: Date };

const STATUTS: Record<string, { label: string; classe: string }> = {
  pending: { label: "En attente", classe: "bg-warn-soft text-warn" },
  approved: { label: "Transféré", classe: "bg-ok text-white" },
  rejected: { label: "Refusé", classe: "bg-err-soft text-err" },
  cancelled: { label: "Annulé", classe: "bg-clay text-ink-soft" },
};

export default function TransfersManager({
  routeurs,
  miennes,
  file,
  superadmin,
}: {
  routeurs: Routeur[];
  miennes: Mienne[];
  file: Demande[];
  superadmin: boolean;
}) {
  const [etat, demander, pending] = useActionState<Etat, FormData>(
    (prev, fd) => requestRouterTransfer(prev, fd),
    null,
  );
  const [busy, start] = useTransition();
  /* La décision RENVOIE un verdict (compte cible introuvable, demande déjà
     tranchée…). Un `action={decideRouterTransfer}` nu exige une action qui ne
     rend rien : le message serait perdu et le superadmin croirait au succès. */
  const [verdict, setVerdict] = useState<string | null>(null);

  return (
    <div className="mt-6 space-y-6">
      <section className="rounded-xl border border-line bg-paper p-5">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink">
          <ArrowRightLeft className="h-4 w-4 text-brand-deep" />
          Demander un transfert
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Le routeur passe à un autre compte SafeLinkHub, après validation de notre équipe.
        </p>

        {routeurs.length === 0 ? (
          <p className="mt-4 text-sm text-ink-soft">Aucun routeur à transférer.</p>
        ) : (
          <form action={demander} className="mt-4 space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <label className="flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  Routeur
                </span>
                <select
                  name="routerId"
                  required
                  className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                >
                  {routeurs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                      {r.model ? ` — ${r.model}` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex-1">
                <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                  E-mail du compte d&apos;arrivée
                </span>
                <input
                  name="toEmail"
                  type="email"
                  required
                  placeholder="proprietaire@exemple.com"
                  className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
                />
              </label>
            </div>
            <label className="block">
              <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                Motif (facultatif)
              </span>
              <textarea
                name="reason"
                rows={2}
                className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
              />
            </label>
            <button
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-full border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Demander le transfert
            </button>
          </form>
        )}

        <ul className="mt-4 space-y-1 border-t border-line-soft pt-3 text-xs leading-5 text-ink-soft" role="list">
          {ETAPES_APRES_TRANSFERT.map((e) => (
            <li key={e}>· {e}</li>
          ))}
        </ul>

        {etat?.error && (
          <p className="mt-3 rounded-md bg-err-soft px-3 py-2 text-sm text-err">{etat.error}</p>
        )}
        {etat?.success && (
          <p className="mt-3 rounded-md bg-ok-soft px-3 py-2 text-sm text-ok">
            Demande envoyée. Elle apparaîtra ci-dessous jusqu&apos;à la décision.
          </p>
        )}
      </section>

      {miennes.length > 0 && (
        <section className="rounded-xl border border-line bg-paper p-5">
          <h2 className="font-display text-lg font-bold text-ink">Mes demandes en attente</h2>
          <ul className="mt-3 divide-y divide-line-soft" role="list">
            {miennes.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <span>
                  <span className="block text-sm font-medium text-ink">{d.routerName}</span>
                  <span className="font-mono text-xs text-ink-soft">vers {d.toEmail}</span>
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    const fd = new FormData();
                    fd.set("id", d.id);
                    start(async () => {
                      await cancelRouterTransfer(fd);
                    });
                  }}
                  className="text-xs font-semibold text-err hover:underline disabled:opacity-50"
                >
                  Retirer la demande
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {superadmin && (
        <section className="rounded-xl border border-line bg-paper">
          <h2 className="border-b border-line-soft px-5 py-4 font-display text-lg font-bold text-ink">
            File des transferts · superadmin
          </h2>
          {file.length === 0 ? (
            <p className="px-5 py-6 text-sm text-ink-soft">Aucune demande.</p>
          ) : (
            <ul className="divide-y divide-line-soft" role="list">
              {file.map((d) => {
                const statut = STATUTS[d.status] ?? { label: d.status, classe: "bg-clay text-ink-soft" };
                return (
                  <li key={d.id} className="px-5 py-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span>
                        <span className="block text-sm font-semibold text-ink">
                          {d.routerName}
                          {d.routerModel ? ` — ${d.routerModel}` : ""}
                        </span>
                        <span className="text-xs text-ink-soft">
                          {d.fromOrg} → <span className="font-mono">{d.toEmail}</span>
                        </span>
                      </span>
                      <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statut.classe}`}>
                        {statut.label}
                      </span>
                    </div>
                    {d.reason && <p className="mt-2 text-sm text-ink-soft">« {d.reason} »</p>}
                    {d.adminNote && (
                      <p className="mt-2 border-l-2 border-line bg-clay px-3 py-2 text-sm text-ink">
                        {d.adminNote}
                      </p>
                    )}
                    {d.status === "pending" && (
                      <form
                        action={async (fd) => {
                          setVerdict(null);
                          const res = await decideRouterTransfer(fd);
                          if (res?.error) setVerdict(res.error);
                        }}
                        className="mt-3 flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="id" value={d.id} />
                        <label className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold uppercase tracking-wider text-ink-soft">
                            Motif
                          </span>
                          <input
                            name="adminNote"
                            className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand"
                          />
                        </label>
                        <button
                          name="decision"
                          value="approved"
                          className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-deep-line"
                        >
                          Transférer
                        </button>
                        <button
                          name="decision"
                          value="rejected"
                          className="rounded-md border border-err px-4 py-2.5 text-sm font-semibold text-err hover:bg-err-soft"
                        >
                          Refuser
                        </button>
                      </form>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {verdict && (
            <p className="border-t border-err bg-err-soft px-5 py-3 text-sm text-err">{verdict}</p>
          )}
        </section>
      )}
    </div>
  );
}
