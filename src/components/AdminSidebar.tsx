"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ArrowUpRight,
  ChevronDown,
  Menu,
  X,
  Languages,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import UserMenu from "./UserMenu";
import Logo from "./landing/Logo";
import { setLocale } from "@/lib/i18n/actions";
import type { Locale } from "@/lib/i18n/config";
import type { AdminDictionary } from "@/lib/i18n/admin/fr";
import { KYC_TABS } from "@/lib/kyc/statuses";
import { can } from "@/lib/auth/roles";
import {
  dashboard,
  groupeOuvert,
  isNavActive,
  navGroups,
  type NavDict,
  type NavGroup,
  type NavLink,
  type SectionKey,
} from "./admin-nav";

/** Lien de page. La pastille tient lieu de puce ET de marqueur d'état : pleine
 * et moutarde sur la page courante, effacée ailleurs. Aucune icône — les
 * icônes appartiennent aux groupes. */
function PageLink({
  href,
  label,
  active,
  onNavigate,
  badge,
  badgeTitle,
}: {
  href: string;
  label: string;
  active: boolean;
  onNavigate: () => void;
  badge?: number;
  badgeTitle?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2.5 rounded-lg py-2 pl-3 pr-2.5 text-sm transition-colors ${
        active
          ? "bg-brand/20 font-semibold text-ink"
          : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${
          active ? "bg-brand-deep" : "bg-line"
        }`}
      />
      <span className="truncate">{label}</span>
      {badge && badge > 0 ? (
        <span
          title={badgeTitle}
          className="ml-auto rounded-full bg-warn px-1.5 py-0.5 text-xs font-bold text-white"
        >
          {badge}
          <span className="sr-only"> — {badgeTitle}</span>
        </span>
      ) : null}
    </Link>
  );
}

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
  const [mobileOpen, setMobileOpen] = useState(false);
  const asideRef = useRef<HTMLElement>(null);

  const isActive = (href: string) => isNavActive(href, pathname);

  const visible = (link: NavLink) => !link.need || can(role, link.need);
  const groups: NavGroup[] = navGroups(superadmin)
    .map((group) => ({ ...group, links: group.links.filter(visible) }))
    // Un rôle restreint peut vider un groupe entier : un intitulé sans rien
    // dessous n'est pas une catégorie, c'est une impasse.
    .filter((group) => group.links.length > 0);

  /* Quel groupe est ouvert : voir groupeOuvert(). Pas d'effet ni d'état dérivé
     à resynchroniser — l'URL est la source, le clic n'est qu'un sursis. */
  const groupeActif = groups.find((g) => g.links.some((l) => isActive(l.href)))?.key ?? null;
  const [choix, setChoix] = useState<{ chemin: string; groupe: SectionKey | null } | null>(null);
  const openGroup = groupeOuvert({ groupeActif, choix, chemin: pathname });
  const toggleGroup = (key: SectionKey) =>
    setChoix({ chemin: pathname ?? "", groupe: openGroup === key ? null : key });

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
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-5">
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
            className="flex w-full items-center gap-2 rounded-lg px-1 py-1.5 text-sm font-semibold text-ink hover:bg-clay"
          >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-ink font-display text-xs font-bold text-paper">
              {orgName.slice(0, 2).toUpperCase()}
            </span>
            <span className="min-w-0 truncate">{orgName}</span>
            <ArrowUpRight className="ml-auto h-3.5 w-3.5 shrink-0 text-ink-soft" />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-3">
          <Link
            href={dashboard.href}
            onClick={closeMobile}
            aria-current={isActive(dashboard.href) ? "page" : undefined}
            className={`flex items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm transition-colors ${
              isActive(dashboard.href)
                ? "bg-brand/20 font-semibold text-ink"
                : "font-medium text-ink-soft hover:bg-clay hover:text-ink"
            }`}
          >
            <LayoutDashboard className="h-4 w-4 flex-shrink-0" />
            <span className="truncate">{nav.links[dashboard.key]}</span>
          </Link>

          {groups.map(({ key, icon: Icon, links }) => {
            const open = openGroup === key;
            const holdsActive = links.some((l) => isActive(l.href));
            const pending = key === "superadmin" ? pendingAuthorizations : 0;
            return (
              <div key={key}>
                <button
                  type="button"
                  onClick={() => toggleGroup(key)}
                  aria-expanded={open}
                  aria-controls={`nav-groupe-${key}`}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-sm font-semibold transition-colors ${
                    open ? "text-ink" : "text-ink-soft hover:bg-clay hover:text-ink"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{nav.sections[key]}</span>
                  {/* Replié, un groupe doit encore dire ce qu'il contient
                      d'important : la page où l'on se trouve, et les demandes
                      en attente. Déplié, ses entrées le disent déjà. */}
                  {!open && holdsActive && (
                    <span
                      aria-hidden="true"
                      className="h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-deep"
                    />
                  )}
                  {!open && pending > 0 && (
                    <span
                      title={pendingLabel}
                      className="rounded-full bg-warn px-1.5 py-0.5 text-xs font-bold text-white"
                    >
                      {pending}
                      <span className="sr-only"> — {pendingLabel}</span>
                    </span>
                  )}
                  <ChevronDown
                    className={`ml-auto h-3.5 w-3.5 flex-shrink-0 text-ink-soft transition-transform duration-200 ${
                      open ? "rotate-0" : "-rotate-90"
                    }`}
                  />
                </button>

                {open && (
                  <ul
                    id={`nav-groupe-${key}`}
                    className="animate-nav-unfold ml-[1.15rem] space-y-0.5 border-l border-line-soft py-0.5 pl-2"
                  >
                    {links.map(({ href, key: linkKey }) => (
                      <li key={href}>
                        <PageLink
                          href={href}
                          label={nav.links[linkKey]}
                          active={isActive(href)}
                          onNavigate={closeMobile}
                          badge={href === "/admin/authorizations" ? pendingAuthorizations : 0}
                          badgeTitle={pendingLabel}
                        />
                        {/* Les files du parcours KYC se déplient SUR PLACE quand
                            on est dans la section — un examinateur saute d'une
                            file à l'autre sans repasser par la page d'accueil. */}
                        {href === "/admin/kyc" && isActive("/admin/kyc") && (
                          <ul className="mb-1 ml-4 space-y-0.5 border-l border-line-soft pl-2">
                            {KYC_TABS.map((t) => (
                              <li key={t.key}>
                                <Link
                                  href={`/admin/kyc?statut=${t.key}`}
                                  onClick={closeMobile}
                                  className="block rounded-lg px-2.5 py-1.5 text-xs font-medium text-ink-soft transition-colors hover:bg-clay hover:text-ink"
                                >
                                  {t.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* Sélecteur de langue — action serveur : un cookie ne peut pas être
            posé pendant le rendu, les en-têtes sont déjà partis. */}
        <form action={setLocale} className="border-t border-line-soft px-3 py-2">
          <input type="hidden" name="locale" value={locale === "fr" ? "en" : "fr"} />
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-clay hover:text-ink"
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
