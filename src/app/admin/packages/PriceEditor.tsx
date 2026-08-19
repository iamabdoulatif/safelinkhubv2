"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { updatePackagePrice } from "@/lib/packages/actions";

/**
 * Édition du tarif d'un forfait.
 *
 * L'application ne savait que CRÉER et DÉSACTIVER : changer un prix imposait
 * de passer par la base. L'action fait plus que la base — elle resynchronise
 * aussi le profil du routeur (qui alimente le journal MikHmon) et ré-envoie la
 * page du portail, dont le tarif est un instantané.
 */
export default function PriceEditor({
  packageId,
  priceCents,
  formatted,
}: {
  packageId: string;
  priceCents: number;
  formatted: string;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updatePackagePrice, undefined);

  if (!open) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {formatted}
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Modifier le tarif"
          aria-label="Modifier le tarif"
          className="rounded p-1 text-ink-soft transition-colors hover:bg-clay hover:text-ink"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        {state && (
          <span
            className={`text-xs ${"error" in state ? "text-err" : "text-ok"}`}
            aria-live="polite"
          >
            {"error" in state ? state.error : state.summary}
          </span>
        )}
      </span>
    );
  }

  return (
    <form action={action} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="packageId" value={packageId} />
      <input
        name="priceCents"
        defaultValue={priceCents}
        inputMode="numeric"
        autoFocus
        className="w-24 rounded-md border border-line-soft px-2 py-1 text-sm focus:border-ok focus:outline-none"
      />
      <button
        disabled={pending}
        title="Enregistrer"
        className="rounded p-1 text-ok transition-colors hover:bg-clay disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        title="Annuler"
        className="rounded p-1 text-ink-soft transition-colors hover:bg-clay"
      >
        <X className="h-4 w-4" />
      </button>
    </form>
  );
}
