"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SETTINGS_SECTIONS } from "./sections";

/**
 * Navigation du hub : barre d'onglets soulignée, défilante sur petit écran.
 * Horizontale et non latérale : l'assistant de configuration routeur et son
 * éditeur de topologie ont besoin de toute la largeur. Les anciens onglets
 * « chemise » en gras et lime appartenaient à la charte Bitume.
 */
export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections des paramètres" className="mb-8 border-b border-line">
      <ul className="-mx-4 flex gap-1 overflow-x-auto px-4 md:mx-0 md:px-0">
        {SETTINGS_SECTIONS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm transition-colors ${
                  active
                    ? "border-ink font-semibold text-ink"
                    : "border-transparent font-medium text-ink-soft hover:border-line-strong/50 hover:text-ink"
                }`}
              >
                <Icon aria-hidden="true" className={`h-4 w-4 shrink-0 ${active ? "text-brand-deep" : ""}`} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
