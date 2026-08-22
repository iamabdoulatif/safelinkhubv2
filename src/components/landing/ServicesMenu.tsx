"use client";

import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, Cctv, Router, ShieldCheck, Wifi } from "lucide-react";
import { localeHref, type Locale } from "@/lib/i18n/config";

type Menu = {
  label: string;
  vpnTitle: string;
  vpnText: string;
  hotspotTitle: string;
  hotspotText: string;
  cameraTitle: string;
  cameraText: string;
  firewallTitle: string;
  firewallText: string;
  all: string;
};

/* Menu « Services ».
 *
 * Il s'ouvre au survol ET au clic : le survol seul serait inatteignable au
 * clavier et au doigt. Échap referme, un clic dehors aussi, et le focus
 * revient au bouton — sans quoi la tabulation repartirait du haut de la page.
 *
 * `aria-expanded` et `aria-controls` disent l'état au lecteur d'écran ; un
 * simple div qui apparaît ne dit rien à personne. */
export default function ServicesMenu({
  menu,
  locale,
  className = "",
}: {
  menu: Menu;
  locale: Locale;
  className?: string;
}) {
  const [ouvert, setOuvert] = useState(false);
  const conteneur = useRef<HTMLDivElement>(null);
  const bouton = useRef<HTMLButtonElement>(null);
  const panneauId = useId();

  useEffect(() => {
    if (!ouvert) return;
    function surTouche(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOuvert(false);
        bouton.current?.focus();
      }
    }
    function surClic(e: MouseEvent) {
      if (!conteneur.current?.contains(e.target as Node)) setOuvert(false);
    }
    document.addEventListener("keydown", surTouche);
    document.addEventListener("mousedown", surClic);
    return () => {
      document.removeEventListener("keydown", surTouche);
      document.removeEventListener("mousedown", surClic);
    };
  }, [ouvert]);

  const services = [
    { href: "/vpn", icon: Router, titre: menu.vpnTitle, texte: menu.vpnText },
    { href: "/services/hotspot", icon: Wifi, titre: menu.hotspotTitle, texte: menu.hotspotText },
    { href: "/services/videosurveillance", icon: Cctv, titre: menu.cameraTitle, texte: menu.cameraText },
    { href: "/services/firewall", icon: ShieldCheck, titre: menu.firewallTitle, texte: menu.firewallText },
  ];

  return (
    <div
      ref={conteneur}
      className={`relative ${className}`}
      onMouseEnter={() => setOuvert(true)}
      onMouseLeave={() => setOuvert(false)}
    >
      <button
        ref={bouton}
        type="button"
        aria-expanded={ouvert}
        aria-controls={panneauId}
        onClick={() => setOuvert((v) => !v)}
        className="flex items-center gap-1 px-1 text-ink hover:text-brand-deep"
      >
        {menu.label}
        <ChevronDown
          aria-hidden="true"
          className={`h-3.5 w-3.5 transition-transform duration-200 ${ouvert ? "rotate-180" : ""}`}
        />
      </button>

      {ouvert && (
        <div
          id={panneauId}
          className="absolute left-1/2 top-full z-50 w-[34rem] -translate-x-1/2 pt-3"
        >
          <div className="slate-card overflow-hidden bg-paper p-2 shadow-[0_18px_48px_-12px_rgba(20,20,20,0.28)]">
            <ul role="list" className="grid grid-cols-2 gap-1">
              {services.map(({ href, icon: Icon, titre, texte }) => (
                <li key={href}>
                  <Link
                    href={localeHref(href, locale)}
                    onClick={() => setOuvert(false)}
                    className="nav-service flex gap-3 rounded-xl p-3 transition-colors hover:bg-clay"
                  >
                    <span className="nav-service-icon mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-clay text-brand-deep">
                      <Icon aria-hidden="true" className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold text-ink">{titre}</span>
                      <span className="mt-0.5 block text-xs leading-5 text-ink-soft">{texte}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link
              href={localeHref("/services", locale)}
              onClick={() => setOuvert(false)}
              className="mt-1 flex items-center justify-between rounded-xl bg-clay px-4 py-3 text-sm font-semibold text-ink hover:bg-line-soft"
            >
              {menu.all}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
