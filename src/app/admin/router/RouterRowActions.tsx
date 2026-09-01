"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { MoreVertical } from "lucide-react";
import { deleteRouter, resetRouterDevice } from "@/lib/mikrotik/actions";
import RouterDangerDialog from "./RouterDangerDialog";
import type { ActionDestructive } from "@/lib/mikrotik/action-destructive";
import type { RouterDictionary } from "./RoutersTable";

/* Le nom du routeur descend jusqu'ici : la confirmation se fait depuis UNE
   LIGNE parmi d'autres, elle doit dire laquelle. */
type PendingAction = null | ActionDestructive;

export default function RouterRowActions({
  routerId,
  routerName,
  t,
}: {
  routerId: string;
  routerName: string;
  t: RouterDictionary["actions"];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
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
          setOpen((o) => !o);
        }}
        className="rounded-md p-1.5 text-ink-soft hover:bg-clay hover:text-ink-soft"
        title={t.more}
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
