"use client";

// Journal des transactions du portefeuille avec gestion :
//  • Supprimer une transaction EN ATTENTE ou ÉCHOUÉE (aucun impact sur le solde) ;
//  • Nettoyer en lot toutes les en attente/échouées ;
//  • Modifier une transaction (note + montant + statut) — peut changer le solde.
// Les dépôts confirmés et les débits ne sont pas supprimables (intégrité du solde).

import { useActionState, useEffect, useState, useTransition } from "react";
import { Loader2, Pencil, Trash2, X } from "lucide-react";
import {
  cleanupWalletTransactions,
  deleteWalletTransaction,
  updateWalletTransaction,
} from "@/lib/wallet/actions";

export type WalletTx = {
  id: string;
  type: string; // topup | charge
  amountCents: number;
  status: string; // pending | completed | failed
  note: string | null;
  paymentMethod: string | null;
  dateLabel: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending: "En attente",
  completed: "Confirmé",
  failed: "Échoué",
};

function formatFcfa(cents: number) {
  return `FCFA ${cents.toLocaleString("en-US")}`;
}

function transactionLabel(t: WalletTx) {
  if (t.status === "pending") return "Paiement en attente";
  if (t.status === "failed") return "Dépôt échoué";
  if (t.type === "topup") return t.paymentMethod ? "Dépôt Genius Pay" : "Dépôt manuel";
  return t.note?.startsWith("Configuration automatique") ? "Débit Auto-Setup" : "Débit VPN";
}

function transactionTone(t: WalletTx) {
  if (t.status === "pending") return "bg-clay text-ink-soft";
  if (t.status === "failed") return "bg-err-soft text-err";
  return t.type === "topup" ? "bg-clay text-ok" : "bg-clay text-warn";
}

function amountPrefix(t: WalletTx) {
  if (t.status !== "completed") return "";
  return t.type === "topup" ? "+" : "-";
}

/** Une transaction en attente ou échouée peut être supprimée (hors solde). */
function isDeletable(t: WalletTx) {
  return t.status === "pending" || t.status === "failed";
}

