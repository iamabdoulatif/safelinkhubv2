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
        <h1 className="text-2xl font-bold text-ink">Vouchers</h1>
        <div className="flex items-center gap-2">
          {headerExtra}
          <DownloadVouchersModal selectedUsernames={selectedUsernames} />
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
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {vouchers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-ink-soft">
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
                <td className="px-4 py-3 text-ink-soft">{v.expiresOn}</td>
                <td className="px-4 py-3 text-ink-soft">{v.useCase}</td>
                <td className="px-4 py-3 text-ink-soft">{v.note}</td>
                <td className="px-4 py-3 text-ink-soft">{v.createdOn}</td>
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
