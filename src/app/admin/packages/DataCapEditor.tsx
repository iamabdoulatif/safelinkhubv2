"use client";

import { useActionState, useState } from "react";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { updatePackageDataCap } from "@/lib/packages/actions";

/**
 * Édition du plafond de données d'un forfait.
 *
 * Jumeau de PriceEditor, à une différence de fond près : le plafond n'est pas
 * porté par le profil du routeur, il est posé sur chaque ticket à sa création.
 * Il n'y a donc RIEN à resynchroniser — le changement vaut pour les tickets à
 * venir, et l'action se contente d'écrire en base.
 */
export default function DataCapEditor({
  packageId,
  dataCapMb,
  label,
}: {
  packageId: string;
  dataCapMb: number | null;
  label: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(updatePackageDataCap, undefined);

  if (!open) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={label ? "text-ink" : "text-ink-soft"}>
          {label ?? "volume illimité"}
        </span>
        <button
          type="button"
          onClick={() => setOpen(true)}
          title="Modifier le plafond de données"
          aria-label="Modifier le plafond de données"
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
        name="dataCapMb"
        defaultValue={dataCapMb ?? ""}
        inputMode="numeric"
        placeholder="Mo — vide = illimité"
        aria-label="Plafond de données en mégaoctets"
        autoFocus
        className="w-40 rounded-md border border-line-soft px-2 py-1 text-sm focus:border-ok focus:outline-none"
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
