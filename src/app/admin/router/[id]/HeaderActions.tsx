"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { deleteRouter, refreshRouterStats } from "@/lib/mikrotik/actions";

export default function HeaderActions({ routerId }: { routerId: string }) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [isDeleting, startDelete] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (confirmingDelete) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-ink">
          Supprimer définitivement ce routeur ?
        </span>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() =>
            startDelete(async () => {
              const result = await deleteRouter(routerId);
              if (result?.error) {
                setError(result.error);
                setConfirmingDelete(false);
                return;
              }
              router.push("/admin/router");
              router.refresh();
            })
          }
          className="flex items-center gap-1.5 border-2 border-err bg-err px-3 py-1.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-paper hover:text-err disabled:opacity-60"
        >
          {isDeleting ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          )}
          Confirmer
        </button>
        <button
          type="button"
          disabled={isDeleting}
          onClick={() => setConfirmingDelete(false)}
          className="border-2 border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {error && (
        <span role="alert" className="text-xs font-medium text-err">
          {error}
        </span>
      )}
      <button
        type="button"
        disabled={isRefreshing}
        onClick={() =>
          startRefresh(async () => {
            setError(null);
            const result = await refreshRouterStats(routerId);
            setError(result?.error ?? null);
            router.refresh();
          })
        }
        className="flex items-center gap-1.5 border-2 border-line bg-brand px-3 py-1.5 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper disabled:opacity-60"
      >
        <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
        {isRefreshing ? "Actualisation..." : "Actualiser"}
      </button>
      <Link
        href="/admin/settings/router-setup"
        className="flex items-center gap-1.5 border-2 border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay"
      >
        <Pencil aria-hidden="true" className="h-4 w-4" />
        Modifier
      </Link>
      <button
        type="button"
        onClick={() => setConfirmingDelete(true)}
        className="flex items-center gap-1.5 border-2 border-line bg-paper px-3 py-1.5 text-sm font-bold text-err transition-colors duration-150 hover:bg-err hover:text-white"
      >
        <Trash2 aria-hidden="true" className="h-4 w-4" />
        Supprimer
      </button>
    </div>
  );
}
