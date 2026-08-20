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
  RadioTower,
  Wifi,
  Globe,
  Settings,
  CreditCard,
  Coins,
  LifeBuoy,
  Newspaper,
  Mail,
  Quote,
  ShieldCheck,
  KeyRound,
  BarChart3,
  Megaphone,
  ArrowUpRight,
  Filter,
  Menu,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import UserMenu from "./UserMenu";
import Logo from "./landing/Logo";

/**
 * Navigation d'administration, GROUPÉE PAR MÉTIER.
 *
 * Elle a longtemps été une liste plate de seize entrées sans aucun titre, dans
 * un ordre qui alternait réseau, vente, comptabilité et administration
 * (« Analyse d'utilisation » puis « Dépenses » puis « Ventes » puis « Solde
 * flottant » puis « Utilisateurs »…). Sans repère, retrouver une page imposait
 * de relire les seize libellés à chaque fois, et les pages parentes se
 * retrouvaient éloignées : Forfaits et Tickets — ce qu'on vend — étaient
 * séparés par Transactions, Conversion et Agent.
 *
 * Les groupes suivent ce que fait l'opérateur, pas l'ordre d'arrivée des
 * fonctionnalités. Le tableau de bord reste seul en tête : c'est la page
 * d'atterrissage, elle n'appartient à aucune catégorie.
 *
 * Une seule entrée « Paramètres » : la navigation interne du hub (Général,
 * Configuration routeur, Passerelles…) appartient aux onglets SettingsTabs —
 * pas de deuxième système de navigation concurrent dans la sidebar.
 */
type NavLink = { href: string; label: string; icon: typeof LayoutDashboard };
type NavSection = { title: string | null; links: NavLink[] };

const mainSections: NavSection[] = [
  {
    title: null,
    links: [{ href: "/admin", label: "Tableau de bord", icon: LayoutDashboard }],
  },
  {
    title: "Réseau",
    links: [
      // Pluriel : la page liste le parc, elle n'en configure pas un seul.
      { href: "/admin/router", label: "Routeurs", icon: Router },
      { href: "/admin/remote-access", label: "Accès distant", icon: Wifi },
      { href: "/admin/roaming", label: "Roaming", icon: RadioTower },
      // Casse officielle du produit : MikHmon.
      { href: "/admin/mikhmon-online", label: "MikHmon Online", icon: Globe },
      // Utilisateurs actifs + routeurs en ligne : de la supervision réseau,
      // pas de l'analyse commerciale (à ne pas confondre avec « Analyse
      // commerciale », côté superadmin — d'où le renommage).
      { href: "/admin/usage-analytics", label: "Supervision", icon: BarChart2 },
    ],
  },
  {
    title: "Vente",
    links: [
      { href: "/admin/packages", label: "Forfaits", icon: Package },
      // « Vouchers » était le seul libellé anglais de la sidebar, alors que la
      // page elle-même s'intitule « Station Tickets » et compte des « tickets ».
      { href: "/admin/vouchers", label: "Tickets", icon: Ticket },
      { href: "/admin/agent", label: "Agents", icon: UserCog },
      { href: "/admin/sales", label: "Ventes", icon: TrendingUp },
      // La page est l'entonnoir des commandes du portail captif (combien
      // atteignent le checkout, combien paient). « Conversion paiement »
      // laissait croire à un réglage de moyens de paiement.
      { href: "/admin/conversion", label: "Tunnel de conversion", icon: Filter },
    ],
  },
  {
    title: "Finances",
    links: [
      { href: "/admin/transactions", label: "Transactions", icon: ArrowLeftRight },
      { href: "/admin/float", label: "Solde flottant", icon: Droplet },
      { href: "/admin/expenses", label: "Dépenses", icon: Receipt },
    ],
  },
  {
    title: "Organisation",
    links: [
      { href: "/admin/users", label: "Utilisateurs", icon: Users },
      { href: "/admin/settings/general", label: "Paramètres", icon: Settings },
    ],
  },
];

const accountLinks = [
  { href: "/admin/billing", label: "Facturation", icon: CreditCard },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
];

