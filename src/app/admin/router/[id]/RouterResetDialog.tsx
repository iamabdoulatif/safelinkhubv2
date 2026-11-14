"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RotateCcw, ShieldCheck, X } from "lucide-react";
import { resetRouterConfiguration } from "@/lib/mikrotik/actions";
import { nomConfirme } from "@/lib/mikrotik/action-destructive";
import {
  RESET_COMMON_EFFECTS,
  RESET_MODES,
  resetModeSpec,
  type ResetMode,
} from "@/lib/mikrotik/routeros-reset";

/**
 * Réinitialiser RouterOS avec CHOIX DU MODE. Chaque mode coupe le tunnel, donc
 * sort le routeur du parc : on exige de recopier le nom (irréversible, aucune
 * sauvegarde ne le rattrape), comme le fait RouterDangerDialog pour l'effacement.
 */
export default function RouterResetDialog({
  routerId,
  routerName,
  onClose,
}: {
  routerId: string;
  routerName: string;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<ResetMode>("factory");
  const [saisie, setSaisie] = useState("");
  const [pending, start] = useTransition();
  const [phase, setPhase] = useState<"form" | "done">("form");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButton.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  const spec = resetModeSpec(mode);
  const bloque = !nomConfirme(saisie, routerName);

  function submit() {
    setError(null);
    start(async () => {
      const res = await resetRouterConfiguration(routerId, mode);
      if (res?.error) {
        setError(res.error);
        return;
      }
      setPhase("done");
      setMessage(res?.summary ?? "Réinitialisation envoyée. Le routeur redémarre.");
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#12301D]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ros-reset-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="mx-auto my-6 w-full max-w-lg overflow-hidden rounded-xl border border-line bg-paper shadow-modal">
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-err-soft text-err">
            <RotateCcw className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ros-reset-title" className="text-base font-bold leading-snug text-ink">
              Réinitialiser RouterOS
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">Routeur : {routerName}</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fermer"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-clay hover:text-ink disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        {phase === "done" ? (
          <div className="px-5 py-6 sm:px-6">
            <p role="status" className="flex items-start gap-2 rounded-lg bg-clay px-3 py-2 text-sm font-medium text-ok">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {message}
            </p>
            <div className="mt-5 flex justify-end">
              <button type="button" onClick={onClose} className="btn btn-md btn-secondary">
                Fermer
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="px-5 py-4 sm:px-6">
              <fieldset disabled={pending}>
                <legend className="text-xs font-bold uppercase tracking-[0.13em] text-ink-soft">
                  Mode de réinitialisation
                </legend>
                <div className="mt-2 space-y-2">
                  {RESET_MODES.map((m) => (
                    <label
                      key={m.key}
                      className={`flex cursor-pointer gap-3 rounded-lg border p-3 transition ${
                        mode === m.key ? "border-err bg-err-soft/40" : "border-line-soft hover:bg-clay"
                      }`}
                    >
                      <input
                        type="radio"
                        name="reset-mode"
                        value={m.key}
                        checked={mode === m.key}
                        onChange={() => setMode(m.key)}
                        className="mt-1 accent-err"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold text-ink">{m.label}</span>
                        <span className="mt-0.5 block text-xs leading-5 text-ink-soft">{m.resume}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <p className="mt-5 text-xs font-bold uppercase tracking-[0.13em] text-err">Ce qui est détruit</p>
              <ul className="mt-2 space-y-1.5" role="list">
                {RESET_COMMON_EFFECTS.map((e) => (
                  <li key={e} className="grid grid-cols-[14px_1fr] gap-2.5 text-sm leading-6 text-ink">
                    <span aria-hidden className="mt-2 h-1.5 w-1.5 rounded-full bg-err" />
                    {e}
                  </li>
                ))}
              </ul>

              {spec.conserve.length > 0 && (
                <>
                  <p className="mt-5 text-xs font-bold uppercase tracking-[0.13em] text-ink-soft">
                    Ce qui est conservé
                  </p>
                  <ul className="mt-2 space-y-1.5" role="list">
                    {spec.conserve.map((e) => (
                      <li key={e} className="grid grid-cols-[14px_1fr] gap-2.5 text-sm leading-6 text-ink-soft">
                        <ShieldCheck aria-hidden className="mt-1 h-3.5 w-3.5 text-ok" />
                        {e}
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <div className="mt-5 border-t border-line-soft pt-4">
                <label htmlFor="reset-nom" className="block text-sm font-medium text-ink">
                  Recopiez <span className="font-mono font-bold">{routerName}</span> pour confirmer
                </label>
                <p className="mt-0.5 flex items-start gap-1.5 text-xs text-ink-soft">
                  <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warn" />
                  Le tunnel tombe : aucune sauvegarde SafeLinkHub ne remonte une configuration RouterOS effacée.
                </p>
                <input
                  id="reset-nom"
                  value={saisie}
                  onChange={(e) => setSaisie(e.target.value)}
                  disabled={pending}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-2 w-full rounded-lg border border-line-soft px-3 py-2 font-mono text-sm text-ink outline-none focus:border-err"
                />
              </div>

              {error && (
                <p role="alert" className="mt-4 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-sm leading-6 text-err">
                  {error}
                </p>
              )}
            </div>

            <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-clay/50 px-5 py-3 sm:px-6">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="rounded-full px-4 py-2 text-sm font-semibold text-ink-soft transition hover:text-ink disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={pending || bloque}
                className="btn btn-md btn-destructive inline-flex items-center gap-2"
              >
                {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                Réinitialiser le routeur
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}
