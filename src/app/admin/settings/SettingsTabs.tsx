"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Onglets du hub Paramètres — chaque entrée pointe vers une page réelle.
// "Abonnement" vit hors de /settings (facturation) mais appartient
// fonctionnellement au même hub, d'où sa présence ici.
// Vocabulaire unique pour tout le hub Paramètres : ces libellés doivent
// rester identiques à ceux des cartes de la page Général (la sidebar,
// elle, n'expose plus qu'une entrée "Paramètres" — un seul système).
const TABS = [
  { href: "/admin/settings/general", label: "Général" },
  { href: "/admin/settings/router-setup", label: "Configuration routeur" },
  { href: "/admin/settings/payment-gateways", label: "Passerelles de paiement" },
  { href: "/admin/settings/captive-templates", label: "Portail captif" },
  { href: "/admin/settings/walled-garden", label: "Walled-garden" },
  { href: "/admin/settings/sms", label: "SMS" },
  { href: "/admin/billing", label: "Abonnement" },
  { href: "/admin/settings/advanced", label: "Avancé" },
];

export default function SettingsTabs() {
  const pathname = usePathname();

  return (
    <nav aria-label="Sections des paramètres" className="mb-8 border-b border-line">
      <ul className="flex gap-2 overflow-x-auto pb-px">
        {TABS.map(({ href, label }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <li key={href} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`block border border-b-0 border-line px-4 py-2 text-sm font-bold transition-colors duration-150 ${
                  active
                    ? "bg-brand text-slate-deep"
                    : "bg-paper text-ink-soft hover:bg-clay hover:text-ink"
                }`}
              >
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
