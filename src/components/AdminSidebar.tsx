"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Router,
  BarChart2,
  Receipt,
  TrendingUp,
  Droplet,
  Users,
  Package,
  ArrowLeftRight,
  UserCog,
  Ticket,
  Wifi,
  Globe,
  Settings,
  CreditCard,
  LifeBuoy,
  Newspaper,
  Mail,
  Quote,
  ShieldCheck,
  ShoppingBag,
  Megaphone,
  ArrowUpRight,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import UserMenu from "./UserMenu";
import Logo from "./landing/Logo";

const mainLinks = [
  { href: "/admin", label: "Tableau de bord", icon: LayoutDashboard },
  { href: "/admin/router", label: "Routeur", icon: Router },
  { href: "/admin/usage-analytics", label: "Analyse d'utilisation", icon: BarChart2 },
  { href: "/admin/expenses", label: "Dépenses", icon: Receipt },
  { href: "/admin/sales", label: "Ventes", icon: TrendingUp },
  { href: "/admin/float", label: "Solde flottant", icon: Droplet },
  { href: "/admin/users", label: "Utilisateurs", icon: Users },
  { href: "/admin/packages", label: "Forfaits", icon: Package },
  { href: "/admin/transactions", label: "Transactions", icon: ArrowLeftRight },
  { href: "/admin/agent", label: "Agent", icon: UserCog },
  { href: "/admin/vouchers", label: "Vouchers", icon: Ticket },
  { href: "/admin/remote-access", label: "Accès distant", icon: Wifi },
  { href: "/admin/mikhmon-online", label: "Mikhmon Online", icon: Globe },
  { href: "/admin/shop", label: "Boutique", icon: ShoppingBag },
];

// Une seule entrée "Paramètres" : la navigation interne du hub (Général,
// Configuration routeur, Passerelles…) appartient aux onglets SettingsTabs
// — pas de deuxième système de navigation concurrent dans la sidebar.

const accountLinks = [
  { href: "/admin/billing", label: "Facturation", icon: CreditCard },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
];

// Sections réservées au superadmin — le lien n'est qu'un raccourci visuel,
// chaque page/action vérifie elle-même isSuperAdmin côté serveur.
const superadminLinks = [
  { href: "/admin/blog", label: "Blog", icon: Newspaper },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone },
  { href: "/admin/contact", label: "Messages de contact", icon: Mail },
  { href: "/admin/testimonials", label: "Témoignages", icon: Quote },
  { href: "/admin/authorizations", label: "Autorisations", icon: ShieldCheck },
];

export default function AdminSidebar({
  orgName,
  userName,
  userEmail,
  superadmin,
  pendingAuthorizations = 0,
}: {
  orgName: string;
  userName: string;
  userEmail: string;
  superadmin: boolean;
  /** Nombre de demandes d'autorisation en attente (badge in-app). */
  pendingAuthorizations?: number;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname?.startsWith(href);

  const closeMobile = () => setMobileOpen(false);

  // Drawer mobile : verrouille le scroll du fond, piège le focus dans le
  // panneau (Tab/Shift+Tab bouclent), Échap ferme, et le focus revient à
  // l'élément déclencheur à la fermeture.
  useEffect(() => {
    if (!mobileOpen) return;
    const aside = asideRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    aside?.querySelector<HTMLElement>("a[href], button")?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        closeMobile();
        return;
      }
      if (e.key !== "Tab" || !aside) return;
      const focusables = aside.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [mobileOpen]);

  return (
    <>
      {/* Mobile top bar */}
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b-2 border-line bg-paper px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center justify-center border-2 border-line p-1.5 text-ink hover:bg-clay"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Link href="/" aria-label="SafeLinkHub — retour à la landing page">
          <Logo />
        </Link>
        <div className="w-9" />
      </div>

      {/* Mobile overlay — aplat opaque, pas de blur */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={closeMobile}
          role="button"
          aria-label="Fermer le menu"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === "Escape") closeMobile();
          }}
        />
      )}

      {/* Sidebar — desktop always visible, mobile drawer */}
      <aside
        ref={asideRef}
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-shrink-0 flex-col overscroll-contain border-r-2 border-line bg-paper transition-transform duration-300 ease-in-out lg:static lg:w-60 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile close button inside sidebar */}
        <div className="flex items-center justify-between border-b-2 border-line px-5 py-4">
          <Link
            href="/"
            onClick={closeMobile}
            aria-label="SafeLinkHub — retour à la landing page"
          >
            <Logo />
          </Link>
          <button
            onClick={closeMobile}
            className="border-2 border-line p-1 text-ink hover:bg-clay lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b-2 border-line-soft px-4 py-3">
          <Link
            href="/admin/profile#organisation"
            onClick={closeMobile}
            title={`Voir les informations de ${orgName}`}
            className="flex w-full items-center gap-2 px-1 py-1.5 text-sm font-semibold text-ink hover:bg-clay"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center bg-ink font-display text-[10px] font-bold text-paper">
              {orgName.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 truncate">{orgName}</span>
            <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-soft" />
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {mainLinks.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={closeMobile}
                  className={`flex items-center gap-3 px-2.5 py-2 text-sm transition-colors ${
                    isActive(href)
                      ? "bg-brand font-bold text-[#1C1917]"
                      : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}

            <li>
              <Link
                href="/admin/settings/general"
                onClick={closeMobile}
                className={`flex items-center gap-3 px-2.5 py-2 text-sm transition-colors ${
                  pathname?.startsWith("/admin/settings")
                    ? "bg-brand font-bold text-[#1C1917]"
                    : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
                }`}
              >
                <Settings className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Paramètres</span>
              </Link>
            </li>
          </ul>

          <p className="mt-5 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft">
            Compte
          </p>
          <ul className="mt-1 space-y-0.5">
            {accountLinks.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={closeMobile}
                  className={`flex items-center gap-3 px-2.5 py-2 text-sm transition-colors ${
                    isActive(href)
                      ? "bg-brand font-bold text-[#1C1917]"
                      : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>

          {superadmin && (
            <>
              <p className="mt-5 px-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft">
                Superadmin
              </p>
              <ul className="mt-1 space-y-0.5">
                {superadminLinks.map(({ href, label, icon: Icon }) => {
                  const badge =
                    href === "/admin/authorizations" && pendingAuthorizations > 0
                      ? pendingAuthorizations
                      : 0;
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        onClick={closeMobile}
                        className={`flex items-center gap-3 px-2.5 py-2 text-sm transition-colors ${
                          isActive(href)
                            ? "bg-brand font-bold text-[#1C1917]"
                            : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
                        }`}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{label}</span>
                        {badge > 0 && (
                          <span className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-[#1C1917]">
                            {badge}
                          </span>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        <UserMenu
          userName={userName}
          userEmail={userEmail}
          superadmin={superadmin}
          onNavigate={closeMobile}
        />
      </aside>
    </>
  );
}
