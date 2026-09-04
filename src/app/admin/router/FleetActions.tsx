"use client";

import Link from "next/link";
import { ChevronDown, Save, Wrench } from "lucide-react";
import SyncAllButton from "./SyncAllButton";
import UnbindMacTicketsButton from "./UnbindMacTicketsButton";
import TicketExpiryFleetButton from "./TicketExpiryFleetButton";
import type { RouterDictionary } from "./router-row";

/**
 * Les outils de parc, repliés.
 *
 * Quatre commandes tenaient la barre au même poids que « Lier un MikroTik » —
 * or trois d'entre elles sont des RÉPARATIONS qu'on lance quelques fois par
 * an (délier les tickets MAC, réécrire les dates d'expiration, sauvegardes).
 * Elles restent à un geste, sans occuper l'écran en permanence.
 *
 * <details> natif plutôt qu'un menu flottant, pour DEUX raisons : le clavier
 * et le lecteur d'écran sont gérés par le navigateur, et surtout les boutons
 * restent MONTÉS quand on replie — leur compte rendu (« 12 tickets déliés
 * sur KALAM… ») survit donc à la fermeture, ce qu'un menu qui démonte son
 * contenu perdrait à chaque fois.
 */
export function FleetActions({
  t,
  actions,
  table,
}: {
  t: RouterDictionary["fleet"];
  actions: RouterDictionary["actions"];
  table: RouterDictionary["table"];
}) {
  return (
    <details className="group w-full sm:w-auto">
      <summary className="slate-btn slate-btn-ghost flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 text-sm marker:hidden [&::-webkit-details-marker]:hidden">
        <Wrench aria-hidden="true" className="h-4 w-4" />
        {t.moreActions}
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="slate-card mt-2 grid gap-2 bg-paper p-3 sm:grid-cols-2">
        <SyncAllButton t={actions} />
        <UnbindMacTicketsButton t={actions} />
        <TicketExpiryFleetButton t={actions} />
        <Link
          href="/admin/router/backups"
          className="flex min-h-11 items-center gap-2 rounded-xl border border-line bg-paper px-4 py-2 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay"
        >
          <Save aria-hidden="true" className="h-4 w-4" />
          {table.backups}
        </Link>
      </div>
    </details>
  );
}
