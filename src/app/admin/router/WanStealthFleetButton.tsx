"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { AlertTriangle, EyeOff, Loader2, X } from "lucide-react";
import { applyWanStealthFleet } from "@/lib/mikrotik/wan-stealth-actions";
import type { RouterDictionary } from "./router-row";
import { FleetActionRow, type ActionMessage } from "./FleetActionRow";

/**
 * Masque TOUT le parc vis-à-vis des box des fournisseurs.
 *
 * Les trois réglages par défaut (nom annoncé, découverte de voisinage, DDNS
 * MikroTik) ne coupent rien. La MAC est une case SÉPARÉE, décochée, parce
 * qu'elle renégocie le bail DHCP et coupe le WAN de chaque site quelques
 * secondes.
 *
 * Les options et l'avertissement ne vivent plus inline dans la liste d'actions :
 * la rangée n'est qu'un lanceur, et « Lancer » ouvre un DIALOGUE de
 * confirmation (même grammaire que RouterDangerDialog) où l'on règle les deux
 * cases avant de confirmer. Le compte rendu, lui, revient sous la rangée.
 * Idempotent et repris en plusieurs passages (voir applyWanStealthFleet).
 */
export default function WanStealthFleetButton({ t }: { t: RouterDictionary["actions"] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [spoofMac, setSpoofMac] = useState(false);
  const [hideUpstream, setHideUpstream] = useState(true);
  const [message, setMessage] = useState<ActionMessage | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogError, setDialogError] = useState<string | null>(null);
  const lastFocused = useRef<HTMLElement | null>(null);

  function openDialog() {
    lastFocused.current = document.activeElement as HTMLElement | null;
    setDialogError(null);
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
    lastFocused.current?.focus();
  }

  function run() {
    startTransition(async () => {
      setDialogError(null);
      const result = await applyWanStealthFleet({ spoofMac, hideUpstream });
      if ("error" in result) {
        setDialogError(result.error);
        return;
      }
      const parts: string[] = [
        result.masques.length > 0
          ? t.stealthDone
              .replace("{count}", String(result.masques.length))
              .replace("{routers}", result.masques.join(", "))
          : t.stealthNone.replace("{count}", String(result.traites)),
      ];
      if (result.injoignables.length > 0) {
        parts.push(t.retryLater.replace("{routers}", result.injoignables.join(", ")));
      }
      if (result.restants > 0) {
        parts.push(t.stealthRemaining.replace("{count}", String(result.restants)));
      }
      setMessage({
        kind: result.injoignables.length > 0 || result.restants > 0 ? "warn" : "ok",
        text: parts.join(" "),
      });
      setDialogOpen(false);
      lastFocused.current?.focus();
      router.refresh();
    });
  }

  return (
    <>
      <FleetActionRow
        icon={EyeOff}
        title={t.stealth}
        summary={t.stealthSummary}
        help={t.stealthHelp}
        helpLabel={t.learnMore}
        runLabel={t.runAction}
        busyLabel={t.stealthBusy}
        pending={pending}
        message={message}
        onRun={openDialog}
      />

      {dialogOpen &&
        createPortal(
          <WanStealthDialog
            t={t}
            spoofMac={spoofMac}
            setSpoofMac={setSpoofMac}
            hideUpstream={hideUpstream}
            setHideUpstream={setHideUpstream}
            pending={pending}
            error={dialogError}
            onConfirm={run}
            onClose={closeDialog}
          />,
          document.body,
        )}
    </>
  );
}

/**
 * Dialogue de confirmation du masquage. Rendu via portal sur <body> : la liste
 * d'actions s'anime en `transform`, et un enfant `position: fixed` y serait
 * confiné à la largeur du panneau au lieu du viewport. Échap intercepté en
 * phase CAPTURE puis stoppé, pour ne fermer QUE le dialogue (le panneau écoute
 * Échap en phase bubble).
 */
function WanStealthDialog({
  t,
  spoofMac,
  setSpoofMac,
  hideUpstream,
  setHideUpstream,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  t: RouterDictionary["actions"];
  spoofMac: boolean;
  setSpoofMac: (v: boolean) => void;
  hideUpstream: boolean;
  setHideUpstream: (v: boolean) => void;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !pending) {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose, pending]);

  return (
    <div
      className="fixed inset-0 z-[60] overflow-y-auto bg-[#12301D]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="stealth-titre"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !pending) onClose();
      }}
    >
      <div className="mx-auto my-6 w-full max-w-md overflow-hidden rounded-xl border border-line bg-paper shadow-modal">
        <header className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-warn-soft text-warn">
            <EyeOff className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 id="stealth-titre" className="text-base font-bold leading-snug text-ink">
              {t.stealth}
            </h2>
            <p className="mt-1 text-sm leading-6 text-ink-soft">{t.stealthSummary}</p>
          </div>
          <button
            ref={cancelRef}
            type="button"
            onClick={onClose}
            disabled={pending}
            aria-label="Fermer"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition hover:bg-clay hover:text-ink disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-3 px-5 py-4">
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-soft bg-clay/50 p-3 text-sm leading-5 text-ink">
            <input
              type="checkbox"
              checked={hideUpstream}
              onChange={(e) => setHideUpstream(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
            />
            {t.stealthUpstream}
          </label>
          <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-line-soft bg-clay/50 p-3 text-sm leading-5 text-ink">
            <input
              type="checkbox"
              checked={spoofMac}
              onChange={(e) => setSpoofMac(e.target.checked)}
              disabled={pending}
              className="mt-0.5 h-4 w-4 shrink-0 accent-ink"
            />
            <span>
              {t.stealthMac}
              <span className="mt-1 flex items-center gap-1 font-semibold text-warn">
                <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                {t.stealthMacWarn}
              </span>
            </span>
          </label>

          {error && (
            <p
              role="alert"
              className="flex items-start gap-1.5 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-sm leading-6 text-err"
            >
              <AlertTriangle aria-hidden="true" className="mt-1 h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 break-words">{error}</span>
            </p>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line-soft bg-clay/50 px-5 py-3">
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
            onClick={onConfirm}
            disabled={pending}
            className="btn btn-md btn-primary inline-flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            {pending ? t.stealthBusy : t.runAction}
          </button>
        </footer>
      </div>
    </div>
  );
}
