"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LifeBuoy } from "lucide-react";
import { navTrail, type NavDict } from "./admin-nav";

/**
 * Barre supérieure desktop (≥ lg) : fil d'Ariane organisation / groupe / page.
 *
 * Le mobile a déjà sa barre (menu + logo) dans AdminSidebar ; sur desktop, rien
 * ne disait où l'on se trouvait hors de la barre latérale. Le fil est lu dans
 * la MÊME structure que la barre latérale (admin-nav) : une entrée renommée ou
 * déplacée l'est aux deux endroits.
 */
export default function AdminTopbar({
  orgName,
  superadmin,
  nav,
}: {
  orgName: string;
  superadmin: boolean;
  nav: NavDict;
}) {
  const pathname = usePathname();
  const trail = navTrail(pathname, superadmin);
  const sep = (
    <span aria-hidden="true" className="text-line-strong">
      /
    </span>
  );

  return (
    <header className="hidden h-14 shrink-0 items-center justify-between gap-6 border-b border-line bg-paper px-8 lg:flex">
      <nav aria-label={nav.breadcrumb} className="min-w-0">
        <ol className="flex min-w-0 items-center gap-2 text-[13px] text-ink-soft">
          <li className="min-w-0 truncate">
            <Link href="/admin/profile#organisation" className="hover:text-ink">
              {orgName}
            </Link>
          </li>
          {trail?.section && (
            <li className="flex shrink-0 items-center gap-2">
              {sep}
              {nav.sections[trail.section]}
            </li>
          )}
          {trail && (
            <li className="flex min-w-0 items-center gap-2">
              {sep}
              {trail.deeper ? (
                // Sous la page (fiche d'un routeur…) : retour à la liste.
                <Link href={trail.link.href} className="truncate hover:text-ink">
                  {nav.links[trail.link.key]}
                </Link>
              ) : (
                <span aria-current="page" className="truncate font-medium text-ink">
                  {nav.links[trail.link.key]}
                </span>
              )}
            </li>
          )}
        </ol>
      </nav>
      <Link
        href="/admin/support"
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-ink hover:bg-clay"
      >
        <LifeBuoy aria-hidden="true" className="h-4 w-4 text-ink-soft" />
        {nav.links.support}
      </Link>
    </header>
  );
}
