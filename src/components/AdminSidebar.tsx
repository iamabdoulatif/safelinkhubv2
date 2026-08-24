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
  Languages,
  GraduationCap,
  BadgeCheck,
  UsersRound,
  ArrowRightLeft,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import UserMenu from "./UserMenu";
import Logo from "./landing/Logo";
import { setLocale } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n/config";
import type { AdminDictionary } from "@/lib/i18n/admin/fr";
import { KYC_TABS } from "@/lib/kyc/statuses";
import { can, type Capability } from "@/lib/auth/roles";

/* La tranche `nav` traverse la frontière serveur/client : elle ne doit donc
 * porter que des chaînes. `pendingBadge` est une fonction d'interpolation —
 * le layout la déroule côté serveur et n'envoie que le texte fini. */
type NavDict = Omit<AdminDictionary["nav"], "pendingBadge">;

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
/* Les libellés ne vivent plus ici : la structure porte une CLÉ stable, le
 * texte vient du dictionnaire. Renommer une route ne peut donc plus faire
 * perdre sa traduction à une entrée. */
type NavKey = keyof NavDict["links"];
/* `need` = capacité exigée pour VOIR l'entrée. Absente = visible par tous les
   membres, y compris un Lecteur : ce sont les écrans de consultation. Masquer
   plutôt que laisser cliquer vers un refus — un menu qui mène à « accès
   refusé » apprend à se méfier de tout le menu. */
type NavLink = { href: string; key: NavKey; icon: typeof LayoutDashboard; need?: Capability };
type NavSection = { title: keyof NavDict["sections"] | null; links: NavLink[] };

const mainSections: NavSection[] = [
  {
    title: null,
    links: [{ href: "/admin", key: "dashboard", icon: LayoutDashboard }],
  },
  {
    title: "network",
    links: [
      // Pluriel : la page liste le parc, elle n'en configure pas un seul.
      { href: "/admin/router", key: "routers", icon: Router, need: "routers" },
      { href: "/admin/remote-access", key: "remoteAccess", icon: Wifi, need: "routers" },
      { href: "/admin/roaming", key: "roaming", icon: RadioTower, need: "routers" },
      // Casse officielle du produit : MikHmon.
      { href: "/admin/mikhmon-online", key: "mikhmon", icon: Globe, need: "routers" },
      // Utilisateurs actifs + routeurs en ligne : de la supervision réseau,
      // pas de l'analyse commerciale (à ne pas confondre avec « Analyse
      // commerciale », côté superadmin — d'où le renommage).
      { href: "/admin/usage-analytics", key: "supervision", icon: BarChart2 },
    ],
  },
  {
    title: "sales",
    links: [
      { href: "/admin/packages", key: "packages", icon: Package, need: "packages" },
      // « Vouchers » était le seul libellé anglais de la sidebar, alors que la
      // page elle-même s'intitule « Station Tickets » et compte des « tickets ».
      { href: "/admin/vouchers", key: "tickets", icon: Ticket, need: "tickets" },
      { href: "/admin/agent", key: "agents", icon: UserCog, need: "tickets" },
      { href: "/admin/sales", key: "sales", icon: TrendingUp },
      // La page est l'entonnoir des commandes du portail captif (combien
      // atteignent le checkout, combien paient). « Conversion paiement »
      // laissait croire à un réglage de moyens de paiement.
      { href: "/admin/conversion", key: "conversion", icon: Filter },
    ],
  },
  {
    title: "finance",
    links: [
      { href: "/admin/transactions", key: "transactions", icon: ArrowLeftRight },
      { href: "/admin/float", key: "float", icon: Droplet, need: "billing" },
      { href: "/admin/expenses", key: "expenses", icon: Receipt, need: "billing" },
    ],
  },
  {
    title: "org",
    links: [
      { href: "/admin/users", key: "users", icon: Users },
      { href: "/admin/members", key: "members", icon: UsersRound, need: "members" },
      { href: "/admin/router-transfers", key: "transfers", icon: ArrowRightLeft, need: "routers" },
      { href: "/admin/verification", key: "verification", icon: ShieldCheck },
      { href: "/admin/settings/general", key: "settings", icon: Settings, need: "settings" },
    ],
  },
];

