"use client";

import { useEffect, useState, type CSSProperties } from "react";
import Link from "next/link";
import { LayoutDashboard, Menu, X } from "lucide-react";
import Logo from "./Logo";

// Navigation principale volontairement COURTE. Elle comptait neuf entrées, dont
// six ancres vers des sections de cette même page — une barre saturée où plus
// rien ne ressortait.
//
// Matériel, Tarifs, Safecoin et FAQ n'y figurent plus : leurs sections restent
// en place sur la landing (on y arrive en faisant défiler), Tarifs et FAQ sont
// repris dans le pied de page.
const links = [
  { href: "#features", label: "Fonctionnalités" },
  { href: "#plateforme", label: "Plateforme" },
  { href: "/boutique", label: "Boutique" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
] as const;

/* Deux habillages, un seul composant.
 *
 * La landing (/) est en peau Slate — traits fins, boutons pilule. /blog,
 * /blog/[slug] et /contact restent en Bitume — traits de 2 px, boutons
 * rectangulaires. Un composant par peau aurait dupliqué la logique de session
 * et le menu mobile ; une variante ne duplique que des classes. */
type Variant = "bitume" | "slate";

const skin = {
  bitume: {
    header: "border-b-2 border-line bg-paper",
    ghost: "border-2 border-line px-4 py-2 text-sm font-bold text-ink hover:bg-clay",
    primary: "border-2 border-line bg-brand px-3 py-2 text-sm font-bold text-[#1C1917] hover:bg-ink hover:text-paper sm:px-4",
    dashboard: "flex items-center gap-2 border-2 border-line bg-brand px-3 py-2 text-sm font-bold text-[#1C1917] hover:bg-ink hover:text-paper sm:px-4",
    burger: "border-2 border-line p-2 text-ink md:hidden",
    panel: "nav-mobile-panel border-t-2 border-line bg-paper md:hidden",
    link: "nav-scanner-link px-1 text-ink",
  },
  slate: {
    header: "border-b border-line bg-paper",
    ghost: "items-center justify-center gap-2 slate-btn slate-btn-ghost px-4 py-2 text-sm",
    primary: "inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary px-4 py-2 text-sm",
    dashboard: "inline-flex items-center justify-center gap-2 slate-btn slate-btn-dark px-4 py-2 text-sm",
    burger: "rounded-full border border-line p-2 text-ink md:hidden",
    panel: "border-t border-line bg-paper md:hidden",
    link: "px-1 text-ink hover:text-brand-deep",
  },
} satisfies Record<Variant, Record<string, string>>;

const mobileLinkClass = "block px-6 py-4 font-display text-lg font-bold text-ink hover:bg-clay";
const mobileItemStyle = (index: number) => ({ "--nav-index": index }) as CSSProperties;

export default function LandingNav({
  anchorPrefix = "",
  variant = "bitume",
}: {
  anchorPrefix?: string;
  variant?: Variant;
}) {
  const s = skin[variant];
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
    <header className={`sticky top-0 z-30 ${s.header}`}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" aria-label="SafeLinkHub — accueil">
          <Logo />
        </Link>

        <nav
          aria-label="Navigation principale"
          className="hidden items-center gap-7 text-sm font-semibold text-ink md:flex"
        >
          {links.map((l) =>
            l.href.startsWith("#") ? (
              <a key={l.href} href={getHref(l.href)} className={s.link}>
                <span>{l.label}</span>
              </a>
            ) : (
              <Link key={l.href} href={l.href} className={s.link}>
                <span>{l.label}</span>
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          {authenticated ? (
            <Link href="/admin" className={s.dashboard}>
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          ) : (
            <>
              <Link href="/auth/login" className={`hidden sm:inline-flex ${s.ghost}`}>
                Connexion
              </Link>
              <Link href="/auth/register" className={s.primary}>
                Commencer
              </Link>
            </>
          )}
          <button
            type="button"
            aria-expanded={open}
            aria-controls="mobile-menu"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setOpen((v) => !v)}
            className={s.burger}
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" aria-label="Navigation mobile" className={s.panel}>
          <ul role="list" className="divide-y divide-line-soft">
            {links.map((l, index) => (
              <li
                key={l.href}
                className={variant === "bitume" ? "nav-mobile-item" : undefined}
                style={variant === "bitume" ? mobileItemStyle(index) : undefined}
              >
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
            <li
              className={variant === "bitume" ? "nav-mobile-item" : undefined}
              style={variant === "bitume" ? mobileItemStyle(links.length) : undefined}
            >
              <Link
                href={authenticated ? "/admin" : "/auth/login"}
                className="block px-6 py-4 font-display text-lg font-bold text-brand-deep hover:bg-clay"
              >
                {authenticated ? "Dashboard" : "Connexion"}
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
