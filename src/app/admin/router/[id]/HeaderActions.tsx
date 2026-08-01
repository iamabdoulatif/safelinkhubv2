"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Pencil, RefreshCw, Trash2, Gauge, Lock, LockOpen } from "lucide-react";
import {
  deleteRouter,
  optimizeRouterWifi,
  refreshRouterStats,
  lockRouterPorts,
  unlockRouterPorts,
} from "@/lib/mikrotik/actions";

export default function HeaderActions({
  routerId,
  locked,
}: {
  routerId: string;
  locked: boolean;
}) {
  const router = useRouter();
  const [isRefreshing, startRefresh] = useTransition();
  const [isOptimizing, startOptimize] = useTransition();
  const [isLocking, startLock] = useTransition();
  const [confirmingLock, setConfirmingLock] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  function runUnlock() {
    startLock(async () => {
      setError(null);
      setOk(null);
      const result = await unlockRouterPorts(routerId);
      if (result?.error) setError(result.error);
      else setOk(result?.summary ?? "Routeur déverrouillé.");
      router.refresh();
    });
  }

  function runLock() {
    setConfirmingLock(false);
    startLock(async () => {
      setError(null);
      setOk(null);
      const result = await lockRouterPorts(routerId);
      if (result?.error) setError(result.error);
      else setOk(result?.summary ?? "Routeur verrouillé.");
      router.refresh();
    });
  }

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
      {ok && (
        <span role="status" className="text-xs font-medium text-ok">
          {ok}
        </span>
      )}
      <button
        type="button"
        disabled={isRefreshing}
        onClick={() =>
          startRefresh(async () => {
            setError(null);
            setOk(null);
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
      <button
        type="button"
        disabled={isOptimizing}
        title="Unifie le SSID (band steering) + 5 GHz en 80 MHz + 2,4 GHz en 20 MHz"
        onClick={() =>
          startOptimize(async () => {
            setError(null);
            setOk(null);
            const result = await optimizeRouterWifi(routerId);
            if (result?.error) setError(result.error);
            else setOk(result?.summary ? `WiFi optimisé — ${result.summary}` : "WiFi optimisé.");
            router.refresh();
          })
        }
        className="flex items-center gap-1.5 border-2 border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60"
      >
        {isOptimizing ? (
          <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
        ) : (
          <Gauge aria-hidden="true" className="h-4 w-4" />
        )}
        {isOptimizing ? "Optimisation..." : "Optimiser le WiFi"}
      </button>
      {locked ? (
        <button
          type="button"
          disabled={isLocking}
          title="Réactive tous les ports et le WiFi coupés par le verrouillage"
          onClick={runUnlock}
          className="flex items-center gap-1.5 border-2 border-ok bg-ok px-3 py-1.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-paper hover:text-ok disabled:opacity-60"
        >
          {isLocking ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <LockOpen aria-hidden="true" className="h-4 w-4" />
          )}
          {isLocking ? "Déverrouillage..." : "Déverrouiller"}
        </button>
      ) : confirmingLock ? (
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">Couper tous les ports sauf le WAN ?</span>
          <button
            type="button"
            disabled={isLocking}
            onClick={runLock}
            className="flex items-center gap-1.5 border-2 border-err bg-err px-3 py-1.5 text-sm font-bold text-white transition-colors duration-150 hover:bg-paper hover:text-err disabled:opacity-60"
          >
            {isLocking ? (
              <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
            ) : (
              <Lock aria-hidden="true" className="h-4 w-4" />
            )}
            Confirmer
          </button>
          <button
            type="button"
            disabled={isLocking}
            onClick={() => setConfirmingLock(false)}
            className="border-2 border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay"
          >
            Annuler
          </button>
        </span>
      ) : (
        <button
          type="button"
          disabled={isLocking}
          title="Paralyse le routeur : coupe tous les ports et le WiFi sauf le port WAN (lien de gestion)"
          onClick={() => setConfirmingLock(true)}
          className="flex items-center gap-1.5 border-2 border-line bg-paper px-3 py-1.5 text-sm font-bold text-err transition-colors duration-150 hover:bg-err hover:text-white"
        >
          <Lock aria-hidden="true" className="h-4 w-4" />
          Verrouiller
        </button>
      )}
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
