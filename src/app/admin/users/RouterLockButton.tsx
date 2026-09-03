"use client";

import { useState, useTransition } from "react";
import { Loader2, Lock, LockOpen } from "lucide-react";
import { lockRouterPorts, unlockRouterPorts } from "@/lib/mikrotik/actions";

/**
 * Kill-switch d'un routeur client, RÉSERVÉ AU SUPERADMIN (rendu uniquement dans
 * le panneau d'organisation ciblée, lui-même superadmin-only). Levier de
 * recouvrement contre un client non solvable : coupe tous les ports + le WiFi
 * sauf le WAN (le routeur reste joignable pour être déverrouillé à distance).
 * L'action serveur revérifie le rôle superadmin.
 */
export default function RouterLockButton({
  routerId,
  locked,
}: {
  routerId: string;
  locked: boolean;
}) {
  const [isBusy, start] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function unlock() {
    start(async () => {
      setError(null);
      const res = await unlockRouterPorts(routerId);
      if (res?.error) setError(res.error);
      // Succès : l'action a revalidé /admin/users → la liste se re-rend seule.
    });
  }

  function lock() {
    setConfirming(false);
    start(async () => {
      setError(null);
      const res = await lockRouterPorts(routerId);
      if (res?.error) setError(res.error);
    });
  }

  if (locked) {
    return (
      <span className="flex flex-col items-end gap-1">
        <button
          type="button"
          disabled={isBusy}
          onClick={unlock}
          title="Réactive les ports et le WiFi coupés par le verrouillage"
          className="inline-flex items-center gap-1.5 border border-ok bg-ok px-2.5 py-1.5 font-semibold text-white transition-colors duration-150 hover:bg-paper hover:text-ok disabled:opacity-60 rounded-xl"
        >
          {isBusy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <LockOpen aria-hidden="true" className="h-3.5 w-3.5" />}
          Déverrouiller
        </button>
        {error && <span role="alert" className="text-[11px] font-medium text-err">{error}</span>}
      </span>
    );
  }

  if (confirming) {
    return (
      <span className="flex flex-wrap items-center justify-end gap-1.5">
        <span className="text-[11px] font-medium text-ink">Couper tous les ports sauf le WAN ?</span>
        <button
          type="button"
          disabled={isBusy}
          onClick={lock}
          className="inline-flex items-center gap-1.5 border border-err bg-err px-2.5 py-1.5 font-semibold text-white transition-colors duration-150 hover:bg-paper hover:text-err disabled:opacity-60 rounded-xl"
        >
          {isBusy ? <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" /> : <Lock aria-hidden="true" className="h-3.5 w-3.5" />}
          Confirmer
        </button>
        <button
          type="button"
          disabled={isBusy}
          onClick={() => setConfirming(false)}
          className="border border-line bg-paper px-2.5 py-1.5 font-semibold text-ink transition-colors duration-150 hover:bg-clay rounded-xl"
        >
          Annuler
        </button>
        {error && <span role="alert" className="w-full text-right text-[11px] font-medium text-err">{error}</span>}
      </span>
    );
  }

  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isBusy}
        onClick={() => setConfirming(true)}
        title="Paralyse le routeur du client : coupe tous les ports et le WiFi sauf le WAN (recouvrement)"
        className="inline-flex items-center gap-1.5 border border-line bg-paper px-2.5 py-1.5 font-semibold text-err transition-colors duration-150 hover:bg-err hover:text-white rounded-xl"
      >
        <Lock aria-hidden="true" className="h-3.5 w-3.5" />
        Verrouiller
      </button>
      {error && <span role="alert" className="text-[11px] font-medium text-err">{error}</span>}
    </span>
  );
}
