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
  ChevronDown,
  LogOut,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { logout } from "@/lib/auth/actions";

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
];

const settingsLinks = [
  { href: "/admin/settings/general", label: "Général" },
  { href: "/admin/settings/router-setup", label: "Configuration routeur" },
  { href: "/admin/settings/captive-templates", label: "Modèles de portail captif" },
  { href: "/admin/settings/sms", label: "SMS" },
  { href: "/admin/settings/payment-gateways", label: "Passerelles de paiement" },
  { href: "/admin/settings/advanced", label: "Avancé" },
];

const accountLinks = [
  { href: "/admin/billing", label: "Facturation", icon: CreditCard },
  { href: "/admin/support", label: "Support", icon: LifeBuoy },
];

export default function AdminSidebar({
  orgName,
  userName,
}: {
  orgName: string;
  userName: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(
    pathname?.startsWith("/admin/settings") ?? false,
  );

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname?.startsWith(href);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      {/* Mobile top bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <button
          onClick={() => setMobileOpen(true)}
          className="flex items-center justify-center rounded-md p-2 text-slate-700 hover:bg-slate-100"
          aria-label="Ouvrir le menu"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-base font-bold tracking-tight text-slate-900">
          Safe<span className="text-emerald-500">LinkHub</span>
        </span>
        <div className="w-9" />
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={closeMobile}
        />
      )}

      {/* Sidebar — desktop always visible, mobile drawer */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 lg:w-60 flex-shrink-0 ${
          mobileOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Mobile close button inside sidebar */}
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <span className="text-lg font-bold tracking-tight text-slate-900">
            Safe<span className="text-emerald-500">LinkHub</span>
          </span>
          <button
            onClick={closeMobile}
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            aria-label="Fermer le menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-slate-200 px-5 py-3">
          <button className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
            <span className="flex h-6 w-6 items-center justify-center rounded bg-slate-900 text-[10px] font-semibold text-white">
              {orgName.slice(0, 2).toUpperCase()}
            </span>
            <span className="truncate">{orgName}</span>
            <ChevronDown className="ml-auto h-4 w-4 text-slate-400" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-3">
          <ul className="space-y-0.5">
            {mainLinks.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={closeMobile}
                  className={`flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                    isActive(href)
                      ? "bg-emerald-50 text-emerald-700"
                      : "text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}

            <li>
              <button
                onClick={() => setSettingsOpen((v) => !v)}
                className={`flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
                  pathname?.startsWith("/admin/settings")
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                <Settings className="h-4 w-4 flex-shrink-0" />
                <span className="truncate">Paramètres</span>
                <ChevronDown
                  className={`ml-auto h-4 w-4 text-slate-400 transition-transform duration-300 ${
                    settingsOpen ? "rotate-180" : ""
                  }`}
                />
              </button>
              {settingsOpen && (
                <ul className="mt-0.5 ml-7 space-y-0.5 border-l border-slate-200 pl-3 animate-fade-in">
                  {settingsLinks.map((s) => (
                    <li key={s.href}>
                      <Link
                        href={s.href}
                        onClick={closeMobile}
                        className={`block rounded-md px-2 py-1.5 text-sm transition-colors ${
                          pathname === s.href
                            ? "font-medium text-emerald-700"
                            : "text-slate-500 hover:text-slate-800"
                        }`}
                      >
                        {s.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          </ul>

          <p className="mt-5 px-2.5 text-[11px] font-semibold tracking-wide text-slate-400">
            COMPTE
          </p>
          <ul className="mt-1 space-y-0.5">
            {accountLinks.map(({ href, label, icon: Icon }) => (
              <li key={href}>
                <Link
                  href={href}
                  onClick={closeMobile}
                  className="flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <form action={logout} className="border-t border-slate-200 px-3 py-3">
          <div className="mb-2 truncate px-2.5 text-xs text-slate-400">
            {userName}
          </div>
          <button
            type="submit"
            className="flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Déconnexion
          </button>
        </form>
      </aside>
    </>
  );
}
