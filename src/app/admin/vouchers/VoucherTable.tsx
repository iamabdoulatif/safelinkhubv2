"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Loader2 } from "lucide-react";
import DownloadVouchersModal, {
  type SelectedVoucher,
} from "./DownloadVouchersModal";
import { deleteVouchers } from "@/lib/vouchers/actions";
import type { TicketBrand } from "@/lib/vouchers/ticket-templates";

export type VoucherRow = {
  id: string;
  username: string;
  packageName: string;
  price: string | null;
  validity: string | null;
  status: string;
  firstLogin: string;
  expiresOn: string;
  /** true = pas encore d'horloge démarrée (durée affichée, pas une date). */
  expiresPending: boolean;
  useCase: string;
  note: string;
  createdOn: string;
};

export default function VoucherTable({
  vouchers,
  brand,
  headerExtra,
}: {
  vouchers: VoucherRow[];
  brand: TicketBrand;
  headerExtra?: ReactNode;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const allSelected = vouchers.length > 0 && selected.size === vouchers.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(vouchers.map((v) => v.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runDelete(ids: string[], marker: string) {
    setBusyId(marker);
    startTransition(async () => {
      await deleteVouchers(ids);
      setSelected((prev) => {
        const next = new Set(prev);
        for (const id of ids) next.delete(id);
        return next;
      });
      setBusyId(null);
      router.refresh();
    });
  }

  function deleteOne(id: string, username: string) {
    if (!window.confirm(`Supprimer le voucher « ${username} » ? Il sera retiré du/des routeur(s).`))
      return;
    runDelete([id], id);
  }

  function deleteSelected() {
    const ids = [...selected];
    if (ids.length === 0) return;
    if (
      !window.confirm(
        `Supprimer ${ids.length} voucher(s) sélectionné(s) ? Ils seront retirés du/des routeur(s). Action irréversible.`,
      )
    )
      return;
    runDelete(ids, "bulk");
  }

  const selectedVouchers = useMemo<SelectedVoucher[]>(
    () =>
      vouchers
        .filter((v) => selected.has(v.id))
        .map((v) => ({
          code: v.username,
          packageName: v.packageName,
          price: v.price,
          validity: v.validity,
        })),
    [vouchers, selected],
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-ink">Vouchers</h1>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={pending}
              className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
            >
              {pending && busyId === "bulk" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4" />
              )}
              Supprimer la sélection ({selected.size})
            </button>
          )}
          {headerExtra}
          <DownloadVouchersModal
            selectedVouchers={selectedVouchers}
            brand={brand}
          />
        </div>
      </div>

      <div className="mt-4 overflow-hidden border-2 border-line bg-paper table-mobile-wrapper">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line-soft bg-clay text-ink-soft">
            <tr>
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                />
              </th>
              <th className="px-4 py-3 font-medium">Nom d&apos;utilisateur</th>
              <th className="px-4 py-3 font-medium">Forfait</th>
              <th className="px-4 py-3 font-medium">Statut</th>
              <th className="px-4 py-3 font-medium">Première connexion</th>
              <th className="px-4 py-3 font-medium">Expire le</th>
              <th className="px-4 py-3 font-medium">Cas d&apos;usage</th>
              <th className="px-4 py-3 font-medium">Note</th>
              <th className="px-4 py-3 font-medium">Créé le</th>
              <th className="w-12 px-4 py-3 font-medium text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={10} className="px-4 py-8 text-center text-ink-soft">
                  Aucun voucher pour le moment. Générez votre premier lot.
                </td>
              </tr>
            )}
            {vouchers.map((v) => (
              <tr key={v.id} className={busyId === v.id ? "opacity-40" : ""}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggleOne(v.id)}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-ink">
                  {v.username}
                </td>
                <td className="px-4 py-3 text-ink-soft">{v.packageName}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-ink px-2 py-0.5 text-xs font-medium text-white">
                    {v.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-ink-soft">{v.firstLogin}</td>
                <td className="px-4 py-3">
                  {v.expiresPending ? (
                    <span
                      className="text-ink-soft italic"
                      title="L'expiration démarre à la première connexion du client."
                    >
                      {v.expiresOn}
                    </span>
                  ) : (
                    <span className="whitespace-nowrap text-ink">
                      {v.expiresOn}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-ink-soft">{v.useCase}</td>
                <td className="px-4 py-3 text-ink-soft">{v.note}</td>
                <td className="px-4 py-3 text-ink-soft">{v.createdOn}</td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => deleteOne(v.id, v.username)}
                    disabled={pending}
                    aria-label={`Supprimer ${v.username}`}
                    className="rounded p-1.5 text-ink-soft hover:bg-red-50 hover:text-red-600 disabled:opacity-40"
                  >
                    {busyId === v.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-line-soft px-4 py-3 text-sm text-ink-soft">
          <span>
            {selected.size} sur {vouchers.length} ligne(s) sélectionnée(s).
          </span>
        </div>
      </div>
    </div>
  );
}
