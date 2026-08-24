"use client";

import { useState, useTransition } from "react";
import { Check, Loader2, Radar } from "lucide-react";
import { deployMndpRelay, syncMndpAnnouncements } from "@/lib/mikrotik/mndp-relay";

// NOTE : ce composant n'est rendu par aucune page aujourd'hui (aucun import
// ailleurs dans src/). Conservé tel quel — il n'est pas de ce correctif de
// décider de sa suppression — mais il n'a plus besoin d'orgId : l'action le
// dérive de la session.
export default function MndpRelaySection() {
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
      // Plus d'orgId transmis : l'action le dérive de la session côté serveur.
      const syncRes = await syncMndpAnnouncements();
      if ("error" in syncRes) {
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
    <div className="mt-10 border border-line bg-paper p-6 rounded-xl">
      <div className="flex items-center gap-2">
        <Radar className="h-5 w-5 text-ink" />
        <h2 className="font-semibold text-ink">
          Découverte WinBox Neighbors via VPN
        </h2>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        WireGuard et OpenVPN ne transportent pas le broadcast MNDP utilisé par WinBox pour
        peupler sa liste &quot;Neighbors&quot; (contrairement à ZeroTier, qui émule un vrai
        réseau local). Ce bouton déploie un petit relais sur le serveur VPN qui annonce
        chaque routeur en ligne, en unicast, à toutes les adresses VPN personnelles actives
        — pour qu&apos;ils apparaissent dans Neighbors sans avoir à mémoriser une IP.
      </p>

      {result && "error" in result && (
        <p className="mt-3 rounded-md bg-err-soft px-3 py-2 text-sm text-err">
          {result.error}
        </p>
      )}
      {result && "success" in result && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md bg-clay px-3 py-2 text-sm text-ok">
          <Check className="h-4 w-4" />
          Relais actif — {result.routerCount ?? 0} routeur(s) annoncé(s) à{" "}
          {result.peerCount ?? 0} accès VPN personnel(s).
        </p>
      )}

      <button
        type="button"
        onClick={handleActivate}
        disabled={pending}
        className="mt-4 flex items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
      >
        {pending && <Loader2 className="h-4 w-4 animate-spin" />}
        {pending ? "Activation..." : "Activer / Actualiser la découverte"}
      </button>

      <p className="mt-3 text-[11px] text-ink-soft">
        Connectez-vous d&apos;abord à un accès VPN personnel (ci-dessus), puis ouvrez WinBox
        et rafraîchissez Neighbors — les routeurs en ligne devraient apparaître avec leur
        identité, version et IP tunnel.
      </p>
    </div>
  );
}
