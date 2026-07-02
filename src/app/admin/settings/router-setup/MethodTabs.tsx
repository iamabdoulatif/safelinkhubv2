"use client";

import { useState } from "react";
import { ShieldCheck, Plug } from "lucide-react";
import GenerateScriptForm from "./GenerateScriptForm";
import ConnectRouterForm from "./ConnectRouterForm";
import TargetProfileCard from "./TargetProfileCard";

const ENABLE_API_SCRIPT = `/ip service enable api
/ip service set api port=8728
/ip firewall filter add chain=input protocol=tcp dst-port=8728 src-address=<your-safelinkhub-server-ip> action=accept place-before=0
/ip firewall filter add chain=input protocol=tcp dst-port=8728 action=drop`;

const DEVICE_MODE_UNLOCK_SCRIPT = `/system/device-mode/update mode=advanced container=yes hotspot=yes scheduler=yes fetch=yes activation-timeout=10m
# Confirmez ensuite physiquement dans les 10 minutes : bouton reset/mode ou coupure d'alimentation froide.
/system/device-mode/print`;

export default function MethodTabs() {
  const [method, setMethod] = useState<"vpn" | "direct">("vpn");

  return (
    <div>
      <TargetProfileCard />

      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          onClick={() => setMethod("vpn")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            method === "vpn"
              ? "bg-ink text-white"
              : "bg-clay text-ink-soft hover:bg-clay"
          }`}
        >
          Automatique (Tunnel VPN)
        </button>
        <button
          onClick={() => setMethod("direct")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            method === "direct"
              ? "bg-ink text-white"
              : "bg-clay text-ink-soft hover:bg-clay"
          }`}
        >
          Avancé : Connexion directe
        </button>
      </div>

      {method === "vpn" ? (
        <div className="mt-8 border-2 border-line bg-paper p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-ok" />
            <h2 className="font-semibold text-ink">
              Étape 1 : Accès distant sécurisé
            </h2>
          </div>
          <p className="mt-1 text-sm text-ink-soft">
            Installez le tunnel de gestion SafeLinkHub sur votre routeur.
            Aucune IP publique ni redirection de port requise &mdash; le
            routeur se connecte vers SafeLinkHub via un tunnel WireGuard.
          </p>

          <details className="mt-4 rounded-md border border-line-soft px-4 py-3 text-sm text-ink-soft">
            <summary className="cursor-pointer font-medium text-ink">
              Préparation initiale (optionnel)
            </summary>
            <p className="mt-2 text-ink-soft">
              Assurez-vous que votre routeur a accès à internet et qu&apos;il
              dispose d&apos;une version récente de RouterOS avant d&apos;exécuter le
              script d&apos;installation.
            </p>
          </details>

          <div className="mt-4">
            <GenerateScriptForm />
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
      ) : (
        <>
          <div className="mt-8 border-2 border-line bg-paper p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-ok" />
              <h2 className="font-semibold text-ink">
                Étape 1 : Activer l&apos;accès API RouterOS
              </h2>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Exécutez ceci dans le terminal MikroTik pour activer le service
              API et le restreindre à l&apos;IP du serveur SafeLinkHub.
            </p>

            <div className="mt-4">
              <h3 className="text-sm font-medium text-ink">
                Script d&apos;activation de l&apos;API
              </h3>
              <pre className="mt-2 code-block p-4">
                {ENABLE_API_SCRIPT}
              </pre>
              <p className="mt-2 rounded-md bg-clay px-3 py-2 text-xs text-warn">
                Note : N&apos;exposez jamais l&apos;API RouterOS directement sur
                internet sans restrictions de pare-feu.
              </p>
            </div>
          </div>

          <div className="mt-6 border-2 border-line bg-paper p-6">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-ok" />
              <h2 className="font-semibold text-ink">
                Étape 2 : Connecter votre routeur
              </h2>
            </div>
            <p className="mt-1 text-sm text-ink-soft">
              Entrez les identifiants de votre routeur pour vous connecter via
              l&apos;API RouterOS.
            </p>

            <div className="mt-4">
              <ConnectRouterForm />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
