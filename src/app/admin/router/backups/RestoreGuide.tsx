"use client";

import { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";

/**
 * Guide de remplacement d'un MikroTik. Replié par défaut : l'admin qui vient
 * juste sauvegarder n'en a pas besoin, mais celui dont le routeur vient de
 * mourir le cherche — et l'ordre des étapes n'est pas devinable (l'auto-setup
 * DOIT précéder la restauration, sinon les tickets n'ont nulle part où aller).
 */
const STEPS: { title: string; body: string }[] = [
  {
    title: "1. Branchez le routeur de rechange et liez-le au SaaS",
    body: "Menu Routeurs → « Lier un MikroTik ». Le rechange doit apparaître « online » avant d'aller plus loin : la restauration passe par le même tunnel que le reste.",
  },
  {
    title: "2. Lancez l'auto-setup sur le rechange",
    body: "Réglages → Configuration du routeur. Cette étape crée le hotspot, le bridge, les adresses et installe MikHmon sur le support adapté au modèle (USB, flash, eMMC). Sans hotspot, les tickets n'ont nulle part où aller : la restauration refusera de démarrer.",
  },
  {
    title: "3. Scannez le rechange avec la sauvegarde de l'ancien",
    body: "Choisissez le rechange dans « Restaurer vers… » puis cliquez « Scanner ». Rien n'est écrit : le scan lit le matériel (ports, radios WiFi et leur API, stockage) et affiche ce qui sera repris, ce qui sera adapté, et ce qui bloque. Réglez les blocages avant de continuer.",
  },
  {
    title: "4. Simulez la restauration",
    body: "« Simuler » compte exactement ce qui serait créé — tickets, profils, walled-garden — sans rien écrire. Vérifiez que le nombre de tickets correspond à ce que vous attendez.",
  },
  {
    title: "5. Restaurez",
    body: "« Restaurer » écrit pour de bon : le rechange prend le nom RouterOS de l'ancien, son SSID (traduit si les générations diffèrent), le nom DNS du portail, puis les tickets et profils. Le portail captif est réinstallé en dernier et les forfaits du routeur sont réadoptés. Comptez plusieurs minutes pour ~5 000 tickets — RouterOS les crée un par un.",
  },
  {
    title: "6. Vérifiez sur place",
    body: "Le SSID de l'ancien doit réapparaître, le portail s'ouvrir avec les bons prix, et un ticket déjà vendu doit passer avec sa date d'expiration d'origine. Si le portail affiche la page RouterOS par défaut, réinstallez-le depuis Réglages → Portails captifs.",
  },
];

export default function RestoreGuide() {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-6 border-2 border-line bg-paper">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-semibold text-ink">
          <HelpCircle className="h-4 w-4" />
          Remplacer un MikroTik défaillant — guide étape par étape
        </span>
        <ChevronDown
          className={`h-4 w-4 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-line-soft px-4 py-3">
          <p className="mb-3 text-sm text-ink-soft">
            L&apos;ordre compte : l&apos;auto-setup doit passer <strong>avant</strong> la
            restauration. Il reconstruit le hotspot et MikHmon sur le support propre au modèle ;
            la restauration ne fait que réinjecter ce qui a de la valeur et ne se recrée pas —
            vos tickets vendus.
          </p>
          <ol className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.title}>
                <p className="text-sm font-medium text-ink">{s.title}</p>
                <p className="mt-0.5 text-sm text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
          <p className="mt-3 rounded-md bg-clay px-3 py-2 text-xs text-ink-soft">
            Bon à savoir : restaurer sur un routeur qui a déjà ses propres tickets les{" "}
            <strong>fusionne</strong> (ajout par nom, rien n&apos;est écrasé). Prévu pour un
            rechange vierge ; la simulation vous montre le nombre de créations avant d&apos;agir.
          </p>
        </div>
      )}
    </div>
  );
}
