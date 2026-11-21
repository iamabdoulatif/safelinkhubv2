"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PackageOpen, X } from "lucide-react";
import { startRouterOsDowngradeJob } from "@/lib/mikrotik/downgrade-job-actions";
import {
  followAutoSetupJob,
  JOB_LOST_MESSAGE,
  JOB_STALE_MESSAGE,
} from "@/app/admin/settings/router-setup/follow-job";

type Result = { error?: string; rebooting?: boolean; from?: string; to?: string; arch?: string };

const STEP_LABEL: Record<string, string> = {
  connect: "Connexion au routeur…",
  detect: "Lecture de la version et de l'architecture…",
  download: "Téléchargement du paquet RouterOS (par le WAN du routeur)…",
  verify: "Vérification du paquet téléchargé…",
  reboot: "Rétrogradation et redémarrage du routeur…",
};

export default function RouterOsDowngradeDialog({
  routerId,
  routerName,
  onClose,
}: {
  routerId: string;
  routerName: string;
  onClose: () => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  const [version, setVersion] = useState("");
  const [phase, setPhase] = useState<"form" | "running" | "done" | "error">("form");
  const [step, setStep] = useState<string>("connect");
  const [message, setMessage] = useState<string | null>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    closeButton.current?.focus();
    return () => {
      cancelled.current = true;
    };
  }, []);

  const busy = phase === "running";

  async function submit() {
    const target = version.trim();
    if (!target) {
      setPhase("error");
      setMessage("Indiquez la version cible (ex. 7.8).");
      return;
    }
    setPhase("running");
    setStep("connect");
    setMessage(null);
    const started = await startRouterOsDowngradeJob(routerId, target);
    if (!started || "error" in started) {
      setPhase("error");
      setMessage(started?.error ?? "Impossible de lancer la rétrogradation.");
      return;
    }
    const outcome = await followAutoSetupJob<Result>(started.jobId, {
      onStep: (s) => setStep(s),
      isCancelled: () => cancelled.current,
    });
    if (cancelled.current) return;
    if (outcome.kind === "lost") {
      setPhase("error");
      setMessage(JOB_LOST_MESSAGE);
      return;
    }
    if (outcome.kind === "stale") {
      setPhase("error");
      setMessage(JOB_STALE_MESSAGE);
      return;
    }
    if (outcome.kind === "cancelled") return;
    if (outcome.result?.error) {
      setPhase("error");
      setMessage(outcome.result.error);
      return;
    }
    setPhase("done");
    const r = outcome.result;
    setMessage(
      r?.to
        ? `Rétrogradation lancée vers RouterOS ${r.to}${r.from ? ` (depuis ${r.from})` : ""}. Le routeur redémarre : il repassera en ligne sur la nouvelle version d'ici quelques minutes.`
        : "Rétrogradation lancée. Le routeur redémarre et repassera en ligne sur la nouvelle version d'ici quelques minutes.",
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-[#12301D]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ros-downgrade-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="mx-auto my-6 w-full max-w-lg overflow-hidden rounded-xl border border-line bg-paper shadow-modal">
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4 sm:px-6">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand/20 text-brand-deep">
            <PackageOpen className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="ros-downgrade-title" className="text-base font-bold leading-snug text-ink">
              Rétrograder RouterOS
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">Routeur : {routerName}</p>
          </div>
          <button
            ref={closeButton}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
            className="rounded-full p-1.5 text-ink-soft transition hover:bg-clay hover:text-ink disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5 sm:px-6">
          <section className="rounded-lg border border-warn/40 bg-warn-soft/40 p-4">
            <div className="flex gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warn" aria-hidden="true" />
              <div className="min-w-0 text-sm leading-6 text-ink-soft">
                <p className="font-bold text-ink">Le routeur va redémarrer.</p>
                <p className="mt-1">
                  Il télécharge d&apos;abord le paquet par son WAN, puis installe la version plus
                  ancienne et redémarre : le Wi-Fi est coupé quelques minutes. Un retour en{" "}
                  <strong className="text-ink">6.x</strong> (ex. 7.25 → 6.49) n&apos;est possible que
                  si le matériel le permet — SafeLinkHub lit son plancher et refuse sinon.
                </p>
                <p className="mt-2">
                  Franchir la majeure 7 → 6 peut <strong className="text-ink">corrompre la
                  configuration</strong> (incompatible entre branches) : réinitialisez le routeur
                  après coup si le hotspot ne repart pas.
                </p>
              </div>
            </div>
          </section>

          <label className="block">
            <span className="text-xs font-bold uppercase tracking-[0.13em] text-ink-soft">Version cible</span>
            <input
              type="text"
              inputMode="decimal"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              disabled={busy || phase === "done"}
              placeholder="7.8 ou 6.49.18"
              className="mt-1 w-full rounded-lg border border-line bg-paper px-3 py-2 font-mono text-sm text-ink outline-none focus:border-brand disabled:opacity-60"
            />
            <span className="mt-1 block text-xs text-ink-soft">
              Doit être inférieure à la version actuelle (ex. 7.8, 7.15.3, 6.49.18).
            </span>
          </label>

          {phase === "running" && (
            <p role="status" className="flex items-center gap-2 rounded-lg bg-clay px-3 py-2 text-sm font-medium text-ink">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              {STEP_LABEL[step] ?? "Opération en cours…"}
            </p>
          )}
          {phase === "done" && message && (
            <p role="status" className="flex items-start gap-2 rounded-lg bg-clay px-3 py-2 text-sm font-medium text-ok">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {message}
            </p>
          )}
          {phase === "error" && message && (
            <p role="alert" className="rounded-lg bg-err-soft px-3 py-2 text-sm text-err">
              {message}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              disabled={busy}
              className="rounded-full border border-line px-4 py-2 text-sm font-bold text-ink-soft transition hover:bg-clay disabled:opacity-60"
            >
              {phase === "done" ? "Fermer" : "Annuler"}
            </button>
            {phase !== "done" && (
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="inline-flex items-center gap-2 rounded-full border border-warn/50 bg-paper px-4 py-2 text-sm font-bold text-warn transition hover:bg-warn hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {busy ? "Rétrogradation…" : "Rétrograder"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
