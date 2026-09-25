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
  X,
} from "lucide-react";
import DownloadVouchersModal, {
  type SelectedVoucher,
} from "./DownloadVouchersModal";
import { archiveVouchers, deleteVouchers, emptyVoucherTrash, restoreVouchers } from "@/lib/vouchers/actions";
import type { VoucherDeleteScope } from "@/lib/vouchers/delete-scope";
import DeleteTicketsModal from "./DeleteTicketsModal";
import type { TicketBrand } from "@/lib/vouchers/ticket-templates";
import { TICKET_STATES, originLabel, ticketState, type TicketState } from "./voucher-state";

/** Lignes rendues d'un coup : au-delà, « Afficher plus ». Des milliers de
 *  lignes d'un bloc figeaient la page sur un téléphone de guichet. */
const PAGE_SIZE = 50;

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
  const [stateFilter, setStateFilter] = useState<TicketState | "all">("all");
  const [shown, setShown] = useState(PAGE_SIZE);
  // Date de référence figée au rendu : les états ne changent pas sous les doigts.
  const [now] = useState(() => Date.now());
  const withState = useMemo(
    () => vouchers.map((v) => ({ ...v, state: ticketState(v, now) })),
    [vouchers, now],
  );
  const counts = useMemo(() => {
    const c: Record<TicketState, number> = { unused: 0, running: 0, expired: 0, suspended: 0 };
    for (const v of withState) c[v.state] += 1;
    return c;
  }, [withState]);
  const visible = withState.filter(
    (v) =>
      (stateFilter === "all" || v.state === stateFilter) &&
      (!normalizedQuery || `${v.username} ${v.note} ${v.packageName}`.toLowerCase().includes(normalizedQuery)),
  );
  const rendered = visible.slice(0, shown);
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
    setStateFilter("all");
    setShown(PAGE_SIZE);
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

  const bulkBusy = pending && busyId === "bulk";
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">Tickets</h1>
          <p className="mt-1 max-w-xl text-sm text-ink-soft">
            Générez, importez et retrouvez chaque code d&apos;accès vendu ou posé sur vos routeurs.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">{headerExtra}</div>
      </header>

      {/* Les quatre états qui comptent au guichet — cliquables : ils filtrent. */}
      {view === "active" && (
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line-soft sm:grid-cols-4">
          {TICKET_STATES.map((st) => {
            const on = stateFilter === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setStateFilter(on ? "all" : st.id);
                  setShown(PAGE_SIZE);
                }}
                aria-pressed={on}
                className={`px-4 py-3 text-left transition-colors ${on ? "bg-clay" : "bg-paper hover:bg-clay/50"}`}
              >
                <span className="text-xs text-ink-soft">{st.label}</span>
                <span className="mt-0.5 block text-2xl font-semibold tabular-nums text-ink">
                  {counts[st.id].toLocaleString("fr-FR")}
                </span>
              </button>
            );
          })}
        </div>
      )}

      <section className="overflow-hidden rounded-2xl border border-line bg-paper">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 md:px-5">
          <div className="inline-flex gap-1 rounded-xl border border-line bg-clay/60 p-1" role="tablist" aria-label="Vue des tickets">
            {(
              [
                ["active", "Actifs", stats.active],
                ["trash", "Corbeille", stats.trashed],
              ] as const
            ).map(([id, label, count]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={view === id}
                onClick={() => setView(id)}
                className={`inline-flex h-8 items-center gap-2 rounded-lg px-3 text-sm ${
                  view === id ? "bg-paper font-semibold text-ink shadow-menu" : "text-ink-soft hover:text-ink"
                }`}
              >
                {label}
                <span className="rounded-full bg-clay px-1.5 text-xs tabular-nums text-ink-soft">{count}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {stateFilter !== "all" && (
              <button
                type="button"
                onClick={() => setStateFilter("all")}
                className="inline-flex h-8 items-center gap-1 rounded-full bg-clay px-3 text-xs font-medium text-ink"
              >
                {TICKET_STATES.find((st) => st.id === stateFilter)?.label}
                <X aria-label="Retirer le filtre" className="h-3.5 w-3.5" />
              </button>
            )}
            <div className="relative">
              <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setShown(PAGE_SIZE);
                }}
                aria-label="Rechercher un ticket"
                placeholder="Code, note, forfait…"
                className="field w-56 max-w-[60vw] pl-9"
              />
            </div>
            {view === "active" && <DownloadVouchersModal selectedVouchers={selectedVouchers} brand={brand} />}
            {view === "trash" && stats.trashed > 0 && (
              <button
                type="button"
                onClick={() => setDeleteAsk({ mode: "empty", ids: [] })}
                disabled={pending}
                className="btn btn-md btn-ghost inline-flex items-center gap-2"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Vider la corbeille
              </button>
            )}
          </div>
        </div>

        {/* Barre de sélection : n'existe que quand elle sert. */}
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-slate-deep px-4 py-2.5 text-sm text-white md:px-5">
            <span className="mr-auto font-medium">
              {selected.size} ticket{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}
            </span>
            <button
              type="button"
              onClick={() => (view === "active" ? archive([...selected]) : restore([...selected]))}
              disabled={pending}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white/10 px-3 font-semibold hover:bg-white/20 disabled:opacity-50"
            >
              {bulkBusy ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : view === "active" ? (
                <Archive aria-hidden="true" className="h-4 w-4" />
              ) : (
                <ArchiveRestore aria-hidden="true" className="h-4 w-4" />
              )}
              {view === "active" ? "Archiver" : "Restaurer"}
            </button>
            {view === "trash" && (
              <button
                type="button"
                onClick={() => setDeleteAsk({ mode: "selection", ids: [...selected] })}
                disabled={pending}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-err px-3 font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                <Trash2 aria-hidden="true" className="h-4 w-4" />
                Supprimer
              </button>
            )}
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="inline-flex h-8 items-center rounded-lg px-2 text-white/80 hover:text-white"
            >
              Désélectionner
            </button>
          </div>
        )}

        {actionMessage && (
          <div
            className={`mx-4 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm md:mx-5 ${
              actionMessage.kind === "success" ? "bg-ok-soft text-ok" : "bg-err-soft text-err"
            }`}
            aria-live="polite"
          >
            <span className="inline-flex items-center gap-2">
              {actionMessage.kind === "success" ? (
                <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
              ) : (
                <AlertCircle aria-hidden="true" className="h-4 w-4" />
              )}
              {actionMessage.text}
            </span>
            {actionMessage.kind === "success" && actionMessage.undoIds && (
              <button
                type="button"
                onClick={() => runMutation(actionMessage.undoIds!, "restore", "undo")}
                disabled={pending}
                className="inline-flex items-center gap-1 font-semibold underline underline-offset-2 disabled:opacity-50"
              >
                <RotateCcw aria-hidden="true" className="h-3.5 w-3.5" />
                Annuler
              </button>
            )}
          </div>
        )}

        <div className="table-mobile-wrapper overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="border-b border-line bg-clay/40 text-xs text-ink-soft">
              <tr>
                <th className="w-10 px-4 py-2.5">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label={`Tout sélectionner (${visible.length})`} />
                </th>
                <th className="px-4 py-2.5 font-medium">Code</th>
                <th className="px-4 py-2.5 font-medium">Forfait</th>
                <th className="px-4 py-2.5 font-medium">État</th>
                <th className="px-4 py-2.5 font-medium">Expiration</th>
                <th className="px-4 py-2.5 font-medium">Origine</th>
                <th className="px-4 py-2.5 font-medium">Note</th>
                <th className="px-4 py-2.5 font-medium">{view === "trash" ? "Archivé le" : "Créé le"}</th>
                <th className="w-32 px-4 py-2.5 text-right font-medium">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-4 py-14 text-center">
                    <Ticket aria-hidden="true" className="mx-auto mb-3 h-7 w-7 text-ink-soft" />
                    {normalizedQuery || stateFilter !== "all" ? (
                      <>
                        <p className="font-semibold text-ink">Aucun ticket ne correspond.</p>
                        <p className="mt-1 text-sm text-ink-soft">Changez la recherche ou retirez le filtre d&apos;état.</p>
                      </>
                    ) : (
                      <>
                        <p className="font-semibold text-ink">
                          {view === "active" ? "Aucun ticket actif." : "La corbeille est vide."}
                        </p>
                        <p className="mt-1 text-sm text-ink-soft">
                          {view === "active"
                            ? "Générez un lot ou importez un export MikHmon."
                            : "Les tickets archivés apparaîtront ici et pourront être restaurés."}
                        </p>
                      </>
                    )}
                  </td>
                </tr>
              )}
              {rendered.map((voucher) => {
                const st = TICKET_STATES.find((s) => s.id === voucher.state)!;
                const isSelected = selected.has(voucher.id);
                return (
                  <tr
                    key={voucher.id}
                    className={busyId === voucher.id ? "opacity-40" : isSelected ? "bg-clay/60" : "hover:bg-clay/40"}
                  >
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleOne(voucher.id)}
                        aria-label={`Sélectionner ${voucher.username}`}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-mono text-[13px] font-semibold tracking-wide text-ink">{voucher.username}</span>
                    </td>
                    <td className="min-w-44 px-4 py-3">
                      <div className="font-medium text-ink">{voucher.packageName}</div>
                      <div className="mt-0.5 text-xs text-ink-soft">
                        {[voucher.validity, voucher.price].filter(Boolean).join(" · ") || "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-semibold ${st.tone}`}>
                        {st.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-ink-soft">
                      {voucher.expiresPending ? (
                        <span className="text-xs">{voucher.expiresOn}</span>
                      ) : (
                        <>
                          <span className="whitespace-nowrap text-ink">{voucher.expiresOn}</span>
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
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft" title={voucher.useCase}>
                      {originLabel(voucher.useCase)}
                    </td>
                    <td className="max-w-52 truncate px-4 py-3 text-ink-soft" title={voucher.note}>{voucher.note}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-ink-soft">
                      {view === "trash" ? voucher.deletedOn : voucher.createdOn}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => (view === "active" ? archive([voucher.id], voucher.username) : restore([voucher.id]))}
                        disabled={pending}
                        className="btn btn-sm btn-ghost inline-flex items-center gap-1.5"
                      >
                        {busyId === voucher.id ? (
                          <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                        ) : view === "active" ? (
                          <Archive aria-hidden="true" className="h-3.5 w-3.5" />
                        ) : (
                          <ArchiveRestore aria-hidden="true" className="h-3.5 w-3.5" />
                        )}
                        {view === "active" ? "Archiver" : "Restaurer"}
                      </button>
                      {view === "trash" && (
                        <button
                          type="button"
                          onClick={() => setDeleteAsk({ mode: "selection", ids: [voucher.id] })}
                          disabled={pending}
                          aria-label={`Supprimer définitivement le ticket ${voucher.username}`}
                          className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-err-soft hover:text-err disabled:opacity-40"
                        >
                          <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-xs text-ink-soft md:px-5">
          <span className="tabular-nums">
            {Math.min(shown, visible.length).toLocaleString("fr-FR")} sur {visible.length.toLocaleString("fr-FR")} ticket(s)
          </span>
          {visible.length > shown && (
            <button type="button" onClick={() => setShown((n) => n + PAGE_SIZE)} className="btn btn-sm btn-outline">
              Afficher {Math.min(PAGE_SIZE, visible.length - shown)} de plus
            </button>
          )}
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
