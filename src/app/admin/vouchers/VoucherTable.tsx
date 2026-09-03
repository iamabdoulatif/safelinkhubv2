"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Archive,
  ArchiveRestore,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Search,
  Trash2,
  Ticket,
} from "lucide-react";
import DownloadVouchersModal, {
  type SelectedVoucher,
} from "./DownloadVouchersModal";
import { archiveVouchers, deleteVouchers, emptyVoucherTrash, restoreVouchers } from "@/lib/vouchers/actions";
import type { VoucherDeleteScope } from "@/lib/vouchers/delete-scope";
import DeleteTicketsModal from "./DeleteTicketsModal";
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
  /** Date d'expiration en ms (null si en attente/inconnue) — pour le repère relatif. */
  expiresAtMs: number | null;
  useCase: string;
  note: string;
  deletedOn: string;
  createdOn: string;
};

type View = "active" | "trash";
type ActionMessage =
  | { kind: "success"; text: string; undoIds?: string[] }
  | { kind: "error"; text: string };

/** Repère relatif « dans N j » / « aujourd'hui » / « expiré », en jours calendaires.
 *  tone colore l'échéance proche (warn) ou dépassée (err). */
export function relativeExpiry(ms: number): { text: string; tone: "past" | "soon" | "normal" } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const exp = new Date(ms);
  exp.setHours(0, 0, 0, 0);
  const days = Math.round((exp.getTime() - today.getTime()) / 86_400_000);
  if (days < 0) return { text: days === -1 ? "expiré hier" : `expiré (${-days} j)`, tone: "past" };
  if (days === 0) return { text: "expire aujourd'hui", tone: "soon" };
  if (days === 1) return { text: "demain", tone: "soon" };
  return { text: `dans ${days} j`, tone: days <= 2 ? "soon" : "normal" };
}

/** Carte KPI posée : label discret, grand nombre tabulaire, ligne de contexte.
 *  `tone` "lead" ajoute un liseré lime sur la métrique qui compte. */
