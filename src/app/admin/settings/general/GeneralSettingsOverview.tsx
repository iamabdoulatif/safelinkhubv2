import Link from "next/link";
import {
  ArrowRight,
  Building2,
  ChevronRight,
  Radio,
  ShoppingBag,
  MessagesSquare,
  Settings2,
} from "lucide-react";
import { SETTINGS_SECTIONS } from "../sections";
import CopyValue from "./CopyValue";

export type SettingsCounts = {
  routers: number | null;
  gateways: number | null;
  portals: number | null;
  sms: number | null;
};
type OrganizationIdentity = {
  name: string;
  slug: string;
  accountType: string;
  createdAtLabel: string;
};

const descriptions: Record<string, string> = {
  "/admin/settings/router-setup":
    "Liez vos MikroTik et configurez leurs connexions.",
  "/admin/settings/captive-templates":
    "Personnalisez la page d’accueil de vos clients Wi-Fi.",
  "/admin/settings/walled-garden":
    "Choisissez les sites accessibles avant la connexion.",
  "/admin/settings/payment-gateways":
    "Choisissez comment encaisser les paiements en ligne.",
  "/admin/billing": "Retrouvez votre formule, votre solde et vos factures.",
  "/admin/settings/notifications":
    "Connectez Telegram et choisissez vos alertes.",
  "/admin/settings/sms": "Envoyez les codes et les notifications par SMS.",
};
const sections = [
  {
    title: "Connecter le réseau",
    description: "Vos équipements et l’accueil de vos clients.",
    icon: Radio,
    paths: [
      "/admin/settings/router-setup",
      "/admin/settings/captive-templates",
      "/admin/settings/walled-garden",
    ],
  },
  {
    title: "Préparer les ventes",
    description: "Vos encaissements et votre abonnement.",
    icon: ShoppingBag,
    paths: ["/admin/settings/payment-gateways", "/admin/billing"],
  },
  {
    title: "Rester informé",
    description: "Les messages utiles, au bon moment.",
    icon: MessagesSquare,
    paths: ["/admin/settings/notifications", "/admin/settings/sms"],
  },
];

function statusFor(
  href: string,
  counts: SettingsCounts,
): { text: string; positive?: boolean } | null {
  if (href === "/admin/settings/router-setup")
    return counts.routers === null
      ? { text: "État indisponible" }
      : {
          text:
            counts.routers === 0
              ? "Aucun routeur lié"
              : `${counts.routers} routeur${counts.routers > 1 ? "s" : ""} lié${counts.routers > 1 ? "s" : ""}`,
          positive: counts.routers > 0,
        };
  if (href === "/admin/settings/captive-templates")
    return counts.portals === null
      ? { text: "État indisponible" }
      : {
          text:
            counts.portals === 0
              ? "Portail par défaut"
              : `${counts.portals} modèle${counts.portals > 1 ? "s" : ""} disponible${counts.portals > 1 ? "s" : ""}`,
          positive: counts.portals > 0,
        };
  if (href === "/admin/settings/payment-gateways")
    return counts.gateways === null
      ? { text: "État indisponible" }
      : {
          text:
            counts.gateways === 0
              ? "Pour les ventes en ligne"
              : `${counts.gateways} passerelle${counts.gateways > 1 ? "s" : ""} active${counts.gateways > 1 ? "s" : ""}`,
          positive: counts.gateways > 0,
        };
  if (href === "/admin/settings/sms")
    return counts.sms === null
      ? { text: "État indisponible" }
      : {
          text: counts.sms === 0 ? "Optionnel" : "Passerelle SMS active",
          positive: counts.sms > 0,
        };
  return null;
}
function nextAction(counts: SettingsCounts) {
  if (counts.routers === 0)
    return {
      eyebrow: "Pour commencer",
      title: "Liez votre premier routeur",
      detail:
        "Ajoutez un MikroTik pour commencer à gérer votre réseau depuis SafeLinkHub.",
      label: "Lier mon premier routeur",
      href: "/admin/settings/router-setup",
    };
  if (counts.routers === null)
    return {
      eyebrow: "Votre espace reste accessible",
      title: "Retrouvez vos réglages réseau",
      detail:
        "L’état des équipements n’a pas pu être chargé. Vous pouvez toujours ouvrir leur configuration.",
      label: "Ouvrir les réglages réseau",
      href: "/admin/settings/router-setup",
    };
  if (counts.gateways === 0)
    return {
      eyebrow: "Selon votre activité",
      title: "Proposez le paiement en ligne",
      detail:
        "Si vous souhaitez encaisser en ligne, choisissez une passerelle adaptée à vos clients.",
      label: "Configurer les paiements",
      href: "/admin/settings/payment-gateways",
    };
  if (counts.portals === 0)
    return {
      eyebrow: "À votre image",
      title: "Personnalisez l’accueil de votre Wi-Fi",
      detail:
        "Ajoutez votre identité au portail captif. Le portail par défaut reste disponible.",
      label: "Personnaliser le portail",
      href: "/admin/settings/captive-templates",
    };
  return {
    eyebrow: "Au quotidien",
    title: "Vos réglages, au même endroit",
    detail:
      "Retrouvez ci-dessous les réglages de votre espace, ou passez à la supervision de vos équipements.",
    label: "Voir mon parc",
    href: "/admin/router",
  };
}

