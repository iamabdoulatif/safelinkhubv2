"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MoreVertical } from "lucide-react";
import { deleteRouter, resetRouterDevice } from "@/lib/mikrotik/actions";
import type { RouterDictionary } from "./RoutersTable";

type PendingAction = null | "reset" | "delete";

export default function RouterRowActions({ routerId, t }: { routerId: string; t: RouterDictionary["actions"] }) {
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
        ? t.resetConfirm
        : t.removeConfirm;
    return (
      <div className="flex items-center justify-end gap-2 whitespace-nowrap">
        <span className="text-xs text-ink-soft">{label} ?</span>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={pending}
          className="rounded-md bg-err px-2.5 py-1 text-xs font-medium text-white hover:bg-ink disabled:opacity-60"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t.confirm}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(null)}
          disabled={pending}
          className="rounded-md border border-line-soft px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-clay"
        >
          {t.cancel}
        </button>
      </div>
    );
  }

  return (
    <div ref={menuRef} className="relative flex items-center justify-end gap-2">
      {error && <span className="text-xs text-err">{error}</span>}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-md p-1.5 text-ink-soft hover:bg-clay hover:text-ink-soft"
        title={t.more}
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-10 w-56 rounded-md border border-line bg-paper py-1">
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
        </div>
      )}
    </div>
  );
}
