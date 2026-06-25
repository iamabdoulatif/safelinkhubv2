"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Radar } from "lucide-react";
import { deployMndpRelay, syncMndpAnnouncements } from "@/lib/mikrotik/mndp-relay";

export default function MndpRelaySection({ orgId }: { orgId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<
    | { error: string }
    | { success: true; message?: string; routerCount?: number; peerCount?: number }
    | null
  >(null);

  function handleActivate() {
    setResult(null);
    startTransition(async () => {
      const deployRes = await deployMndpRelay();
      if (deployRes?.error) {
        setResult({ error: deployRes.error });
        return;
      }
      const syncRes = await syncMndpAnnouncements(orgId);
      if (syncRes?.error) {
        setResult({ error: syncRes.error });
        return;
      }
      setResult({
        success: true,
        message: deployRes.message,
        routerCount: syncRes.routerCount,
        peerCount: syncRes.peerCount,
      });
    });
  }

  return (
    <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Radar className="h-5 w-5 text-slate-700" />
        <h2 className="font-semibold text-slate-900">
          Découverte WinBox Neighbors via VPN
        </h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        WireGuard et OpenVPN ne transportent pas le broadcast MNDP utilisé par WinBox pour
        peupler sa liste &quot;Neighbors&quot; (contrairement à ZeroTier, qui émule un vrai
        réseau local). Ce bouton déploie un petit relais sur le serveur VPN qui annonce
        chaque routeur en ligne, en unicast, à toutes les adresses VPN personnelles actives
        — pour qu&apos;ils apparaissent dans Neighbors sans avoir à mémoriser une IP.
      </p>

      {result && "error" in result && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {result.error}
        </p>
      )}
      {result && "success" in result && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          <Check className="h-4 w-4" />
          Relais actif — {result.routerCount ?? 0} routeur(s) annoncé(s) à{" "}
          {result.peerCount ?? 0} accès VPN personnel(s).
        </p>
      )}

      <button
        type="button"
        onClick={handleActivate}
        disabled={pending}
        className="mt-4 flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Activation..." : "Activer / Actualiser la découverte"}
      </button>

      <p className="mt-3 text-[11px] text-slate-400">
        Connectez-vous d&apos;abord à un accès VPN personnel (ci-dessus), puis ouvrez WinBox
        et rafraîchissez Neighbors — les routeurs en ligne devraient apparaître avec leur
        identité, version et IP tunnel.
      </p>
    </div>
  );
}