export default function WalletTransactions({ transactions }: { transactions: WalletTx[] }) {
  const [editing, setEditing] = useState<WalletTx | null>(null);
  const [pending, startTransition] = useTransition();
  const cleanableCount = transactions.filter(isDeletable).length;

  function doDelete(id: string) {
    if (pending) return;
    if (!confirm("Supprimer cette transaction ? (sans effet sur le solde)")) return;
    const fd = new FormData();
    fd.set("id", id);
    startTransition(async () => {
      await deleteWalletTransaction(undefined, fd);
    });
  }

  function doCleanup() {
    if (pending) return;
    if (!confirm(`Supprimer les ${cleanableCount} transaction(s) en attente/échouée(s) ?`)) return;
    startTransition(async () => {
      await cleanupWalletTransactions();
    });
  }

  if (transactions.length === 0) {
    return (
      <p className="mt-5 rounded-lg border border-line-soft px-3 py-6 text-center text-sm text-ink-soft">
        Aucune transaction pour le moment.
      </p>
    );
  }

  return (
    <>
      {cleanableCount > 0 && (
        <div className="mt-5 flex items-center justify-end">
          <button
            type="button"
            onClick={doCleanup}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-md border border-line-soft bg-paper px-3 py-1.5 text-xs font-semibold text-ink-soft hover:bg-clay disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Nettoyer les échouées / en attente ({cleanableCount})
          </button>
        </div>
      )}

      {/* Mobile : liste de cartes compactes */}
      <div className="mt-3 space-y-2 sm:hidden">
        {transactions.map((t) => (
          <div key={t.id} className="rounded-lg border border-line-soft p-3 text-sm">
            <div className="flex items-start justify-between gap-2">
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${transactionTone(t)}`}>
                {transactionLabel(t)}
              </span>
              <span className={`font-medium ${transactionTone(t).split(" ").at(-1)}`}>
                {amountPrefix(t)}
                {formatFcfa(t.amountCents)}
              </span>
            </div>
            <p className="mt-1.5 text-ink-soft">{t.dateLabel}</p>
            {t.note && <p className="mt-0.5 break-words text-ink-soft">{t.note}</p>}
            <div className="mt-2 flex gap-3">
              <button
                type="button"
                onClick={() => setEditing(t)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-ink hover:underline"
              >
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </button>
              {isDeletable(t) && (
                <button
                  type="button"
                  onClick={() => doDelete(t.id)}
                  disabled={pending}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-err hover:underline disabled:opacity-60"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Supprimer
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop / tablette : table */}
      <div className="mt-3 hidden overflow-x-auto rounded-lg border border-line-soft sm:block">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="px-3 py-2 font-medium">Date</th>
              <th className="px-3 py-2 font-medium">Type</th>
              <th className="px-3 py-2 font-medium">Montant</th>
              <th className="px-3 py-2 font-medium">Note</th>
              <th className="px-3 py-2 text-right font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {transactions.map((t) => (
              <tr key={t.id}>
                <td className="whitespace-nowrap px-3 py-2 text-ink-soft">{t.dateLabel}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${transactionTone(t)}`}>
                    {transactionLabel(t)}
                  </span>
                </td>
                <td className={`whitespace-nowrap px-3 py-2 font-medium ${transactionTone(t).split(" ").at(-1)}`}>
                  {amountPrefix(t)}
                  {formatFcfa(t.amountCents)}
                </td>
                <td className="px-3 py-2 text-ink-soft">{t.note ?? "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setEditing(t)}
                      title="Modifier"
                      aria-label="Modifier"
                      className="rounded-md p-1.5 text-ink-soft hover:bg-clay hover:text-ink"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    {isDeletable(t) && (
                      <button
                        type="button"
                        onClick={() => doDelete(t.id)}
                        disabled={pending}
                        title="Supprimer"
                        aria-label="Supprimer"
                        className="rounded-md p-1.5 text-err hover:bg-err-soft disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editing && <EditModal tx={editing} onClose={() => setEditing(null)} />}
    </>
  );
}

function EditModal({ tx, onClose }: { tx: WalletTx; onClose: () => void }) {
  const [state, action, pending] = useActionState(updateWalletTransaction, undefined);

  useEffect(() => {
    if (state && "success" in state && state.success) onClose();
  }, [state, onClose]);

  const error = state && "error" in state ? state.error : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-paper p-5 shadow-xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-soft">
              Transaction
            </p>
            <h2 className="mt-1 text-lg font-semibold text-ink">Modifier la transaction</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" disabled={pending}>
            <X className="h-5 w-5 text-ink-soft" />
          </button>
        </div>

        {error && <p className="mt-4 rounded-md bg-err-soft px-3 py-2 text-sm text-err">{error}</p>}

        <form action={action} className="mt-4 space-y-4">
          <input type="hidden" name="id" value={tx.id} />

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Montant (FCFA)</label>
            <input
              name="amount"
              type="number"
              min={1}
              step={1}
              required
              defaultValue={tx.amountCents}
              className="w-full rounded-md border border-line-soft bg-paper px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Statut</label>
            <select
              name="status"
              defaultValue={tx.status}
              className="w-full rounded-md border border-line-soft bg-paper px-3 py-2.5 text-sm text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            >
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-ink">Note</label>
            <input
              name="note"
              defaultValue={tx.note ?? ""}
              placeholder="Ex : reçu Wave du 22/07"
              className="w-full rounded-md border border-line-soft bg-paper px-3 py-2.5 text-sm focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink"
            />
          </div>

          <p className="rounded-md border border-line-soft bg-clay px-3 py-2 text-xs leading-5 text-ink-soft">
            Le solde est la somme des transactions <b>confirmées</b>. Changer le montant ou passer une
            transaction en « Confirmé » modifie donc le solde.
          </p>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="flex-1 rounded-md border border-line-soft bg-paper px-4 py-2.5 text-sm font-semibold text-ink hover:bg-clay disabled:opacity-60"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={pending}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-deep-line disabled:opacity-60"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
