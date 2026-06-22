"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import GenerateScriptForm from "../settings/router-setup/GenerateScriptForm";
import GenerateOpenvpnScriptForm from "./GenerateOpenvpnScriptForm";

export default function RemoteAccessTabs() {
  const [method, setMethod] = useState<"wireguard" | "openvpn">("wireguard");

  return (
    <div>
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          onClick={() => setMethod("wireguard")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            method === "wireguard"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          WireGuard
        </button>
        <button
          onClick={() => setMethod("openvpn")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            method === "openvpn"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          OpenVPN
        </button>
      </div>

      <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-500" />
          <h2 className="font-semibold text-slate-900">
            Nouveau tunnel {method === "wireguard" ? "WireGuard" : "OpenVPN"}
          </h2>
        </div>
        <p className="mt-1 text-sm text-slate-500">
          {method === "wireguard"
            ? "Installe automatiquement un tunnel WireGuard sur le routeur. Aucune IP publique ni redirection de port requise."
            : "Installe automatiquement un client OpenVPN sur le routeur, authentifié par identifiant et mot de passe — aucune IP publique ni redirection de port requise."}
        </p>

        <div className="mt-4">
          {method === "wireguard" ? <GenerateScriptForm /> : <GenerateOpenvpnScriptForm />}
        </div>

        <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
          Note : Si vous obtenez une erreur &quot;not allowed by device
          mode&quot;, exécutez{" "}
          <code>/system/device-mode/update mode=advanced</code> sur le
          routeur pour débloquer l&apos;exécution de scripts.
        </p>
      </div>
    </div>
  );
}
