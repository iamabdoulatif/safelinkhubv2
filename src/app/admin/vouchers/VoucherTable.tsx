"use client";

import { useMemo, useState, type ReactNode } from "react";
import DownloadVouchersModal from "./DownloadVouchersModal";

export type VoucherRow = {
  id: string;
  username: string;
  packageName: string;
  status: string;
  firstLogin: string;
  expiresOn: string;
  useCase: string;
  note: string;
  createdOn: string;
};

export default function VoucherTable({
  vouchers,
  headerExtra,
}: {
  vouchers: VoucherRow[];
  headerExtra?: ReactNode;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

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

  const selectedUsernames = useMemo(
    () => vouchers.filter((v) => selected.has(v.id)).map((v) => v.username),
    [vouchers, selected],
  );

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Vouchers</h1>
        <div className="flex items-center gap-2">
          {headerExtra}
          <DownloadVouchersModal selectedUsernames={selectedUsernames} />
        </div>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-slate-400">
                  Aucun voucher pour le moment. Générez votre premier lot.
                </td>
              </tr>
            )}
            {vouchers.map((v) => (
              <tr key={v.id}>
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selected.has(v.id)}
                    onChange={() => toggleOne(v.id)}
                  />
                </td>
                <td className="px-4 py-3 font-mono text-slate-900">
                  {v.username}
                </td>
                <td className="px-4 py-3 text-slate-600">{v.packageName}</td>
                <td className="px-4 py-3">
                  <span className="rounded-full bg-slate-900 px-2 py-0.5 text-xs font-medium text-white">
                    {v.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-slate-600">{v.firstLogin}</td>
                <td className="px-4 py-3 text-slate-600">{v.expiresOn}</td>
                <td className="px-4 py-3 text-slate-600">{v.useCase}</td>
                <td className="px-4 py-3 text-slate-600">{v.note}</td>
                <td className="px-4 py-3 text-slate-600">{v.createdOn}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-sm text-slate-500">
          <span>
            {selected.size} sur {vouchers.length} ligne(s) sélectionnée(s).
          </span>
        </div>
      </div>
    </div>
  );
}
