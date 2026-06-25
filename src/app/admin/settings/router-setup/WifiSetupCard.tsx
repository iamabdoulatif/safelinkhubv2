"use client";

import { useState, useTransition } from "react";
import { Loader2, Wifi } from "lucide-react";
import { configureWifiSsid } from "@/lib/mikrotik/wifi-setup";

export default function WifiSetupCard({
  routerId,
  dualBand = true,
}: {
  routerId: string;
  dualBand?: boolean;
}) {
  const [ssid, setSsid] = useState("");
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{
    success?: boolean;
    error?: string;
    log?: string[];
  } | null>(null);

  function apply() {
    setResult(null);
    startTransition(async () => {
      const res = await configureWifiSsid(routerId, ssid, dualBand);
      setResult(res);
    });
  }

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Wifi className="h-5 w-5 text-slate-700" />
        <h2 className="font-semibold text-slate-900">Nom du réseau Wi-Fi</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Choisissez le nom (SSID) diffusé par votre routeur, appliqué{" "}
        {dualBand ? "aux deux bandes (2,4 GHz et 5 GHz)" : "à la bande 2,4 GHz (seule disponible sur ce modèle)"}.
        Le réseau reste ouvert — l&apos;accès est contrôlé par le portail
        captif et les vouchers, pas par un mot de passe Wi-Fi.
      </p>

      {result?.error && (
        <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">
          {result.error}
        </p>
      )}
      {result?.success && (
        <p className="mt-4 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Nom du Wi-Fi mis à jour sur les deux bandes.
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <input
          value={ssid}
          onChange={(e) => setSsid(e.target.value)}
          placeholder="Ex: SAFELINKHUB WIFI"
          maxLength={32}
          className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-slate-400 focus:outline-none"
        />
        <button
          type="button"
          disabled={pending || !ssid.trim()}
          onClick={apply}
          className="flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "Application..." : "Appliquer"}
        </button>
      </div>
    </div>
  );
}
