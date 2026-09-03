"use client";

import { useActionState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { updatePackagePrice } from "@/lib/packages/actions";

/**
 * Correction en un clic d'un palier incohérent.
 *
 * Signaler « ce forfait coûte plus cher par jour que le précédent » sans dire
 * jusqu'où descendre, c'est laisser une soustraction à faire de tête devant
 * l'écran. Le bouton passe par LA MÊME action que l'édition manuelle : le prix
 * n'est pas seulement écrit en base, le profil du routeur et la page du portail
 * sont resynchronisés derrière. Une écriture directe en base laisserait les
 * routeurs vendre à l'ancien tarif.
 */
export default function LadderFixButton({
  packageId,
  prixMax,
  formatted,
}: {
  packageId: string;
  prixMax: number;
  formatted: string;
}) {
  const [state, action, pending] = useActionState(updatePackagePrice, undefined);

  return (
    <form action={action} className="mt-1.5 flex flex-wrap items-center gap-2">
      <input type="hidden" name="packageId" value={packageId} />
      <input type="hidden" name="priceCents" value={prixMax} />
      <button
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full border border-line bg-paper px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-clay disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <Wand2 className="h-3.5 w-3.5" />
        )}
        Descendre à {formatted}
      </button>
      {state && (
        <span
          className={`text-xs ${"error" in state ? "text-err" : "text-ok"}`}
          aria-live="polite"
        >
          {"error" in state ? state.error : state.summary}
        </span>
      )}
    </form>
  );
}
