"use client";

import { useState } from "react";
import { ShieldCheck, Plug } from "lucide-react";
import GenerateScriptForm from "./GenerateScriptForm";
import ConnectRouterForm from "./ConnectRouterForm";

const ENABLE_API_SCRIPT = `/ip service enable api
/ip service set api port=8728
/ip firewall filter add chain=input protocol=tcp dst-port=8728 src-address=<your-safelinkhub-server-ip> action=accept place-before=0
/ip firewall filter add chain=input protocol=tcp dst-port=8728 action=drop`;

export default function MethodTabs() {
  const [method, setMethod] = useState<"vpn" | "direct">("vpn");

  return (
    <div>
      <div className="mt-6 flex items-center justify-center gap-2">
        <button
          onClick={() => setMethod("vpn")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            method === "vpn"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          Automatique (Tunnel VPN)
        </button>
        <button
          onClick={() => setMethod("direct")}
          className={`rounded-full px-4 py-1.5 text-sm font-medium ${
            method === "direct"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          Avancé : Connexion directe
        </button>
      </div>

      {method === "vpn" ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-500" />
            <h2 className="font-semibold text-slate-900">
              Étape 1 : Accès distant sécurisé
            </h2>
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Installez le tunnel de gestion SafeLinkHub sur votre routeur.
            Aucune IP publique ni redirection de port requise &mdash; le
            routeur se connecte vers SafeLinkHub via un tunnel WireGuard.
          </p>

          <details className="mt-4 rounded-md border border-slate-200 px-4 py-3 text-sm text-slate-600">
            <summary className="cursor-pointer font-medium text-slate-700">
              Préparation initiale (optionnel)
            </summary>
            <p className="mt-2 text-slate-500">
              Assurez-vous que votre routeur a accès à internet et qu'il
              dispose d'une version récente de RouterOS avant d'exécuter le
              script d'installation.
            </p>
          </details>

          <div className="mt-4">
            <GenerateScriptForm />
          </div>

          <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Note : Si vous obtenez une erreur &quot;not allowed by device
            mode&quot;, exécutez{" "}
            <code>/system/device-mode/update mode=advanced</code> pour
            débloquer l'exécution de scripts.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-500" />
              <h2 className="font-semibold text-slate-900">
                Étape 1 : Activer l'accès API RouterOS
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Exécutez ceci dans le terminal MikroTik pour activer le service
              API et le restreindre à l'IP du serveur SafeLinkHub.
            </p>

            <div className="mt-4">
              <h3 className="text-sm font-medium text-slate-700">
                Script d'activation de l'API
              </h3>
              <pre className="mt-2 overflow-x-auto rounded-md bg-slate-900 p-4 text-xs text-emerald-300">
                {ENABLE_API_SCRIPT}
              </pre>
              <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Note : N'exposez jamais l'API RouterOS directement sur
                internet sans restrictions de pare-feu.
              </p>
            </div>
          </div>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
            <div className="flex items-center gap-2">
              <Plug className="h-5 w-5 text-emerald-500" />
              <h2 className="font-semibold text-slate-900">
                Étape 2 : Connecter votre routeur
              </h2>
            </div>
            <p className="mt-1 text-sm text-slate-500">
              Entrez les identifiants de votre routeur pour vous connecter via
              l'API RouterOS.
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
