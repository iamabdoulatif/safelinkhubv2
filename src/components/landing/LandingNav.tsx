"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutDashboard, Menu, X } from "lucide-react";
import Logo from "./Logo";

const links = [
  { href: "#features", label: "Fonctionnalités" },
  { href: "#plateforme", label: "Plateforme" },
  { href: "#materiel", label: "Matériel" },
  { href: "#faq", label: "FAQ" },
  { href: "/blog", label: "Blog" },
  { href: "/contact", label: "Contact" },
] as const;

export default function LandingNav({ anchorPrefix = "" }: { anchorPrefix?: string }) {
  const [open, setOpen] = useState(false);
  // Le cookie de session est httpOnly : on interroge /api/session côté
  // client plutôt que de lire cookies() dans les pages, ce qui rendrait
  // dynamiques des pages aujourd'hui statiques (/, /blog, /contact).
  // Tant que la réponse n'est pas arrivée, on affiche les boutons
  // Connexion/Commencer par défaut.
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
  const getHref = (href: string) =>
    href.startsWith("#") ? `${anchorPrefix}${href}` : href;

  return (
    <header className="sticky top-0 z-30 border-b-2 border-line bg-paper">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
        <Link href="/" aria-label="SafeLinkHub — accueil">
          <Logo />
        </Link>

        <nav
          aria-label="Navigation principale"
          className="hidden items-center gap-7 text-sm font-semibold text-ink md:flex"
        >
          {links.map((l) =>
            l.href.startsWith("#") ? (
              <a
                key={l.href}
                href={getHref(l.href)}
                className="px-1 hover:bg-brand hover:text-[#1C1917]"
              >
                {l.label}
              </a>
            ) : (
              <Link
                key={l.href}
                href={l.href}
                className="px-1 hover:bg-brand hover:text-[#1C1917]"
              >
                {l.label}
              </Link>
            ),
          )}
        </nav>

        <div className="flex items-center gap-3">
          {authenticated ? (
            <Link
              href="/admin"
              className="flex items-center gap-2 border-2 border-line bg-brand px-3 py-2 text-sm font-bold text-[#1C1917] hover:bg-ink hover:text-paper sm:px-4"
            >
              <LayoutDashboard className="h-4 w-4" />
              Dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/auth/login"
                className="hidden border-2 border-line px-4 py-2 text-sm font-bold text-ink hover:bg-clay sm:inline-block"
              >
                Connexion
              </Link>
              <Link
                href="/auth/register"
                className="border-2 border-line bg-brand px-3 py-2 text-sm font-bold text-[#1C1917] hover:bg-ink hover:text-paper sm:px-4"
              >
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
            className="border-2 border-line p-2 text-ink md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* Menu mobile — panneau plein, aplat opaque */}
      {open && (
        <nav
          id="mobile-menu"
          aria-label="Navigation mobile"
          className="border-t-2 border-line bg-paper md:hidden"
        >
          <ul role="list" className="divide-y divide-line-soft">
            {links.map((l) => (
              <li key={l.href}>
                {l.href.startsWith("#") ? (
                  <a
                    href={getHref(l.href)}
                    onClick={() => setOpen(false)}
                    className="block px-6 py-4 font-display text-lg font-bold text-ink hover:bg-clay"
                  >
                    {l.label}
                  </a>
                ) : (
                  <Link
                    href={l.href}
                    onClick={() => setOpen(false)}
                    className="block px-6 py-4 font-display text-lg font-bold text-ink hover:bg-clay"
                  >
                    {l.label}
                  </Link>
                )}
              </li>
            ))}
            <li>
              {authenticated ? (
                <Link
                  href="/admin"
                  className="block px-6 py-4 font-display text-lg font-bold text-brand-deep hover:bg-clay"
                >
                  Dashboard
                </Link>
              ) : (
                <Link
                  href="/auth/login"
                  className="block px-6 py-4 font-display text-lg font-bold text-brand-deep hover:bg-clay"
                >
                  Connexion
                </Link>
              )}
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