/** Style d'un lien de navigation — extrait pour que les trois blocs (métier,
 * compte, superadmin) ne puissent plus diverger : ils portaient la même longue
 * chaîne de classes recopiée trois fois. */
function navLinkClass(active: boolean) {
  return `flex items-center gap-3 px-2.5 py-2 text-sm transition-colors ${
    active
      ? "bg-brand font-bold text-slate-deep"
      : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
  }`;
}

function SectionTitle({ children, className = "" }: { children: string; className?: string }) {
  return (
    <p
      className={`px-2.5 font-mono text-[10px] font-semibold uppercase tracking-widest text-ink-soft ${className}`}
    >
      {children}
    </p>
  );
}

// Sections réservées au superadmin — le lien n'est qu'un raccourci visuel,
// chaque page/action vérifie elle-même isSuperAdmin côté serveur.
// Réordonné : ce sur quoi on AGIT d'abord (Autorisations porte un badge de
// demandes en attente — il était en septième position), le contenu éditorial
// ensuite, puisqu'on s'y rend par intention et non par urgence.
const superadminLinks = [
  { href: "/admin/authorizations", label: "Autorisations", icon: ShieldCheck },
  { href: "/admin/vpn-access", label: "Accès VPN clients", icon: KeyRound },
  { href: "/admin/analytics", label: "Analyse commerciale", icon: BarChart3 },
  { href: "/admin/safecoin", label: "Safecoin", icon: Coins },
  { href: "/admin/contact", label: "Messages de contact", icon: Mail },
  { href: "/admin/testimonials", label: "Témoignages", icon: Quote },
  { href: "/admin/blog", label: "Blog", icon: Newspaper },
  { href: "/admin/marketing", label: "Marketing", icon: Megaphone },
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

  const isActive = (href: string) => {
    // Le tableau de bord ne doit s'allumer que sur /admin exactement, sinon il
    // resterait actif sur toutes les sous-pages.
    if (href === "/admin") return pathname === "/admin";
    // « Paramètres » pointe vers /admin/settings/general mais représente TOUT le
    // hub : il doit rester actif sur /admin/settings/gateways, /router-setup…
    if (href.startsWith("/admin/settings")) return pathname?.startsWith("/admin/settings");
    return pathname?.startsWith(href);
  };

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
      <div className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center justify-between border-b border-line bg-paper px-4 lg:hidden">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center justify-center border border-line p-1.5 text-ink hover:bg-clay rounded-xl"
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
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-shrink-0 flex-col overscroll-contain border-r border-line bg-paper transition-transform duration-300 ease-in-out lg:static lg:w-60 lg:translate-x-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile close button inside sidebar */}
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <Link
            href="/"
            onClick={closeMobile}
            aria-label="SafeLinkHub — retour à la landing page"
          >
            <Logo />
          </Link>
          <button
            onClick={closeMobile}
            className="border border-line p-1 text-ink hover:bg-clay lg:hidden rounded-xl"
            aria-label="Fermer le menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-line-soft px-4 py-3">
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
          {mainSections.map((section, index) => (
            <div key={section.title ?? "principal"} className={index > 0 ? "mt-5" : undefined}>
              {section.title && <SectionTitle>{section.title}</SectionTitle>}
              <ul className={section.title ? "mt-1 space-y-0.5" : "space-y-0.5"}>
                {section.links.map(({ href, label, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={closeMobile}
                      className={navLinkClass(isActive(href))}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <SectionTitle className="mt-5">Compte</SectionTitle>
          <ul className="mt-1 space-y-0.5">
            {accountLinks.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link href={href} onClick={closeMobile} className={navLinkClass(isActive(href))}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>

          {superadmin && (
            <>
              <SectionTitle className="mt-5">Superadmin</SectionTitle>
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
                        className={navLinkClass(isActive(href))}
                      >
                        <Icon className="h-4 w-4 flex-shrink-0" />
                        <span className="truncate">{label}</span>
                        {badge > 0 && (
                          <span className="ml-auto rounded-full bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold text-slate-deep">
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
