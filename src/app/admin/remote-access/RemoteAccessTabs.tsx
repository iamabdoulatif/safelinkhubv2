"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import GenerateScriptForm from "../settings/router-setup/GenerateScriptForm";
import GenerateOpenvpnScriptForm from "./GenerateOpenvpnScriptForm";

const DEVICE_MODE_UNLOCK_SCRIPT = `/system/device-mode/update mode=advanced container=yes hotspot=yes scheduler=yes fetch=yes activation-timeout=10m
# Confirmez ensuite physiquement dans les 10 minutes : bouton reset/mode ou coupure d'alimentation froide.
/system/device-mode/print`;

export type Method = "wireguard" | "openvpn" | "sstp";

/* Un tunnel par famille de routeur et de réseau. Le libellé dit pour QUI il
   est fait : WireGuard n'existe pas avant RouterOS 7, OpenVPN passe partout
   sauf là où le FAI bloque le 1194, SSTP passe par le 443 comme le web. */
const METHODS: Record<Method, { label: string; hint: string; description: string }> = {
  wireguard: {
    label: "WireGuard",
    hint: "RouterOS 7",
    description:
      "Installe automatiquement un tunnel WireGuard sur le routeur. Aucune IP publique ni redirection de port requise.",
  },
  openvpn: {
    label: "OpenVPN",
    hint: "RouterOS 6 et 7",
    description:
      "Pour les routeurs en RouterOS 6 (jusqu'à 6.49) ou 7 : client OpenVPN authentifié par identifiant et mot de passe, sur le port TCP 1194. Aucune IP publique requise.",
  },
  sstp: {
    label: "SSTP",
    hint: "RouterOS 6 et 7 · port 443",
    description:
      "Quand le réseau du routeur ne laisse sortir que le web : le tunnel voyage en HTTPS sur le port 443. Idéal pour RouterOS 6 derrière une box ou un opérateur qui bloque OpenVPN.",
  },
};

export default function RemoteAccessTabs({ initialMethod = "wireguard" }: { initialMethod?: Method }) {
  const [method, setMethod] = useState<Method>(initialMethod);
  const m = METHODS[method];

  return (
    <div>
      <div role="group" aria-label="Type de tunnel" className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {(Object.keys(METHODS) as Method[]).map((key) => (
          <button
            key={key}
            type="button"
            aria-pressed={method === key}
            onClick={() => setMethod(key)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium ${
              method === key ? "bg-ink text-white" : "bg-clay text-ink-soft hover:text-ink"
            }`}
          >
            {METHODS[key].label}
            <span className={`ml-1.5 text-xs font-normal ${method === key ? "text-white/70" : "text-ink-soft"}`}>
              {METHODS[key].hint}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-6 border border-line bg-paper p-6 rounded-xl">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-ok" />
          <h2 className="font-semibold text-ink">Nouveau tunnel {m.label}</h2>
        </div>
        <p className="mt-1 text-sm text-ink-soft">{m.description}</p>

        <div className="mt-4">
          {method === "wireguard" ? (
            <GenerateScriptForm />
          ) : (
            <GenerateOpenvpnScriptForm key={method} tunnel={method} />
          )}
        </div>

        {/* device-mode n'existe qu'à partir de RouterOS 7 : la note n'a de sens
            que pour WireGuard. */}
        {method === "wireguard" && (
          <div className="mt-4 rounded-lg bg-clay px-3 py-2.5 text-xs text-warn">
            <p className="font-medium">
              Note : Si vous obtenez une erreur &quot;not allowed by device mode&quot;, exécutez
              cette commande sur le routeur, puis confirmez physiquement dans les 10 minutes
              pour débloquer l&apos;exécution de scripts :
            </p>
            <pre className="mt-1.5 code-block px-3 py-2">{DEVICE_MODE_UNLOCK_SCRIPT}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
