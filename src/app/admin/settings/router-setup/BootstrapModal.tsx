"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCircle2, Copy, Terminal, X } from "lucide-react";

async function checkBootstrapInstalled(bridgeId: string) {
  try {
    const res = await fetch(`/api/admin/bridges/${bridgeId}/bootstrap-status`, {
      cache: "no-store",
    });
    return (await res.json()) as { installed?: boolean; error?: string };
  } catch {
    return { installed: false };
  }
}

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
  const closeButtonRef = useRef<HTMLButtonElement>(null);

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

  useEffect(() => {
    if (!installed) return;
    const timeout = setTimeout(onClose, 2000);
    return () => clearTimeout(timeout);
  }, [installed, onClose]);

  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const active = document.activeElement;
        if (active instanceof HTMLSelectElement) return;
        onClose();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />
      <div
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bootstrap-title"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <Terminal className="h-4 w-4" />
            </span>
            <h2 id="bootstrap-title" className="text-base font-semibold text-slate-900">
              Installation du service requise
            </h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            aria-label="Fermer"
            onClick={onClose}
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {installed ? (
          <>
            <div className="mt-4 rounded-md bg-emerald-50 px-4 py-3 text-sm text-emerald-700" aria-live="polite">
              <span className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                Service installé avec succès sur le routeur. Le portail captif est prêt.
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-400">Fermeture automatique...</p>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Continuer
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-3 text-sm text-slate-500">
              Votre bridge hotspot est déployé. Maintenant, copiez et
              exécutez cette commande dans le terminal MikroTik pour
              installer le portail captif.
            </p>

            <div className="relative mt-3">
              <pre className="overflow-x-auto rounded-md bg-slate-950 p-3 pr-10 text-[11px] text-emerald-300">
                {command}
              </pre>
              <button
                type="button"
                onClick={copyCommand}
                className="absolute right-2 top-2 rounded-md bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
                title="Copier la commande"
                aria-label="Copier la commande"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>

            <button
              type="button"
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
              <div className="mt-3" aria-live="polite">
                <p className="text-xs text-amber-600">
                  <span className="flex items-center gap-2">
                    <AlertCircle className="h-4 w-4 shrink-0" />
                    Toujours en attente. Vérifiez que la commande s&apos;est bien
                    exécutée sur le routeur.
                  </span>
                </p>
              </div>
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
                className="rounded-md bg-slate-950 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-60"
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
