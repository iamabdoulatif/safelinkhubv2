"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import GenerateScriptForm from "../settings/router-setup/GenerateScriptForm";
import GenerateOpenvpnScriptForm from "./GenerateOpenvpnScriptForm";

const DEVICE_MODE_UNLOCK_SCRIPT = `/system/device-mode/update mode=advanced container=yes hotspot=yes scheduler=yes fetch=yes activation-timeout=10m
# Confirmez ensuite physiquement dans les 10 minutes : bouton reset/mode ou coupure d'alimentation froide.
/system/device-mode/print`;

export default function RemoteAccessTabs() {
  const [method, setMethod] = useState<"wireguard" | "openvpn">("wireguard");

  return (
    <div>
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          onClick={() => setMethod("wireguard")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            method === "wireguard"
              ? "bg-ink text-white"
              : "bg-clay text-ink-soft hover:bg-clay"
          }`}
        >
          WireGuard
        </button>
        <button
          onClick={() => setMethod("openvpn")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            method === "openvpn"
              ? "bg-ink text-white"
              : "bg-clay text-ink-soft hover:bg-clay"
          }`}
        >
          OpenVPN
        </button>
      </div>

      <div className="mt-6 border-2 border-line bg-paper p-6">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-ok" />
          <h2 className="font-semibold text-ink">
            Nouveau tunnel {method === "wireguard" ? "WireGuard" : "OpenVPN"}
          </h2>
        </div>
        <p className="mt-1 text-sm text-ink-soft">
          {method === "wireguard"
            ? "Installe automatiquement un tunnel WireGuard sur le routeur. Aucune IP publique ni redirection de port requise."
            : "Installe automatiquement un client OpenVPN sur le routeur, authentifié par identifiant et mot de passe — aucune IP publique ni redirection de port requise."}
        </p>

        <div className="mt-4">
          {method === "wireguard" ? <GenerateScriptForm /> : <GenerateOpenvpnScriptForm />}
        </div>

        <div className="mt-4 rounded-md bg-clay px-3 py-2.5 text-xs text-warn">
          <p className="font-medium">
            Note : Si vous obtenez une erreur &quot;not allowed by device mode&quot;, exécutez
            cette commande sur le routeur, puis confirmez physiquement dans les 10 minutes
            pour débloquer l&apos;exécution de scripts :
          </p>
          <pre className="mt-1.5 code-block px-3 py-2">
            {DEVICE_MODE_UNLOCK_SCRIPT}
          </pre>
        </div>
      </div>
    </div>
  );
}
