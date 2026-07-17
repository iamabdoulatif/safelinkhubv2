import Link from "next/link";
import {
  ArrowRight,
  Building2,
  CreditCard,
  LayoutTemplate,
  MessageSquare,
  Router,
  Settings as SettingsIcon,
  ShieldCheck,
} from "lucide-react";
import { getCurrentOrganization } from "@/lib/organizations/actions";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(date);
}

const sections = [
  {
    href: "/admin/settings/router-setup",
    icon: Router,
    title: "Configuration routeur",
    description: "Topologie, bridges, VPN et auto-setup MikroTik.",
  },
  {
    href: "/admin/settings/captive-templates",
    icon: LayoutTemplate,
    title: "Portail captif",
    description: "Personnalisez la page de connexion hotspot de vos clients.",
  },
  {
    href: "/admin/settings/walled-garden",
    icon: ShieldCheck,
    title: "Walled-garden",
    description: "Hôtes de paiement joignables depuis le portail avant connexion.",
  },
  {
    href: "/admin/settings/sms",
    icon: MessageSquare,
    title: "SMS",
    description: "Passerelles d'envoi de SMS pour les notifications vouchers.",
  },
  {
    href: "/admin/settings/payment-gateways",
    icon: CreditCard,
    title: "Passerelles de paiement",
    description: "Paystack, Genius Pay, PawaPay pour les ventes en ligne.",
  },
  {
    href: "/admin/settings/advanced",
    icon: SettingsIcon,
    title: "Avancé",
    description: "Renommer ou supprimer définitivement l'organisation.",
  },
];

export default async function GeneralSettingsPage() {
  const org = await getCurrentOrganization();

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="flex items-center gap-2">
        <SettingsIcon className="h-5 w-5 text-ink" />
        <h1 className="text-2xl font-bold text-ink">Général</h1>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Vue d&apos;ensemble de votre organisation et accès rapide aux autres paramètres.
      </p>

      {org && (
        <div className="mt-6 border-2 border-line bg-paper p-4 sm:p-6">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-ink-soft" />
            <h2 className="text-sm font-semibold text-ink">Organisation</h2>
          </div>
          <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-ink-soft">Nom</dt>
              <dd className="mt-0.5 truncate font-medium text-ink">{org.name}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Identifiant (slug)</dt>
              <dd className="mt-0.5 truncate font-medium text-ink">{org.slug}</dd>
            </div>
            <div>
              <dt className="text-ink-soft">Client depuis</dt>
              <dd className="mt-0.5 font-medium text-ink">{formatDate(org.createdAt)}</dd>
            </div>
          </dl>
          <p className="mt-3 text-xs text-ink-soft">
            Pour renommer ou supprimer l&apos;organisation, voir{" "}
            <Link href="/admin/settings/advanced" className="font-medium text-ok hover:text-ok">
              Avancé
            </Link>
            .
          </p>
        </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {sections.map(({ href, icon: Icon, title, description }) => (
          <Link
            key={href}
            href={href}
            className="group flex items-start gap-3 border-2 border-line bg-paper p-4 transition-colors hover:border-ok hover:bg-clay/30"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-clay text-ink-soft group-hover:bg-paper group-hover:text-ok">
              <Icon className="h-4.5 w-4.5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5 font-medium text-ink">
                {title}
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-clay transition-transform group-hover:translate-x-0.5 group-hover:text-ok" />
              </span>
              <span className="mt-0.5 block text-xs text-ink-soft">{description}</span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
