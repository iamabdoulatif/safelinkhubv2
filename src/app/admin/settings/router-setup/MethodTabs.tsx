"use client";

import { useState } from "react";
import { Check, ChevronDown, Copy, Plug, ShieldCheck } from "lucide-react";
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
      <div className="flex justify-center">
        <div role="group" aria-label="Méthode de connexion" className="inline-flex gap-1 rounded-full bg-line-soft p-1">
          {(
            [
              ["vpn", "Automatique (tunnel VPN)"],
              ["direct", "Avancé : connexion directe"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={method === key}
              onClick={() => setMethod(key)}
              className={`flex h-9 items-center whitespace-nowrap rounded-full border px-4 text-[13px] transition-colors ${
                method === key
                  ? "border-line bg-paper font-semibold text-ink"
                  : "border-transparent font-medium text-ink-soft hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {method === "vpn" ? (
        <div className="mt-8 space-y-6">
          {/* Étape 0 EN TÊTE et dépliée : un MikroTik neuf refuse le script
              d'installation tant que son device-mode n'est pas ouvert. Ces
              consignes vivaient repliées DANS la note d'erreur, APRÈS le
              script — un nouvel utilisateur ne les trouvait qu'une fois
              bloqué. */}
          <details open className="group rounded-xl border border-brand-deep/25 bg-paper">
            <summary className="flex cursor-pointer list-none items-center gap-3 rounded-xl bg-brand/15 px-5 py-4 marker:hidden [&::-webkit-details-marker]:hidden">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-deep text-sm font-semibold text-white">
                0
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-ink">
                  MikroTik neuf ou jamais configuré ? Préparez-le d&apos;abord
                </span>
                <span className="block text-[13px] text-ink-soft">
                  5 minutes, une seule fois. Déjà en service ? Repliez et passez à l&apos;étape 1.
                </span>
              </span>
              <ChevronDown
                aria-hidden="true"
                className="h-4 w-4 shrink-0 text-ink-soft transition-transform group-open:rotate-180"
              />
            </summary>
            <ol className="space-y-3 px-5 pb-5 pt-4 text-sm leading-6 text-ink-soft">
              <li className="flex gap-3">
                <StepNumber n={1} />
                <span>
                  Munissez-vous d&apos;un ordinateur (Windows ou macOS) relié au MikroTik, avec
                  accès à internet. Installez la <strong className="font-semibold text-ink">dernière version de RouterOS</strong> correspondant
                  à votre modèle.
                </span>
              </li>
              <li className="flex gap-3">
                <StepNumber n={2} />
                <span>
                  Relevez les identifiants par défaut sur la notice ou l&apos;étiquette : login{" "}
                  <code className="rounded bg-clay px-1 font-mono text-ink">admin</code> et le mot de passe imprimé.
                </span>
              </li>
              <li className="flex gap-3">
                <StepNumber n={3} />
                <span>
                  Dans Winbox : <strong className="font-semibold text-ink">System → Reset Configuration</strong>, cochez uniquement{" "}
                  <strong className="font-semibold text-ink">« No Default Configuration »</strong>, puis{" "}
                  <strong className="font-semibold text-ink">« Reset Configuration »</strong>.
                </span>
              </li>
              <li className="flex gap-3">
                <StepNumber n={4} />
                <span className="min-w-0 flex-1">
                  Ouvrez <strong className="font-semibold text-ink">New Terminal</strong> et tapez les commandes une par une.{" "}
                  <strong className="font-semibold text-ink">Après chaque commande</strong>, appuyez environ{" "}
                  <strong className="font-semibold text-ink">15 secondes</strong> sur le bouton{" "}
                  <strong className="font-semibold text-ink">reset</strong>{" "}puis relâchez : c&apos;est la confirmation physique
                  exigée par RouterOS.
                  <span className="relative mt-3 block">
                    <pre className="code-block rounded-lg px-4 py-3 pr-28 whitespace-pre-wrap">{DEVICE_MODE_SEALED_STEPS}</pre>
                    <CopyButton text={DEVICE_MODE_SEALED_STEPS} className="absolute right-2 top-2" />
                  </span>
                </span>
              </li>
            </ol>
          </details>

          <div className="rounded-xl border border-line bg-paper p-6">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-deep text-sm font-semibold text-white">
                1
              </span>
              <h2 className="font-semibold text-ink">Accès distant sécurisé</h2>
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              Installez le tunnel de gestion SafeLinkHub sur votre routeur. Aucune IP publique ni
              redirection de port requise &mdash; le routeur se connecte vers SafeLinkHub via un
              tunnel WireGuard.
            </p>

            <div className="mt-4">
              <GenerateScriptForm />
            </div>

            <div className="mt-4 rounded-lg border border-warn/30 bg-warn-soft px-4 py-3 text-[13px] text-ink-soft">
              <p>
                <strong className="font-semibold text-warn">Erreur « not allowed by device mode » ?</strong>{" "}
                Exécutez cette commande sur le routeur, puis confirmez physiquement dans les 10
                minutes (bouton reset ou coupure d&apos;alimentation) :
              </p>
              <span className="relative mt-2 block">
                <pre className="code-block rounded-lg px-3 py-2 pr-28">{DEVICE_MODE_UNLOCK_SCRIPT}</pre>
                <CopyButton text={DEVICE_MODE_UNLOCK_SCRIPT} className="absolute right-2 top-2" />
              </span>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-8 border border-line bg-paper p-6 rounded-xl">
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
              <p className="mt-2 rounded-lg bg-clay px-3 py-2 text-xs text-warn">
                Note : N&apos;exposez jamais l&apos;API RouterOS directement sur
                internet sans restrictions de pare-feu.
              </p>
            </div>
          </div>

          <div className="mt-6 border border-line bg-paper p-6 rounded-xl">
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
      {/* Référence technique (ce que l'auto-setup va poser) : consultée, pas
          suivie — elle vient APRÈS les étapes, pas devant l'étape 0. */}
      <div className="mt-8">
        <TargetProfileCard />
      </div>
    </div>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-clay text-xs font-semibold text-ink">
      {n}
    </span>
  );
}

/** Copie dans le presse-papiers ; confirme deux secondes. */
function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          /* presse-papiers refusé : le texte reste sélectionnable à la main */
        }
      }}
      className={`btn btn-sm btn-outline ${className}`}
    >
      {copied ? <Check aria-hidden="true" className="h-3.5 w-3.5" /> : <Copy aria-hidden="true" className="h-3.5 w-3.5" />}
      <span aria-live="polite">{copied ? "Copié" : "Copier"}</span>
    </button>
  );
}
