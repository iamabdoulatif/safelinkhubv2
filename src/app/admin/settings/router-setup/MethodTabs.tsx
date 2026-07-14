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

// Commandes pour un MikroTik NEUF / scellé (jamais configuré). Après CHAQUE
// commande, appui long ~15 s sur le bouton "reset" puis relâcher, pour
// confirmer physiquement le changement de device-mode.
const DEVICE_MODE_SEALED_STEPS = `# a. Mise à niveau du routerboard
/system/device-mode/update routerboard=yes
# b. Passage en mode avancé
/system/device-mode/update mode=advanced
# c. Activer le container + les fonctions requises par l'auto-setup
/system/device-mode/update container=yes hotspot=yes scheduler=yes fetch=yes
# d. Vérifier les fonctionnalités activées
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

            <details className="mt-3 rounded-md border border-line-soft bg-paper px-3 py-2.5 text-xs text-ink-soft">
              <summary className="cursor-pointer font-semibold text-ink">
                MikroTik neuf / scellé (jamais configuré) — préparation complète
              </summary>
              <div className="mt-2 space-y-2 leading-5">
                <p>
                  <span className="font-semibold text-ink">1.</span> Munissez-vous d&apos;un
                  ordinateur (Windows ou macOS). Téléchargez la dernière version du firmware
                  RouterOS correspondant à votre MikroTik et installez-la avant d&apos;exécuter les
                  commandes ci-dessous.
                </p>
                <p>
                  <span className="font-semibold text-ink">2.</span> Dans la notice fournie dans
                  l&apos;emballage du MikroTik, relevez les identifiants par défaut : login (Winbox){" "}
                  <code>admin</code> et le mot de passe (indiqué sur la notice).
                </p>
                <p>
                  <span className="font-semibold text-ink">3.</span> Connectez-vous au MikroTik avec
                  Winbox, allez dans{" "}
                  <span className="font-semibold text-ink">System → Reset Configuration</span>,
                  cochez uniquement{" "}
                  <span className="font-semibold text-ink">« No Default Configuration »</span>, puis
                  cliquez sur <span className="font-semibold text-ink">« Reset Configuration »</span>.
                </p>
                <p>
                  <span className="font-semibold text-ink">4.</span> Ouvrez{" "}
                  <span className="font-semibold text-ink">« New Terminal »</span> et exécutez les
                  commandes ci-dessous. Après{" "}
                  <span className="font-semibold text-ink">chaque</span> commande, faites un appui
                  long d&apos;environ{" "}
                  <span className="font-semibold text-ink">15 secondes</span> sur le bouton{" "}
                  <span className="font-semibold text-ink">« reset »</span> puis relâchez, pour
                  confirmer physiquement le changement :
                </p>
                <pre className="code-block px-3 py-2 whitespace-pre-wrap">
                  {DEVICE_MODE_SEALED_STEPS}
                </pre>
              </div>
            </details>
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
