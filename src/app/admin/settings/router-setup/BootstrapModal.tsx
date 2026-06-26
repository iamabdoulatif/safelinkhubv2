"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, Terminal } from "lucide-react";
import { checkBootstrapInstalled } from "@/lib/mikrotik/bridges";

export default function BootstrapModal({
  command,
  bridgeId,
  onClose,
}: {
  command: string;
  bridgeId: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const pollCount = useRef(0);

  useEffect(() => {
    pollCount.current = 0;
    let cancelled = false;

    const interval = setInterval(async () => {
      pollCount.current += 1;
      const result = await checkBootstrapInstalled(bridgeId);
      if (cancelled) return;
      if (result?.installed) {
        setInstalled(true);
        clearInterval(interval);
      } else if (pollCount.current >= 60) {
        clearInterval(interval);
      }
    }, 5000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [bridgeId]);

  function copyCommand() {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRanIt() {
    setChecking(true);
    setStillWaiting(false);
    const result = await checkBootstrapInstalled(bridgeId);
    setChecking(false);
    if (result?.installed) {
      setInstalled(true);
    } else {
      setStillWaiting(true);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <Terminal className="h-4 w-4" />
          </span>
          <h2 className="text-base font-semibold text-slate-900">
            Installation du service requise
          </h2>
        </div>

        {installed ? (
          <div className="mt-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            Service installé avec succès sur le routeur. Le portail captif est
            prêt.
          </div>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-500">
              Votre bridge hotspot est déployé. Maintenant, copiez et
              exécutez cette commande dans le terminal MikroTik pour
              installer le portail captif.
            </p>

            <div className="relative mt-3">
              <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 pr-10 text-[11px] text-emerald-300">
                {command}
              </pre>
              <button
                onClick={copyCommand}
                className="absolute right-2 top-2 rounded-md bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
                title="Copier la commande"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <button
              onClick={copyCommand}
              className="mt-3 flex w-full items-center justify-center gap-2 rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" /> Copié dans le presse-papiers
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copier la commande
                </>
              )}
            </button>

            <p className="mt-3 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-700">
              Ce script ajoute les règles de portail captif (walled garden)
              et confirme l&apos;installation auprès de SafeLinkHub.
            </p>

            {stillWaiting && (
              <p className="mt-3 text-xs text-amber-600">
                Toujours en attente. Vérifiez que la commande s&apos;est bien
                exécutée sur le routeur.
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Fermer
              </button>
              <button
                type="button"
                onClick={handleRanIt}
                disabled={checking}
                className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {checking ? "Vérification..." : "J'ai exécuté la commande"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
