"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Save, Wrench, X } from "lucide-react";
import SyncAllButton from "./SyncAllButton";
import UnbindMacTicketsButton from "./UnbindMacTicketsButton";
import TicketExpiryFleetButton from "./TicketExpiryFleetButton";
import WanStealthFleetButton from "./WanStealthFleetButton";
import MikhmonLocalAccessFleetButton from "./MikhmonLocalAccessFleetButton";
import type { RouterDictionary } from "./router-row";

/**
 * Les outils de parc, derrière « Plus d'actions ».
 *
 * Ce n'est plus un menu déroulant : des opérations de parc rares et
 * conséquentes (masquer au fournisseur, réparer des tickets, délier des MAC)
 * tenaient à l'étroit dans un popover de 30 rem qui défilait. Elles s'ouvrent
 * désormais dans un PANNEAU LATÉRAL — la grammaire du tiroir déjà employée
 * ailleurs (accès distant), pas une troisième forme de fenêtre.
 *
 * ─── Ce qui est conservé du menu précédent ──────────────────────────────────
 *
 * 1. LE CONTENU RESTE MONTÉ quand on ferme (overlay toujours rendu, neutralisé
 *    par `inert`) : le compte rendu d'une action (« 12 tickets déliés sur
 *    KALAM… ») survit à la fermeture, comme avec le <details> natif.
 * 2. TROIS NATURES, trois groupes : « Au quotidien », « Réparations »,
 *    « Réseau », plus MikHmon. Un seul gabarit de rangée (FleetActionRow).
 * 3. « Sauvegardes » reste en pied (il fait quitter la page : chevron).
 * 4. IL SE FERME comme un dialogue : Échap, clic sur le voile ou bouton de
 *    fermeture ; le focus revient alors sur le déclencheur.
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
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  // Le focus entre dans le panneau à l'ouverture et revient au déclencheur à la
  // fermeture : sans cela une tabulation renverrait derrière le voile.
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className="btn btn-md btn-outline w-full sm:w-auto"
      >
        <Wrench aria-hidden="true" className="h-4 w-4" />
        {t.moreActions}
        <ChevronDown
          aria-hidden="true"
          className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Overlay TOUJOURS monté : le compte rendu des actions doit survivre à la
          fermeture. `inert` le retire du focus et des lecteurs d'écran quand il
          est replié, sans le démonter. */}
      <div
        inert={!open}
        aria-hidden={!open}
        className={`fixed inset-0 z-50 flex justify-end transition-opacity duration-200 ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        <div
          aria-hidden="true"
          onMouseDown={close}
          className="absolute inset-0 bg-[#12301D]/55"
        />
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          className={`relative flex h-full w-full max-w-md flex-col border-l border-line bg-paper shadow-modal transition-transform duration-200 ${
            open ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <header className="flex items-center gap-3 border-b border-line px-4 py-3.5 sm:px-5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-line-soft bg-clay text-ink">
              <Wrench aria-hidden="true" className="h-4 w-4" />
            </span>
            <h2 id={titleId} className="min-w-0 flex-1 text-base font-bold text-ink">
              {t.moreActions}
            </h2>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Fermer"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-soft transition-colors duration-150 hover:bg-clay hover:text-ink"
            >
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          </header>

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
            <MenuGroup label="MikHmon">
              <MikhmonLocalAccessFleetButton />
            </MenuGroup>
          </div>

          <Link
            href="/admin/router/backups"
            className="flex min-h-11 shrink-0 items-center gap-2 border-t border-line bg-clay px-4 py-3 text-sm font-semibold text-ink transition-colors duration-150 hover:bg-line-soft sm:px-5"
          >
            <Save aria-hidden="true" className="h-4 w-4" />
            {table.backups}
            <ChevronRight aria-hidden="true" className="ml-auto h-4 w-4 text-ink-soft" />
          </Link>
        </div>
      </div>
    </>
  );
}

function MenuGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="border-b border-line-soft last:border-b-0" aria-label={label}>
      <p className="px-4 pt-3 text-[11px] font-semibold uppercase tracking-wider text-ink-soft sm:px-5">
        {label}
      </p>
      <div className="divide-y divide-line-soft">{children}</div>
    </section>
  );
}
