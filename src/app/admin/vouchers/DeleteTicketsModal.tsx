"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, Router, Trash2, X } from "lucide-react";
import type { VoucherDeleteScope } from "@/lib/vouchers/delete-scope";

/**
 * Suppression définitive de tickets — le dialogue POSE la question au lieu de
 * décider.
 *
 * Les deux portées n'ont pas du tout les mêmes conséquences : l'une range la
 * plateforme, l'autre coupe des accès Wi-Fi sur du matériel en exploitation. La
 * seconde ne peut pas être un effet de bord de la première, donc rien n'est
 * pré-sélectionné vers le matériel : le défaut est « plateforme seulement ».
 */
export default function DeleteTicketsModal({
  open,
  count,
  mode,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  /** Nombre de tickets concernés — affiché tel quel, jamais arrondi. */
  count: number;
  mode: "selection" | "empty";
  pending: boolean;
  onCancel: () => void;
  onConfirm: (scope: VoucherDeleteScope) => void;
}) {
  const [scope, setScope] = useState<VoucherDeleteScope>("platform");

  // Remise au défaut à chaque ouverture, PENDANT le rendu et non dans un effet :
  // un setState dans un effet provoque un second rendu, pendant lequel la boîte
  // afficherait brièvement le choix de la fois précédente — soit, ici, « ET sur
  // le MikroTik » pré-coché. Motif « ajuster l'état pendant le rendu ».
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setScope("platform");
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pending, onCancel]);

  if (!open) return null;

  const title =
    mode === "empty"
      ? `Vider la corbeille (${count} ticket${count > 1 ? "s" : ""})`
      : `Supprimer ${count} ticket${count > 1 ? "s" : ""}`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 px-4 py-[7vh]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-tickets-title"
      onClick={() => !pending && onCancel()}
    >
      <div
        className="w-full max-w-lg border border-line bg-paper p-6 rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2">
          <Trash2 className="h-4.5 w-4.5 text-ink" aria-hidden="true" />
          <h2 id="delete-tickets-title" className="text-sm font-bold text-ink">
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Fermer"
            className="ml-auto -mr-1 p-1 text-ink-soft hover:bg-clay disabled:opacity-50"
          >
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        <p className="mt-3 text-sm text-ink-soft">
          Cette suppression est <strong className="text-ink">définitive</strong> : les tickets ne
          reviendront pas dans la corbeille. Choisissez jusqu&apos;où elle va.
        </p>

        <fieldset className="mt-4 space-y-2">
          <legend className="sr-only">Portée de la suppression</legend>

          <label
            className={`flex cursor-pointer gap-3 border p-3 ${
              scope === "platform" ? "border-line bg-clay" : "border-line-soft hover:bg-clay/50"
            }`}
          >
            <input
              type="radio"
              name="delete-scope"
              value="platform"
              checked={scope === "platform"}
              onChange={() => setScope("platform")}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span className="text-sm">
              <span className="font-bold text-ink">Sur la plateforme seulement</span>
              <span className="mt-0.5 block text-ink-soft">
                Les tickets disparaissent de SafeLinkHub. Les comptes hotspot{" "}
                <strong className="text-ink">restent sur le MikroTik</strong> et continuent de
                donner accès au Wi-Fi.
              </span>
            </span>
          </label>

          <label
            className={`flex cursor-pointer gap-3 border p-3 ${
              scope === "platform_and_router"
                ? "border-err bg-err-soft"
                : "border-line-soft hover:bg-clay/50"
            }`}
          >
            <input
              type="radio"
              name="delete-scope"
              value="platform_and_router"
              checked={scope === "platform_and_router"}
              onChange={() => setScope("platform_and_router")}
              className="mt-0.5 h-4 w-4 accent-brand"
            />
            <span className="text-sm">
              <span className="flex items-center gap-1.5 font-bold text-ink">
                <Router className="h-4 w-4" aria-hidden="true" />
                Sur la plateforme ET sur le MikroTik
              </span>
              <span className="mt-0.5 block text-ink-soft">
                Les comptes hotspot sont aussi retirés des routeurs. Les clients qui utilisaient ces
                codes <strong className="text-ink">perdent l&apos;accès immédiatement</strong>.
              </span>
            </span>
          </label>
        </fieldset>

        {scope === "platform_and_router" && (
          <p className="mt-3 flex items-start gap-2 border border-err bg-err-soft px-3 py-2 text-xs text-ink">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-err" aria-hidden="true" />
            <span>
              Un routeur hors ligne ne peut pas être nettoyé : ses tickets sont alors{" "}
              <strong>conservés</strong> dans la corbeille plutôt que supprimés ici, pour ne pas
              laisser d&apos;accès Wi-Fi sans trace. Relancez quand le routeur est revenu.
            </span>
          </p>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="border border-line-soft px-4 py-2 text-sm font-medium text-ink-soft hover:bg-clay disabled:opacity-50 rounded-xl"
          >
            Annuler
          </button>
          <button
            type="button"
            onClick={() => onConfirm(scope)}
            disabled={pending}
            className="inline-flex items-center gap-2 border border-line bg-ink px-4 py-2 text-sm font-bold text-paper hover:opacity-90 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {scope === "platform_and_router"
              ? "Supprimer ici et sur le MikroTik"
              : "Supprimer de la plateforme"}
          </button>
        </div>
      </div>
    </div>
  );
}
