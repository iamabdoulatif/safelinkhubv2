"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Menu, Search, X } from "lucide-react";
import ServicesMenu from "./ServicesMenu";
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
    /* Le header ne pointe plus vers des ancres de la landing : chaque entrée
       mène à une page où le contenu est réellement rangé. « Fonctionnalités »
       et « Plateforme » sont devenues /services, l'accès distant a sa page
       /vpn, et le blog vit sous /formations. */
    { href: "/vpn", label: nav.vpn },
    { href: "/formations", label: nav.training },
    /* Le blog revient dans le header : il est resté atteignable depuis
       /formations tout ce temps, mais six articles publiés méritent leur
       propre entrée plutôt qu'un détour. */
    { href: "/blog", label: nav.blog },
    { href: "/boutique", label: nav.shop },
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

  /* Le panneau ouvert doit se fermer à Échap, et la page derrière lui ne doit
     pas continuer à défiler sous le doigt : sans le premier, le clavier restait
     piégé dans un menu qu'aucune touche ne refermait. */
  useEffect(() => {
    if (!open) return;
    const surTouche = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", surTouche);
    const overflowInitial = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.body.style.overflow = overflowInitial;
    };
  }, [open]);

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
  /* « Page courante » se juge SANS le préfixe de langue : sur /en/contact,
     l'entrée Contact doit s'allumer comme sur /contact. Comparaison exacte
     pour la racine, par préfixe ailleurs, sinon /services allumerait aussi
     /services/hotspot — ce qui est voulu — mais /vpn n'allumerait rien sur
     une sous-page qu'il n'a pas. */
  const cheminSansLangue = (pathname ?? "/").replace(/^\/en(?=\/|$)/, "") || "/";
  const estCourante = (href: string) =>
    href === "/" ? cheminSansLangue === "/" : cheminSansLangue.startsWith(href);

  const getHref = (href: string) =>
    href.startsWith("#") ? `${anchorPrefix}${href}` : localeHref(href, locale);

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href={localeHref("/", locale)} aria-label={nav.home}>
          <Logo />
        </Link>

        {/* lg (1024) et non md (768) : à 768 px la barre complète réclamait
            1055 px — les liens chevauchaient le logo, « Connexion » et « English »
            sortaient de l'écran, et TOUTE la page défilait latéralement sur iPad
            portrait. Mesuré à 1024 px avec les seules entrées gardées ici : 884 px. */}
        <nav
          aria-label={nav.mainNav}
          className="hidden min-w-0 items-center gap-5 text-sm font-semibold text-ink lg:flex xl:gap-7"
        >
          <ServicesMenu menu={nav.servicesMenu} locale={locale} />
          {links.map((l) =>
            l.href.startsWith("#") ? (
              <a key={l.href} href={getHref(l.href)} className="nav-link px-1 text-ink">
                <span>{l.label}</span>
              </a>
            ) : (
              <Link
                key={l.href}
                href={getHref(l.href)}
                aria-current={estCourante(l.href) ? "page" : undefined}
                className="nav-link px-1 text-ink"
              >
                <span>{l.label}</span>
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          {/* La loupe précède le ternaire : elle s'affiche que l'on soit
              connecté ou non. Masquée sous sm, où le menu mobile la reprend. */}
          <Link
            href={localeHref("/recherche", locale)}
            aria-label={nav.searchLabel}
            title={nav.search}
            className="hidden h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-clay hover:text-brand-deep lg:inline-flex"
          >
            <Search aria-hidden="true" className="h-4 w-4" />
          </Link>
          {authenticated ? (
            <Link href="/admin" className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-dark px-4 py-2 text-sm">
              <LayoutDashboard className="h-4 w-4" />
              {nav.dashboard}
            </Link>
          ) : (
            <>
              <Link href={localeHref("/auth/login", locale)} className="hidden min-h-11 items-center justify-center gap-2 slate-btn slate-btn-ghost px-4 py-2 text-sm xl:inline-flex">
                {nav.signIn}
              </Link>
              <Link href={localeHref("/auth/register", locale)} className="inline-flex min-h-11 items-center justify-center gap-2 slate-btn slate-btn-primary px-4 py-2 text-sm">
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
            className="hidden min-h-11 items-center justify-center gap-1.5 rounded-full border border-line px-3 text-xs font-semibold text-ink-soft hover:bg-clay hover:text-ink xl:inline-flex"
          >
            {nav.switchTo}
          </Link>

          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? nav.closeMenu : nav.openMenu}
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-line text-ink lg:hidden"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label={nav.mobileNav} className="max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-t border-line bg-paper lg:hidden">
          <ul role="list" className="divide-y divide-line-soft">
            {/* Sur mobile il n'y a pas de survol : les services sont dépliés
                d'emblée plutôt que cachés derrière un geste impossible. Le
                menu déroulant, lui, reste réservé au desktop. */}
            <li className="px-6 pt-4">
              <span className="font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft">
                {nav.servicesMenu.label}
              </span>
            </li>
            {[
              { href: "/vpn", label: nav.servicesMenu.vpnTitle },
              { href: "/services/hotspot", label: nav.servicesMenu.hotspotTitle },
              { href: "/services/videosurveillance", label: nav.servicesMenu.cameraTitle },
              { href: "/services/firewall", label: nav.servicesMenu.firewallTitle },
              { href: "/services", label: nav.servicesMenu.all },
            ].map((service) => (
              <li key={service.href}>
                <Link
                  href={localeHref(service.href, locale)}
                  onClick={() => setOpen(false)}
                  className="block px-6 py-3 pl-8 text-base font-semibold text-ink hover:bg-clay"
                >
                  {service.label}
                </Link>
              </li>
            ))}
            {links.map((l) => (
              <li key={l.href}>
                {l.href.startsWith("#") ? (
                  <a href={getHref(l.href)} onClick={() => setOpen(false)} className={mobileLinkClass}>
                    {l.label}
                  </a>
                ) : (
                  <Link href={getHref(l.href)} onClick={() => setOpen(false)} className={mobileLinkClass}>
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
            <li>
              <Link
                href={localeHref("/recherche", locale)}
                onClick={() => setOpen(false)}
                className={mobileLinkClass}
              >
                {nav.search}
              </Link>
            </li>
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
                onClick={() => setOpen(false)}
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