export default function GeneralSettingsOverview({
  organization,
  counts,
}: {
  organization: OrganizationIdentity;
  counts: SettingsCounts;
}) {
  const initials =
    organization.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0]?.toUpperCase())
      .join("") || "?";
  const next = nextAction(counts);
  return (
    <div className="mx-auto max-w-6xl space-y-6 pb-8">
      <header>
        <p className="text-xs font-medium uppercase tracking-wider text-ink-soft">
          Général
        </p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Paramètres de votre espace
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-soft">
          Un réseau bien configuré, des ventes simples et les bonnes
          informations au bon moment.
        </p>
      </header>

      <section
        aria-labelledby="organization-heading"
        className="overflow-hidden rounded-2xl border border-line bg-paper"
      >
        <div className="flex flex-wrap items-center gap-4 border-b border-line-soft p-5 sm:p-6">
          <span
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-deep text-base font-semibold text-white"
          >
            {initials}
          </span>
          <div className="min-w-0 flex-1 basis-48">
            <p className="text-xs text-ink-soft">Votre organisation</p>
            <h2
              id="organization-heading"
              className="mt-1 break-words text-lg font-semibold tracking-tight text-ink"
            >
              {organization.name}
            </h2>
          </div>
          <Link
            href="/admin/settings/advanced"
            className="btn btn-sm btn-outline"
          >
            Renommer
          </Link>
        </div>
        <dl className="grid gap-5 p-5 sm:grid-cols-3 sm:p-6">
          <div className="min-w-0">
            <dt className="text-xs text-ink-soft">
              Identifiant de l’organisation
            </dt>
            <dd className="mt-2">
              <CopyValue value={organization.slug} />
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Type de compte</dt>
            <dd className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-ink">
              <Building2 aria-hidden="true" className="h-4 w-4 text-ink-soft" />
              {organization.accountType === "reseller"
                ? "Revendeur"
                : "Opérateur"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Client depuis le</dt>
            <dd className="mt-2 text-sm font-medium text-ink">
              {organization.createdAtLabel}
            </dd>
          </div>
        </dl>
      </section>

      <section
        aria-labelledby="next-action-heading"
        className="flex flex-wrap items-center justify-between gap-5 rounded-2xl border border-line bg-clay/70 p-5 sm:p-6"
      >
        <div className="min-w-0 flex-1 basis-72">
          <p className="text-xs font-medium text-brand-deep">{next.eyebrow}</p>
          <h2
            id="next-action-heading"
            className="mt-1 text-lg font-semibold text-ink"
          >
            {next.title}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm leading-6 text-ink-soft">
            {next.detail}
          </p>
        </div>
        <Link
          href={next.href}
          className="btn btn-md btn-primary max-w-full whitespace-normal text-center"
        >
          {next.label}
          <ArrowRight aria-hidden="true" className="h-4 w-4 shrink-0" />
        </Link>
      </section>

      <section aria-labelledby="settings-heading">
        <div className="mb-4">
          <h2 id="settings-heading" className="text-lg font-semibold text-ink">
            Tous vos réglages
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Choisissez une rubrique. Chaque réglage reste accessible à tout
            moment.
          </p>
        </div>
        <div className="grid items-start gap-4 md:grid-cols-3">
          {sections.map((section, index) => (
            <article
              key={section.title}
              className="min-w-0 overflow-hidden rounded-2xl border border-line bg-paper"
            >
              <div className="border-b border-line-soft p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span
                    aria-hidden="true"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-clay text-xs font-semibold text-brand-deep"
                  >
                    {index + 1}
                  </span>
                  <section.icon
                    aria-hidden="true"
                    className="h-4 w-4 text-ink-soft"
                  />
                </div>
                <h3 className="text-base font-semibold tracking-tight text-ink">
                  {section.title}
                </h3>
                <p className="mt-1.5 text-xs leading-5 text-ink-soft">
                  {section.description}
                </p>
              </div>
              <ul className="divide-y divide-line-soft">
                {section.paths.map((href) => {
                  const entry = SETTINGS_SECTIONS.find(
                    (item) => item.href === href,
                  )!;
                  const status = statusFor(href, counts);
                  return (
                    <li key={href}>
                      <Link
                        href={href}
                        className="group flex items-start gap-2 p-5 transition-colors hover:bg-clay/60 focus-visible:outline-offset-[-3px]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold text-ink group-hover:text-brand-deep">
                            {entry.label}
                          </span>
                          <span className="mt-1.5 block text-xs leading-5 text-ink-soft">
                            {descriptions[href]}
                          </span>
                          {status && (
                            <span
                              className={`mt-3 inline-flex max-w-full items-center gap-1.5 rounded-md px-2 py-1 text-xs ${status.positive ? "bg-ok-soft text-ok" : "bg-clay text-ink-soft"}`}
                            >
                              {status.positive && (
                                <span
                                  aria-hidden="true"
                                  className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                                />
                              )}
                              {status.text}
                            </span>
                          )}
                        </span>
                        <ChevronRight
                          aria-hidden="true"
                          className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft transition-transform group-hover:translate-x-0.5"
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-5">
        <div className="flex items-start gap-3">
          <Settings2
            aria-hidden="true"
            className="mt-0.5 h-4 w-4 text-ink-soft"
          />
          <div>
            <h2 className="text-sm font-semibold text-ink">
              Gestion de l’organisation
            </h2>
            <p className="mt-1 text-xs text-ink-soft">
              Retrouvez les options de renommage et de suppression dans les
              paramètres avancés.
            </p>
          </div>
        </div>
        <Link
          href="/admin/settings/advanced"
          className="btn btn-sm btn-outline"
        >
          Paramètres avancés
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </Link>
      </section>
    </div>
  );
}
