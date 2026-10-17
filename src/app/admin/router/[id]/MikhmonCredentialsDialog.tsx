"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, X } from "lucide-react";

export default function MikhmonCredentialsDialog({
  routerName,
  password,
  loading,
  resetting,
  error,
  success,
  revealed,
  onReveal,
  onReset,
  onClose,
}: {
  routerName: string;
  password: string | null;
  loading: boolean;
  resetting: boolean;
  error: string | null;
  success: string | null;
  revealed: boolean;
  onReveal: () => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    closeButton.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !resetting) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose, resetting]);

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#12301D]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="mikhmon-credentials-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !resetting) onClose();
      }}
    >
      <div className="mx-auto my-6 w-full max-w-lg overflow-hidden rounded-xl border border-line bg-paper shadow-modal">
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand-deep">
            <KeyRound className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="mikhmon-credentials-title" className="text-base font-bold leading-snug text-ink">
              Identifiants MikHmon
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">Routeur : {routerName}</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            disabled={resetting}
            aria-label="Fermer"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-clay hover:text-ink disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <div className="rounded-lg border border-line-soft bg-clay/40 px-4 py-3">
            <p className="text-xs font-bold uppercase tracking-[0.13em] text-ink-soft">État de l'accès</p>
            <p className="mt-1 flex items-center gap-2 text-sm font-semibold text-ok">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              {loading ? "Vérification en cours…" : password ? "Identifiants disponibles" : "Identifiants indisponibles"}
            </p>
          </div>

          <div className="grid gap-3 rounded-lg border border-line-soft bg-paper p-4 sm:grid-cols-[1fr_1.4fr]">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-ink-soft">Identifiant</p>
              <p className="mt-1 font-mono text-sm text-ink">mikhmon</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.13em] text-ink-soft">Mot de passe actuel</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <p className="font-mono text-sm text-ink">{loading ? "…" : password ? revealed ? password : "••••••••" : "Non disponible"}</p>
                {password && (
                  <button type="button" onClick={onReveal} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">
                    {revealed ? <EyeOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Eye className="h-3.5 w-3.5" aria-hidden="true" />}
                    {revealed ? "Masquer" : "Afficher"}
                  </button>
                )}
              </div>
            </div>
          </div>

          <section className="rounded-lg border border-err/35 bg-err-soft/40 p-4" aria-labelledby="mikhmon-reset-title">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-err" aria-hidden="true" />
              <div className="min-w-0">
                <h3 id="mikhmon-reset-title" className="text-sm font-bold text-ink">Réinitialisation d'urgence</h3>
                <p className="mt-1 text-sm leading-6 text-ink-soft">Remet le mot de passe MikHmon à <strong className="text-ink">1234</strong> sur ce routeur. Cette valeur est connue et peu sécurisée.</p>
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={loading || resetting}
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-err/50 bg-paper px-4 py-2 text-sm font-bold text-err transition hover:bg-err hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {resetting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                  {resetting ? "Restauration…" : confirming ? "Confirmation requise" : "Restaurer le mot de passe 1234"}
                </button>
                {confirming && !resetting && (
                  <div className="mt-3 rounded-lg border border-err/35 bg-paper p-3">
                    <p className="text-sm leading-5 text-ink">Le mot de passe sera remplacé par <strong>1234</strong>. Voulez-vous continuer ?</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => setConfirming(false)} className="rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink-soft hover:bg-clay">Annuler</button>
                      <button type="button" onClick={onReset} className="rounded-full bg-err px-3 py-1.5 text-xs font-bold text-white hover:opacity-90">Restaurer 1234</button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>

          {error && <p role="alert" className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">{error}</p>}
          {success && <p role="status" className="rounded-lg bg-clay px-3 py-2 text-sm font-medium text-ok">{success}</p>}
        </div>
      </div>
    </div>
  );
}
