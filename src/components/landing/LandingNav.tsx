"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Menu, X } from "lucide-react";
import Logo from "./Logo";
import { usePathname } from "next/navigation";
import type { Dictionary } from "@/lib/i18n/fr";
import {
  type Locale,
  LOCALES,
  localeHref,
  switchLocalePath,
} from "@/lib/i18n/config";

// Navigation principale volontairement COURTE. Elle comptait neuf entrées, dont
// six ancres vers des sections de cette même page — une barre saturée où plus
// rien ne ressortait.
//
// Matériel, Tarifs, Safecoin et FAQ n'y figurent plus : leurs sections restent
// en place sur la landing (on y arrive en faisant défiler), Tarifs et FAQ sont
// repris dans le pied de page.
/* Ce composant est CLIENT : il ne peut recevoir que des données sérialisables.
 * Lui passer le dictionnaire entier échouait au build — il contient des
 * fonctions d'interpolation (`trial`, `microcopy`…), que React refuse de faire
 * traverser la frontière serveur/client. On ne passe donc que la tranche `nav`,
 * qui n'est faite que de chaînes. */
type Nav = Dictionary["nav"];

const navLinks = (nav: Nav) =>
  [
    { href: "#features", label: nav.features },
    { href: "#plateforme", label: nav.platform },
    { href: "/boutique", label: nav.shop },
    { href: "/blog", label: nav.blog },
    { href: "/contact", label: nav.contact },
  ] as const;

const mobileLinkClass = "block px-6 py-4 font-display text-lg font-bold text-ink hover:bg-clay";

export default function LandingNav({
  anchorPrefix = "",
  nav,
  locale,
}: {
  anchorPrefix?: string;
  nav: Nav;
  locale: Locale;
}) {
  const links = navLinks(nav);
  const pathname = usePathname();
  const autre = LOCALES.find((l) => l !== locale) ?? locale;
  const [open, setOpen] = useState(false);
  // Le cookie de session est httpOnly : on interroge /api/session côté
  // client plutôt que de lire cookies() dans les pages, ce qui rendrait
  // dynamiques des pages aujourd'hui statiques (/, /blog, /contact).
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.authenticated) setAuthenticated(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Seules les ancres ont besoin du préfixe (retour vers la landing depuis
  // /auth, /blog, /contact…) — les vraies routes restent telles quelles.
  const getHref = (href: string) => (href.startsWith("#") ? `${anchorPrefix}${href}` : href);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href={localeHref("/", locale)} aria-label={nav.home}>
          <Logo />
        </Link>

        <nav
          aria-label={nav.mainNav}
          className="hidden items-center gap-7 text-sm font-semibold text-ink md:flex"
        >
          {links.map((l) =>
            l.href.startsWith("#") ? (
              <a key={l.href} href={getHref(l.href)} className="px-1 text-ink hover:text-brand-deep">
                <span>{l.label}</span>
              </a>
            ) : (
              <Link key={l.href} href={l.href} className="px-1 text-ink hover:text-brand-deep">
                <span>{l.label}</span>
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          {authenticated ? (
            <Link href="/admin" className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-dark px-4 py-2 text-sm">
              <LayoutDashboard className="h-4 w-4" />
              {nav.dashboard}
            </Link>
          ) : (
            <>
              <Link href={localeHref("/auth/login", locale)} className="hidden items-center justify-center gap-2 slate-btn slate-btn-ghost px-4 py-2 text-sm sm:inline-flex">
                {nav.signIn}
              </Link>
              <Link href={localeHref("/auth/register", locale)} className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary px-4 py-2 text-sm">
                {nav.getStarted}
              </Link>
            </>
          )}
          {/* Un LIEN, pas un bouton : la bascule doit fonctionner sans
              JavaScript, s'ouvrir dans un nouvel onglet et rester partageable.
              switchLocalePath renvoie l'ÉQUIVALENT de la page courante — depuis
              /contact on veut /en/contact, pas l'accueil. */}
          <Link
            href={switchLocalePath(pathname, autre)}
            hrefLang={autre}
            aria-label={nav.switchLabel}
            className="hidden items-center justify-center gap-1.5 rounded-full border border-line px-3 py-2 text-xs font-semibold text-ink-soft hover:bg-clay hover:text-ink sm:inline-flex"
          >
            {nav.switchTo}
          </Link>

          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? nav.closeMenu : nav.openMenu}
            onClick={() => setOpen((v) => !v)}
            className="rounded-full border border-line p-2 text-ink md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label={nav.mobileNav} className="border-t border-line bg-paper md:hidden">
          <ul role="list" className="divide-y divide-line-soft">
            {links.map((l) => (
              <li key={l.href}>
                {l.href.startsWith("#") ? (
                  <a href={getHref(l.href)} onClick={() => setOpen(false)} className={mobileLinkClass}>
                    {l.label}
                  </a>
                ) : (
                  <Link href={l.href} onClick={() => setOpen(false)} className={mobileLinkClass}>
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
            <li>
              <Link
                href={switchLocalePath(pathname, autre)}
                hrefLang={autre}
                onClick={() => setOpen(false)}
                className={mobileLinkClass}
              >
                {nav.switchTo}
              </Link>
            </li>
            <li>
              <Link
                href={authenticated ? "/admin" : localeHref("/auth/login", locale)}
                className="block px-6 py-4 font-display text-lg font-bold text-brand-deep hover:bg-clay"
              >
                {authenticated ? nav.dashboard : nav.signIn}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
