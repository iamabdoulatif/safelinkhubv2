"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, Save, Wrench } from "lucide-react";
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
 *
 * ─── Ce que la mise en page corrige ────────────────────────────────────────
 *
 * 1. LA PASTILLE NE GRANDIT PLUS. Le <summary> est un bloc : il épousait la
 *    largeur du panneau ouvert, si bien que le bouton doublait de taille et
 *    que son libellé glissait au moment même du clic. `sm:w-fit` le fige à sa
 *    largeur de repos, dans les deux états.
 *
 * 2. QUATRE PILULES DANS UNE CARTE DANS UNE PASTILLE : trois traits et trois
 *    rayons imbriqués pour quatre commandes. Une LISTE de rangées séparées
 *    d'un filet remplace la grille de pilules — un seul contour, celui de la
 *    carte.
 *
 * 3. TROIS NATURES, UN SEUL POIDS. « Synchroniser » est le geste du quotidien,
 *    les deux réparations se lancent une fois l'an, « Sauvegardes » n'est même
 *    pas une action mais un LIEN vers une autre page. Le lien descend en pied
 *    de carte, derrière un filet plein et avec un chevron : on voit qu'il fait
 *    quitter l'écran avant de le suivre.
 *
 * 4. LES DEUX RÉPARATIONS S'EXPLIQUENT. Leur mode d'emploi n'existait que dans
 *    un `title=` — invisible au doigt, muet au clavier, et deux secondes
 *    d'attente à la souris. Ce sont pourtant les deux seules commandes dont
 *    personne ne devine l'effet. Le texte est désormais lu à l'écran, sous le
 *    bouton qu'il décrit.
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
      <summary className="slate-btn slate-btn-ghost flex min-h-11 cursor-pointer list-none items-center justify-center gap-2 px-4 text-sm marker:hidden [&::-webkit-details-marker]:hidden sm:w-fit">
        <Wrench aria-hidden="true" className="h-4 w-4" />
        {t.moreActions}
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="slate-card mt-2 w-full overflow-hidden bg-paper sm:w-[32rem]">
        <ul className="divide-y divide-line-soft" role="list">
          <li className="p-3">
            <SyncAllButton t={actions} />
          </li>
          <li className="p-3">
            <UnbindMacTicketsButton t={actions} />
            <p className="mt-2 text-xs leading-5 text-ink-soft">{actions.unbindHelp}</p>
          </li>
          <li className="p-3">
            <TicketExpiryFleetButton t={actions} />
            <p className="mt-2 text-xs leading-5 text-ink-soft">{actions.ticketExpiryHelp}</p>
          </li>
        </ul>

        <Link
          href="/admin/router/backups"
          className="flex min-h-11 items-center gap-2 border-t border-line bg-clay px-4 py-3 text-sm font-bold text-ink transition-colors duration-150 hover:bg-line-soft"
        >
          <Save aria-hidden="true" className="h-4 w-4" />
          {table.backups}
          <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 text-ink-soft" />
        </Link>
      </div>
    </details>
  );
}
