"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreVertical } from "lucide-react";
import { deleteRouter, resetRouterDevice } from "@/lib/mikrotik/actions";

type PendingAction = null | "reset" | "delete";

export default function RouterRowActions({ routerId }: { routerId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<PendingAction>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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
    if ("message" in result && result.message) {
      alert(result.message);
    }
    router.refresh();
  }

  if (confirming) {
    const label =
      confirming === "reset"
        ? "Réinitialiser ce processus de configuration"
        : "Supprimer définitivement ce routeur";
    return (
      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
        <span className="text-xs text-slate-500">{label} ?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Confirmer"}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          disabled={pending}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative flex items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
        title="Actions"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-10 w-56 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setConfirming("reset");
            }}
            className="block w-full px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
          >
            Réinitialiser le processus
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              setConfirming("delete");
            }}
            className="block w-full px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50"
          >
            Supprimer le routeur
          </button>
        </div>
      )}
    </div>
  );
}
