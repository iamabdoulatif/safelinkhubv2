"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Save, Wrench } from "lucide-react";
import SyncAllButton from "./SyncAllButton";
import UnbindMacTicketsButton from "./UnbindMacTicketsButton";
import TicketExpiryFleetButton from "./TicketExpiryFleetButton";
import WanStealthFleetButton from "./WanStealthFleetButton";
import type { RouterDictionary } from "./router-row";

/**
 * Les outils de parc, repliés derrière « Plus d'actions ».
 *
 * <details> natif : clavier et lecteur d'écran gérés par le navigateur, et
 * surtout les boutons restent MONTÉS quand on replie — leur compte rendu
 * (« 12 tickets déliés sur KALAM… ») survit à la fermeture.
 *
 * ─── Organisation du menu ──────────────────────────────────────────────────
 *
 * 1. TROIS GROUPES, trois natures : « Au quotidien » (synchroniser),
 *    « Réparations » (lancées quelques fois par an), « Réseau » (masquage).
 *    Un intitulé discret suffit à dire ce qu'on s'apprête à toucher.
 *
 * 2. UN SEUL GABARIT DE RANGÉE (FleetActionRow) : icône, titre, UNE phrase de
 *    résumé, bouton « Lancer ». Le mode d'emploi détaillé est replié derrière
 *    « En savoir plus » au lieu de former un mur de texte.
 *
 * 3. LE PANNEAU EST BORNÉ en hauteur : la liste défile, le lien
 *    « Sauvegardes » reste visible en pied (il fait quitter la page : chevron).
 *
 * 4. IL SE FERME comme un menu : clic à l'extérieur ou Échap (le focus revient
 *    alors sur le bouton déclencheur).
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
  const ref = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const el = ref.current;
    const onPointer = (e: PointerEvent) => {
      if (el && !el.contains(e.target as Node)) el.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && el) {
        el.open = false;
        el.querySelector("summary")?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <details
      ref={ref}
      onToggle={(e) => setOpen(e.currentTarget.open)}
      className="group relative w-full sm:w-auto"
    >
      <summary className="btn btn-md btn-outline w-full list-none marker:hidden sm:w-auto [&::-webkit-details-marker]:hidden">
        <Wrench aria-hidden="true" className="h-4 w-4" />
        {t.moreActions}
        <ChevronDown
          aria-hidden="true"
          className="h-4 w-4 transition-transform duration-200 group-open:rotate-180"
        />
      </summary>

      <div className="mt-2 flex w-full flex-col overflow-hidden rounded-xl border border-line bg-paper sm:absolute sm:right-0 sm:z-30 sm:max-h-[min(75vh,42rem)] sm:w-[30rem] sm:shadow-menu">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <MenuGroup label={t.groupDaily}>
            <SyncAllButton t={actions} />
          </MenuGroup>
          <MenuGroup label={t.groupRepair}>
            <UnbindMacTicketsButton t={actions} />
            <TicketExpiryFleetButton t={actions} />
          </MenuGroup>
          <MenuGroup label={t.groupNetwork}>
            <WanStealthFleetButton t={actions} />
          </MenuGroup>
        </div>

        <Link
          href="/admin/router/backups"
          className="flex min-h-11 shrink-0 items-center gap-2 border-t border-line bg-clay px-4 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-line-soft"
        >
          <Save aria-hidden="true" className="h-4 w-4" />
          {table.backups}
          <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 text-ink-soft" />
        </Link>
      </div>
    </details>
  );
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-b border-line-soft last:border-b-0" aria-label={label}>
      <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
        {label}
      </p>
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  );
}