function Kpi({
  label,
  value,
  hint,
  tone = "plain",
}: {
  label: string;
  value: number;
  hint: string;
  tone?: "lead" | "muted" | "plain";
}) {
  const dot = tone === "lead" ? "bg-ok" : tone === "muted" ? "bg-ink-soft" : null;
  return (
    <div className={`relative rounded-2xl border border-line-soft bg-paper p-[18px] shadow-sm ${tone === "lead" ? "pl-[22px]" : ""}`}>
      {tone === "lead" && <span aria-hidden="true" className="absolute bottom-4 left-0 top-4 w-[3px] rounded bg-brand" />}
      <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">{label}</p>
      <p className="mt-2 text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-ink">
        {value.toLocaleString("fr-FR")}
      </p>
      <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-ink-soft">
        {dot && <span aria-hidden="true" className={`h-[7px] w-[7px] rounded-full ${dot}`} />}
        {hint}
      </p>
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
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<ActionMessage | null>(null);
  // Suppression définitive : le dialogue porte le choix de portée, jamais le bouton.
  const [deleteAsk, setDeleteAsk] = useState<{ mode: "selection" | "empty"; ids: string[] } | null>(null);
  const vouchers = view === "active" ? activeVouchers : trashedVouchers;
  // Recherche client sur code, note et nom de forfait (insensible à la casse).
  const normalizedQuery = query.trim().toLowerCase();
  const visible = normalizedQuery
    ? vouchers.filter((v) => `${v.username} ${v.note} ${v.packageName}`.toLowerCase().includes(normalizedQuery))
    : vouchers;
  // « Tout sélectionner » porte sur ce qui est VISIBLE (résultats du filtre).
  const allSelected = visible.length > 0 && visible.every((v) => selected.has(v.id));

  // Remise à zéro de la sélection au changement d'onglet, PENDANT le rendu et
  // non dans un effet : un setState dans un effet déclenche un second rendu en
  // cascade, et l'utilisateur voit brièvement la sélection de l'onglet précédent
  // appliquée au nouveau. C'est le motif « ajuster l'état pendant le rendu »
  // recommandé par React pour dériver d'un changement de valeur.
  const [renderedView, setRenderedView] = useState<View>(view);
  if (renderedView !== view) {
    setRenderedView(view);
    setSelected(new Set());
    setActionMessage(null);
    setQuery("");
  }

  function toggleAll() {
    setSelected((previous) => {
      const next = new Set(previous);
      for (const v of visible) {
        if (allSelected) next.delete(v.id);
        else next.add(v.id);
      }
      return next;
    });
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

  function confirmDelete(scope: VoucherDeleteScope) {
    if (!deleteAsk) return;
    const { mode, ids } = deleteAsk;
    setBusyId("delete");
    setActionMessage(null);
    startTransition(async () => {
      try {
        const result = mode === "empty" ? await emptyVoucherTrash(scope) : await deleteVouchers(ids, scope);
        if ("error" in result) {
          setActionMessage({ kind: "error", text: result.error });
          return;
        }
        // Message FACTUEL : ce qui a été supprimé, ce qui a été retiré du
        // matériel, et surtout ce qui a été volontairement CONSERVÉ.
        const parts = [`${result.deleted} ticket(s) supprimé(s) de la plateforme.`];
        if (result.removedOnRouter > 0) parts.push(`${result.removedOnRouter} retiré(s) du MikroTik.`);
        if (result.keptForUnreachableRouter > 0) {
          parts.push(
            `${result.keptForUnreachableRouter} conservé(s) : routeur injoignable (${result.unreachableRouters.join(", ")}). Relancez quand il sera revenu.`,
          );
        }
        if (result.remaining > 0) parts.push(`${result.remaining} restant(s) — relancez pour continuer.`);
        setSelected(new Set());
        setDeleteAsk(null);
        setActionMessage({
          kind: result.keptForUnreachableRouter > 0 ? "error" : "success",
          text: parts.join(" "),
        });
        router.refresh();
      } catch {
        setActionMessage({ kind: "error", text: "La suppression n'a pas pu être réalisée." });
      } finally {
        setBusyId(null);
      }
    });
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
      <section>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <span className="inline-flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-soft">
              <span aria-hidden="true" className="h-2 w-2 rounded-[2px] bg-brand" />
              Console d&apos;accès
            </span>
            <h1 className="mt-2.5 font-display text-3xl font-extrabold tracking-tight text-ink md:text-[34px]">
              Station Tickets
            </h1>
            <p className="mt-1.5 max-w-xl text-sm text-ink-soft">
              Pilotez, importez et retrouvez chaque accès vendu ou provisionné.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">{headerExtra}</div>
        </div>
        <div className="mt-6 grid grid-cols-1 gap-3.5 sm:grid-cols-3">
          <Kpi label="Tickets actifs" value={stats.active} hint="En circulation, provisionnés" tone="lead" />
          <Kpi
            label="Importés"
            value={stats.imported}
            hint={stats.imported > 0 ? "Lot importé en attente d'archivage" : "Aucun lot importé en attente"}
          />
          <Kpi label="Corbeille" value={stats.trashed} hint="Archivés, restaurables" tone="muted" />
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-line-soft bg-paper shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line-soft px-4 py-3 md:px-5">
          <div className="inline-flex gap-1 rounded-xl bg-clay p-1" role="tablist" aria-label="Vue des tickets">
            <button
              type="button"
              role="tab"
              aria-selected={view === "active"}
              onClick={() => setView("active")}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                view === "active" ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              Tickets actifs
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${view === "active" ? "bg-brand text-slate-deep" : "bg-clay text-ink-soft"}`}>
                {stats.active}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "trash"}
              onClick={() => setView("trash")}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors ${
                view === "trash" ? "bg-paper text-ink shadow-sm" : "text-ink-soft hover:text-ink"
              }`}
            >
              Corbeille
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums ${view === "trash" ? "bg-brand text-slate-deep" : "bg-clay text-ink-soft"}`}>
                {stats.trashed}
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Rechercher un ticket"
                placeholder="Rechercher un code, une note…"
                className="w-56 max-w-[44vw] rounded-lg border border-line bg-paper py-2 pl-9 pr-3 text-sm text-ink placeholder:text-ink-soft focus:border-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>
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
            {view === "trash" && selected.size > 0 && (
              <button
                type="button"
                onClick={() => setDeleteAsk({ mode: "selection", ids: [...selected] })}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-sm border border-line bg-paper px-3 py-2 text-sm font-bold text-ink hover:bg-err-soft disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Supprimer ({selected.size})
              </button>
            )}
            {view === "trash" && stats.trashed > 0 && (
              <button
                type="button"
                onClick={() => setDeleteAsk({ mode: "empty", ids: [] })}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-sm border border-line-soft px-3 py-2 text-sm font-bold text-ink-soft hover:border-ink hover:text-ink disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Vider la corbeille
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
            <thead className="border-b border-line-soft bg-paper font-mono text-[10.5px] font-semibold uppercase tracking-[0.11em] text-ink-soft">
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
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center">
                    <Ticket className="mx-auto mb-3 h-7 w-7 text-brand-deep" />
                    {normalizedQuery ? (
                      <>
                        <p className="font-bold text-ink">Aucun ticket ne correspond à « {query} ».</p>
                        <p className="mt-1 text-sm text-ink-soft">Essayez un autre code, une autre note ou un forfait.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-bold text-ink">
                          {view === "active" ? "Aucun ticket actif." : "La corbeille est vide."}
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">
                          {view === "active"
                            ? "Importez un export MikHmon ou générez un nouveau lot."
                            : "Les tickets archivés apparaîtront ici et pourront être restaurés."}
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              )}
              {visible.map((voucher) => (
                <tr key={voucher.id} className={busyId === voucher.id ? "opacity-40" : "transition-colors hover:bg-clay/45"}>
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.has(voucher.id)}
                      onChange={() => toggleOne(voucher.id)}
                      aria-label={`Sélectionner ${voucher.username}`}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-clay px-2 py-1 font-mono text-[13px] font-bold tracking-wide text-ink">
                      {voucher.username}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink">{voucher.packageName}</div>
                    {voucher.validity && <div className="mt-0.5 text-xs text-ink-soft">{voucher.validity}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-ok-soft px-2.5 py-1 text-xs font-semibold text-ok">
                      <i className="h-1.5 w-1.5 rounded-full bg-current" />
                      {voucher.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-ink-soft">
                    {voucher.expiresPending ? (
                      <em>{voucher.expiresOn}</em>
                    ) : (
                      <>
                        <span className="text-ink">{voucher.expiresOn}</span>
                        {voucher.expiresAtMs !== null && (() => {
                          const rel = relativeExpiry(voucher.expiresAtMs);
                          const tone = rel.tone === "past" ? "text-err" : rel.tone === "soon" ? "text-warn" : "text-ink-soft";
                          return (
                            <span suppressHydrationWarning className={`mt-0.5 block text-xs ${tone}`}>
                              {rel.text}
                            </span>
                          );
                        })()}
                      </>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center rounded-full border border-line-soft bg-paper px-2.5 py-1 text-xs font-medium text-ink-soft">
                      {voucher.useCase}
                    </span>
                  </td>
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
                      className="inline-flex items-center gap-1.5 rounded-lg border border-line-soft bg-paper px-2.5 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink hover:text-ink disabled:opacity-40"
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
                    {view === "trash" && (
                      <button
                        type="button"
                        onClick={() => setDeleteAsk({ mode: "selection", ids: [voucher.id] })}
                        disabled={pending}
                        aria-label={`Supprimer définitivement le ticket ${voucher.username}`}
                        className="ml-1.5 inline-flex items-center gap-1 rounded-sm border border-line-soft bg-paper px-2 py-1.5 text-xs font-bold text-ink hover:border-err hover:bg-err-soft disabled:opacity-40"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Supprimer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-line-soft px-4 py-3 text-xs text-ink-soft md:px-5">
          <span>{selected.size} sélectionné(s)</span>
          <span className="font-mono">{visible.length} ticket(s) affiché(s)</span>
        </div>
      </section>

      <DeleteTicketsModal
        open={deleteAsk !== null}
        mode={deleteAsk?.mode ?? "selection"}
        count={deleteAsk?.mode === "empty" ? stats.trashed : (deleteAsk?.ids.length ?? 0)}
        pending={pending && busyId === "delete"}
        onCancel={() => setDeleteAsk(null)}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