const accountLinks: NavLink[] = [
  { href: "/admin/billing", key: "billing", icon: CreditCard, need: "billing" },
  { href: "/admin/support", key: "support", icon: LifeBuoy },
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
const superadminLinks: NavLink[] = [
  { href: "/admin/authorizations", key: "authorizations", icon: ShieldCheck },
  { href: "/admin/kyc", key: "kyc", icon: BadgeCheck },
  { href: "/admin/vpn-access", key: "vpnAccess", icon: KeyRound },
  { href: "/admin/analytics", key: "analytics", icon: BarChart3 },
  { href: "/admin/safecoin", key: "safecoin", icon: Coins },
  { href: "/admin/contact", key: "contact", icon: Mail },
  { href: "/admin/testimonials", key: "testimonials", icon: Quote },
  { href: "/admin/blog", key: "blog", icon: Newspaper },
  { href: "/admin/formations", key: "training", icon: GraduationCap },
  { href: "/admin/marketing", key: "marketing", icon: Megaphone },
];

export default function AdminSidebar({
  orgName,
  userName,
  userEmail,
  superadmin,
  role,
  pendingAuthorizations = 0,
  pendingLabel,
  nav,
  language,
  locale,
}: {
  orgName: string;
  userName: string;
  userEmail: string;
  superadmin: boolean;
  /** Rôle du visiteur — décide des entrées visibles. */
  role: string;
  /** Nombre de demandes d'autorisation en attente (badge in-app). */
  pendingAuthorizations?: number;
  /** Texte du badge, déjà interpolé côté serveur. */
  pendingLabel?: string;
  nav: NavDict;
  language: AdminDictionary["language"];
  locale: Locale;
}) {
  const pathname = usePathname();
  const visible = (link: NavLink) => !link.need || can(role, link.need);
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
          aria-label={nav.openMenu}
        >
          <Menu className="h-4 w-4" />
        </button>
        <Link href="/" aria-label={nav.backToLanding}>
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
          aria-label={nav.closeMenu}
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
            aria-label={nav.backToLanding}
          >
            <Logo />
          </Link>
          <button
            onClick={closeMobile}
            className="border border-line p-1 text-ink hover:bg-clay lg:hidden rounded-xl"
            aria-label={nav.closeMenu}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-line-soft px-4 py-3">
          <Link
            href="/admin/profile#organisation"
            onClick={closeMobile}
            title={orgName}
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
              {section.title && <SectionTitle>{nav.sections[section.title]}</SectionTitle>}
              <ul className={section.title ? "mt-1 space-y-0.5" : "space-y-0.5"}>
                {section.links.filter(visible).map(({ href, key, icon: Icon }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={closeMobile}
                      className={navLinkClass(isActive(href))}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" />
                      <span className="truncate">{nav.links[key]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <SectionTitle className="mt-5">{nav.sections.account}</SectionTitle>
          <ul className="mt-1 space-y-0.5">
            {accountLinks.filter(visible).map(({ href, key, icon: Icon }) => (
              <li key={href}>
                <Link href={href} onClick={closeMobile} className={navLinkClass(isActive(href))}>
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{nav.links[key]}</span>
                </Link>
              </li>
            ))}
          </ul>

          {superadmin && (
            <>
              <SectionTitle className="mt-5">{nav.sections.superadmin}</SectionTitle>
              <ul className="mt-1 space-y-0.5">
                {superadminLinks.map(({ href, key, icon: Icon }) => {
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
                        <span className="truncate">{nav.links[key]}</span>
                        {badge > 0 && (
                          <span
                            title={pendingLabel}
                            className="ml-auto rounded-full bg-warn px-1.5 py-0.5 text-[10px] font-bold text-white"
                          >
                            {badge}
                            <span className="sr-only"> — {pendingLabel}</span>
                          </span>
                        )}
                      </Link>
                      {/* Les files du parcours KYC se déplient SUR PLACE quand
                          on est dans la section — un examinateur saute d'une
                          file à l'autre sans repasser par la page d'accueil.
                          Repliées ailleurs : six entrées de plus dans une
                          barre qui en compte déjà une trentaine. */}
                      {href === "/admin/kyc" && isActive("/admin/kyc") && (
                        <ul className="mb-1 ml-6 space-y-0.5 border-l border-line-soft pl-2">
                          {KYC_TABS.map((t) => (
                            <li key={t.key}>
                              <Link
                                href={`/admin/kyc?statut=${t.key}`}
                                onClick={closeMobile}
                                className="block px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-clay hover:text-ink"
                              >
                                {t.label}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </nav>

        {/* Sélecteur de langue — action serveur : un cookie ne peut pas être
            posé pendant le rendu, les en-têtes sont déjà partis. */}
        <form action={setLocale} className="border-t border-line-soft px-3 py-2">
          <input type="hidden" name="locale" value={locale === "fr" ? "en" : "fr"} />
          <button
            type="submit"
            className="flex w-full items-center gap-3 px-2.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-clay hover:text-ink"
          >
            <Languages className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{language.label}</span>
            <span className="ml-auto font-semibold text-ink">{language.switchTo}</span>
          </button>
        </form>

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
