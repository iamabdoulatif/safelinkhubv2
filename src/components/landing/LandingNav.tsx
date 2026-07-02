"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import Logo from "./Logo";

const links = [
  { href: "#features", label: "Fonctionnalités" },
  { href: "#plateforme", label: "Plateforme" },
  { href: "#materiel", label: "Matériel" },
  { href: "#faq", label: "FAQ" },
] as const;

export default function LandingNav() {
  const [open, setOpen] = useState(false);

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
          {links.map((l) => (
            <a key={l.href} href={l.href} className="hover:bg-brand hover:text-[#1C1917] px-1">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-3">
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
                <a
                  href={l.href}
                  onClick={() => setOpen(false)}
                  className="block px-6 py-4 font-display text-lg font-bold text-ink hover:bg-clay"
                >
                  {l.label}
                </a>
              </li>
            ))}
            <li>
              <Link
                href="/auth/login"
                className="block px-6 py-4 font-display text-lg font-bold text-brand-deep hover:bg-clay"
              >
                Connexion
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </header>
  );
}
