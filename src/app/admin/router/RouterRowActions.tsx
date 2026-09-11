"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Loader2, MoreVertical, Pencil } from "lucide-react";
import { deleteRouter, renameRouter, resetRouterDevice } from "@/lib/mikrotik/actions";
import RouterDangerDialog from "./RouterDangerDialog";
import RouterLockButton from "@/components/RouterLockButton";
import type { ActionDestructive } from "@/lib/mikrotik/action-destructive";
import type { RouterDictionary } from "./RoutersTable";

/* Le nom du routeur descend jusqu'ici : la confirmation se fait depuis UNE
   LIGNE parmi d'autres, elle doit dire laquelle. */
type PendingAction = null | ActionDestructive;

export default function RouterRowActions({
  routerId,
  routerName,
  t,
  canLock = false,
  locked = false,
}: {
  routerId: string;
  routerName: string;
  t: RouterDictionary["actions"];
  /* Superadmin : le kill-switch est RECUEILLI ici plutôt que posé en bouton
     rouge dans la ligne. Il coupe tous les ports d'un client — le sortir du
     flux de lecture évite le clic de travers, sans rien retirer. */
  canLock?: boolean;
  locked?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  /* Renommage SUR PLACE : le menu devient un petit formulaire. Pas de dialogue —
     un nom n'est pas une action destructive, il n'a pas à interrompre. */
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(routerName);
  const [renamePending, setRenamePending] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  /* Position du menu, mesurée sur le bouton. Voir le portail plus bas. */
  const [ancre, setAncre] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  async function submitRename() {
    const name = draft.trim();
    if (renamePending) return;
    if (name === routerName) {
      setRenaming(false);
      setOpen(false);
      return;
    }
    setRenamePending(true);
    setRenameError(null);
    const result = await renameRouter(routerId, name);
    setRenamePending(false);
    if ("error" in result && result.error) {
      setRenameError(result.error);
      return;
    }
    setRenaming(false);
    setOpen(false);
    setNotice(`${routerName} → ${name}`);
    router.refresh();
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    const result =
      confirming === "reset" ? await resetRouterDevice(routerId) : await deleteRouter(routerId);
    setPending(false);
    if (result?.error) {
      setError(result.error);
      return;
    }
    setConfirming(null);
    /* Le message de retour n'est plus jeté dans un `alert()` : il s'affiche
       dans la ligne, où l'exploitant regarde déjà. */
    if ("message" in result && typeof result.message === "string") setNotice(result.message);
    router.refresh();
  }

  return (
    <div ref={menuRef} className="relative flex items-center justify-end gap-2">
      {notice && <span className="text-xs text-ok">{notice}</span>}
      {error && !confirming && <span className="text-xs text-err">{error}</span>}
      <button
        type="button"
        ref={bouton}
        onClick={() => {
          const r = bouton.current?.getBoundingClientRect();
          if (r) setAncre({ top: r.bottom + 6, right: window.innerWidth - r.right });
          // Un menu rouvert repart sur la liste, jamais sur un formulaire à moitié rempli.
          setRenaming(false);
          setRenameError(null);
          setOpen((o) => !o);
        }}
        className="flex h-11 w-11 items-center justify-center rounded-full text-ink-soft hover:bg-clay hover:text-ink"
        title={t.more}
        aria-label={t.more}
        aria-expanded={open}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {/* LE MENU EST RENDU DANS UN PORTAIL.
          Le tableau porte `overflow-x-auto` pour défiler sur petit écran, ce
          qui ROGNAIT le menu : il sortait tronqué au bord du tableau. Un
          `position: fixed` ne suffirait pas — les cartes de cette page portent
          une animation `transform`, qui recrée un bloc conteneur et ramène le
          fixed au comportement d'un absolute. Le portail sort du sujet une
          bonne fois, et la position est mesurée sur le bouton. */}
      {open && ancre && createPortal(
        <div
          className="fixed z-50 w-64 overflow-hidden rounded-xl border border-line bg-paper py-1 shadow-xl"
          style={{ top: ancre.top, right: ancre.right }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {renaming ? (
            <form
              className="px-3 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submitRename();
              }}
            >
              <label className="block text-[11px] font-semibold uppercase tracking-wide text-ink-soft">
                {t.rename}
              </label>
              <input
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setRenaming(false);
                    setRenameError(null);
                  }
                }}
                maxLength={64}
                disabled={renamePending}
                className="mt-1.5 w-full rounded-lg border border-line bg-paper px-2.5 py-1.5 text-sm text-ink outline-none focus:border-ink disabled:opacity-60"
              />
              <p className="mt-1.5 text-[11px] leading-4 text-ink-soft">{t.renameHint}</p>
              {renameError && (
                <p role="alert" className="mt-1.5 text-[11px] font-medium text-err">
                  {renameError}
                </p>
              )}
              <div className="mt-2 flex items-center justify-end gap-1.5">
                <button
                  type="button"
                  disabled={renamePending}
                  onClick={() => {
                    setRenaming(false);
                    setRenameError(null);
                    setDraft(routerName);
                  }}
                  className="rounded-lg border border-line bg-paper px-2.5 py-1 text-xs font-bold text-ink hover:bg-clay disabled:opacity-60"
                >
                  {t.cancel}
                </button>
                <button
                  type="submit"
                  disabled={renamePending || draft.trim().length < 2}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-brand px-2.5 py-1 text-xs font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60"
                >
                  {renamePending ? (
                    <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                  )}
                  {t.renameSave}
                </button>
              </div>
            </form>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setDraft(routerName);
                  setRenameError(null);
                  setRenaming(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-ink hover:bg-clay"
              >
                <Pencil aria-hidden="true" className="h-3.5 w-3.5" />
                {t.rename}
              </button>
              {canLock && (
                <div className="border-b border-line-soft pb-1">
                  <RouterLockButton routerId={routerId} locked={locked} variant="menu" />
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirming("reset");
                }}
                className="block w-full px-3 py-2 text-left text-sm text-ink hover:bg-clay"
              >
                {t.reset}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setConfirming("delete");
                }}
                className="block w-full px-3 py-2 text-left text-sm text-err hover:bg-err-soft"
              >
                {t.remove}
              </button>
            </>
          )}
        </div>,
        document.body,
      )}
      {confirming && (
        <RouterDangerDialog
          action={confirming}
          routerName={routerName}
          pending={pending}
          error={error}
          onConfirm={handleConfirm}
          onClose={() => {
            setConfirming(null);
            setError(null);
          }}
        />
      )}
    </div>
  );
}
