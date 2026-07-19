"use client";

import { useEffect, useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Ticket,
} from "lucide-react";
import DownloadVouchersModal, {
  type SelectedVoucher,
} from "./DownloadVouchersModal";
import { archiveVouchers, restoreVouchers } from "@/lib/vouchers/actions";
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
  deletedOn: string;
  createdOn: string;
};

type View = "active" | "trash";
type ActionMessage =
  | { kind: "success"; text: string; undoIds?: string[] }
  | { kind: "error"; text: string };

function Metric({ label, value, tone }: { label: string; value: number; tone: "paper" | "brand" | "clay" }) {
  const palette = {
    paper: "bg-paper text-ink",
    brand: "bg-brand text-ink",
    clay: "bg-clay text-ink",
  }[tone];

  return (
    <div className={`flex min-h-24 items-end justify-between gap-3 px-5 py-4 ${palette}`}>
      <span className="text-xs font-bold uppercase tracking-[0.14em]">{label}</span>
      <strong className="font-mono text-3xl leading-none">{value}</strong>
    </div>
  );
}

export default function VoucherTable({
  activeVouchers,
  trashedVouchers,
  stats,
  brand,
  headerExtra,
}: {
  activeVouchers: VoucherRow[];
  trashedVouchers: VoucherRow[];
  stats: { active: number; imported: number; trashed: number };
  brand: TicketBrand;
  headerExtra?: ReactNode;
}) {
  const router = useRouter();
  const [view, setView] = useState<View>("active");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  const vouchers = view === "active" ? activeVouchers : trashedVouchers;
  const allSelected = vouchers.length > 0 && selected.size === vouchers.length;

  useEffect(() => {
    setSelected(new Set());
    setActionMessage(null);
  }, [view]);

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(vouchers.map((voucher) => voucher.id)));
  }

  function toggleOne(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function runMutation(ids: string[], action: "archive" | "restore", marker: string) {
    if (ids.length === 0) return;
    setBusyId(marker);
    setActionMessage(null);
    startTransition(async () => {
      try {
        const result = action === "archive" ? await archiveVouchers(ids) : await restoreVouchers(ids);
        if ("error" in result) {
          setActionMessage({ kind: "error", text: result.error ?? "Une erreur est survenue." });
          return;
        }

        setSelected(new Set());
        setActionMessage({
          kind: "success",
          text:
            "archived" in result
              ? `${result.archived} ticket(s) archivé(s).`
              : `${result.restored} ticket(s) restauré(s).`,
          undoIds: action === "archive" ? ids : undefined,
        });
        router.refresh();
      } catch {
        setActionMessage({
          kind: "error",
          text: "L'action n'a pas pu être réalisée. Réessayez dans un instant.",
        });
      } finally {
        setBusyId(null);
      }
    });
  }

  function archive(ids: string[], username?: string) {
    const label = username ? ` le ticket « ${username} »` : ` ${ids.length} ticket(s)`;
    if (!window.confirm(`Archiver${label} ? Vous pourrez les restaurer depuis la corbeille.`)) return;
    runMutation(ids, "archive", ids.length === 1 ? ids[0] : "bulk");
  }

  function restore(ids: string[]) {
    runMutation(ids, "restore", ids.length === 1 ? ids[0] : "bulk");
  }

  const selectedVouchers = useMemo<SelectedVoucher[]>(
    () =>
      activeVouchers
        .filter((voucher) => selected.has(voucher.id))
        .map((voucher) => ({
          code: voucher.username,
          packageName: voucher.packageName,
          price: voucher.price,
          validity: voucher.validity,
        })),
    [activeVouchers, selected],
  );

  return (
    <div className="space-y-5">
      <section className="overflow-hidden border-2 border-line bg-paper">
        <div className="relative overflow-hidden bg-ink px-5 py-6 text-paper md:px-7">
          <div className="absolute right-0 top-0 h-full w-24 border-l border-paper/20 bg-brand/90 sm:w-36" />
          <div className="relative flex flex-wrap items-end justify-between gap-5">
            <div>
              <div className="flex items-center gap-2 text-brand">
                <span className="h-2 w-2 bg-brand" />
                <p className="text-xs font-bold tracking-[0.18em]">CONSOLE D&apos;ACCÈS</p>
              </div>
              <h1 className="mt-2 font-display text-3xl font-black tracking-tight md:text-4xl">
                Station Tickets
              </h1>
              <p className="mt-1 max-w-xl text-sm text-paper/70">
                Pilotez, importez et retrouvez chaque accès Wi-Fi.
              </p>
            </div>
            <div className="relative flex flex-wrap items-center gap-2">{headerExtra}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 divide-y divide-line border-y-2 border-line md:grid-cols-3 md:divide-x md:divide-y-0">
          <Metric label="Tickets actifs" value={stats.active} tone="paper" />
          <Metric label="Importés" value={stats.imported} tone="brand" />
          <Metric label="Corbeille" value={stats.trashed} tone="clay" />
        </div>
      </section>

      <section className="border-2 border-line bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft bg-clay px-4 py-3 md:px-5">
          <div className="flex items-center gap-2" role="tablist" aria-label="Vue des tickets">
            <button
              type="button"
              role="tab"
              aria-selected={view === "active"}
              onClick={() => setView("active")}
              className={`rounded-sm border px-3 py-1.5 text-sm font-bold transition-colors ${
                view === "active"
                  ? "border-ink bg-ink text-paper"
                  : "border-line-soft bg-paper text-ink hover:border-ink"
              }`}
            >
              Tickets actifs <span className="ml-1 font-mono text-xs">{stats.active}</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "trash"}
              onClick={() => setView("trash")}
              className={`rounded-sm border px-3 py-1.5 text-sm font-bold transition-colors ${
                view === "trash"
                  ? "border-ink bg-ink text-paper"
                  : "border-line-soft bg-paper text-ink hover:border-ink"
              }`}
            >
              Corbeille <span className="ml-1 font-mono text-xs">{stats.trashed}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            {selected.size > 0 && (
              <button
                type="button"
                onClick={() =>
                  view === "active" ? archive([...selected]) : restore([...selected])
                }
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-sm bg-ink px-3 py-2 text-sm font-bold text-paper hover:bg-brand hover:text-ink disabled:opacity-50"
              >
                {pending && busyId === "bulk" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : view === "active" ? (
                  <Archive className="h-4 w-4" />
                ) : (
                  <ArchiveRestore className="h-4 w-4" />
                )}
                {view === "active" ? "Archiver" : "Restaurer"} ({selected.size})
              </button>
            )}
            {view === "active" && (
              <DownloadVouchersModal selectedVouchers={selectedVouchers} brand={brand} />
            )}
          </div>
        </div>

        {actionMessage && (
          <div
            className={`mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 border px-3 py-2 text-sm md:mx-5 ${
              actionMessage.kind === "success"
                ? "border-ok/30 bg-clay text-ok"
                : "border-err/30 bg-err-soft text-err"
            }`}
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-2">
              {actionMessage.kind === "success" ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              {actionMessage.text}
            </span>
            {actionMessage.kind === "success" && actionMessage.undoIds && (
              <button
                type="button"
                onClick={() => runMutation(actionMessage.undoIds!, "restore", "undo")}
                disabled={pending}
                className="inline-flex items-center gap-1 border-b border-current pb-0.5 font-bold hover:text-ink disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Annuler
              </button>
            )}
          </div>
        )}

        <div className="overflow-x-auto table-mobile-wrapper">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-line-soft bg-paper text-xs font-bold uppercase tracking-[0.1em] text-ink-soft">
              <tr>
                <th className="w-10 px-4 py-3">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Tout sélectionner" />
                </th>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Profil / forfait</th>
                <th className="px-4 py-3">État</th>
                <th className="px-4 py-3">Expiration</th>
                <th className="px-4 py-3">Origine</th>
                <th className="px-4 py-3">Note</th>
                <th className="px-4 py-3">{view === "trash" ? "Archivé le" : "Créé le"}</th>
                <th className="w-28 px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {vouchers.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <Ticket className="mx-auto mb-3 h-7 w-7 text-brand-deep" />
                    <p className="font-bold text-ink">
                      {view === "active" ? "Aucun ticket actif." : "La corbeille est vide."}
                    </p>
                    <p className="mt-1 text-sm text-ink-soft">
                      {view === "active"
                        ? "Importez un export MikHmon ou générez un nouveau lot."
                        : "Les tickets archivés apparaîtront ici et pourront être restaurés."}
                    </p>
                  </td>
                </tr>
              )}
              {vouchers.map((voucher) => (
                <tr key={voucher.id} className={busyId === voucher.id ? "opacity-40" : "hover:bg-clay/55"}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(voucher.id)}
                      onChange={() => toggleOne(voucher.id)}
                      aria-label={`Sélectionner ${voucher.username}`}
                    />
                  </td>
                  <td className="px-4 py-3 font-mono font-bold tracking-wide text-ink">{voucher.username}</td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-ink">{voucher.packageName}</div>
                    {voucher.validity && <div className="mt-0.5 text-xs text-ink-soft">{voucher.validity}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-ink/15 bg-paper px-2 py-1 text-xs font-bold text-ink">
                      <i className="h-1.5 w-1.5 rounded-full bg-ok" />
                      {voucher.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {voucher.expiresPending ? <em>{voucher.expiresOn}</em> : voucher.expiresOn}
                  </td>
                  <td className="px-4 py-3 text-ink-soft">{voucher.useCase}</td>
                  <td className="max-w-52 truncate px-4 py-3 text-ink-soft" title={voucher.note}>{voucher.note}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                    {view === "trash" ? voucher.deletedOn : voucher.createdOn}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() =>
                        view === "active"
                          ? archive([voucher.id], voucher.username)
                          : restore([voucher.id])
                      }
                      disabled={pending}
                      className="inline-flex items-center gap-1 rounded-sm border border-line-soft bg-paper px-2 py-1.5 text-xs font-bold text-ink hover:border-ink hover:bg-brand disabled:opacity-40"
                    >
                      {busyId === voucher.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : view === "active" ? (
                        <Archive className="h-3.5 w-3.5" />
                      ) : (
                        <ArchiveRestore className="h-3.5 w-3.5" />
                      )}
                      {view === "active" ? "Archiver" : "Restaurer"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line-soft px-4 py-3 text-xs text-ink-soft md:px-5">
          <span>{selected.size} sélectionné(s)</span>
          <span className="font-mono">{vouchers.length} ticket(s) affiché(s)</span>
        </div>
      </section>
    </div>
  );
}
