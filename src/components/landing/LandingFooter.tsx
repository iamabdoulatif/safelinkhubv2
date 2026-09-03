import Link from "next/link";
import { ArrowRight, MapPin, Phone } from "lucide-react";
import Logo from "./Logo";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";
import {
  SITE_CITY,
  SITE_MAP_URL,
  SITE_PHONE,
  SITE_PHONE_DISPLAY,
  SITE_SOCIALS,
  SITE_STREET,
} from "@/lib/site/contact";

/* CHAQUE ENTRÉE MÈNE À UNE PAGE QUI EXISTE.
   Quatre liens pointaient dans le vide sur toutes les pages publiques —
   /careers, /support, /legal/terms et /legal/privacy renvoient 404 (vérifié en
   production). Un lien mort dans un pied de page ne casse rien visiblement :
   il coûte la confiance du visiteur qui le suit. Ils sont retirés jusqu'à ce
   que les pages soient écrites ; les libellés restent dans les dictionnaires,
   prêts à revenir. */
const footerColumns = (dict: Dictionary) =>
  [
    {
      title: dict.footer.columns.product,
      links: [
        { href: "/", label: dict.footer.links.home },
        /* Ces trois entrées visaient des ancres de la landing. Les sections
           sont parties sur /services et /vpn : laisser les ancres aurait donné
           des liens qui ne défilent nulle part — un lien mort silencieux, que
           rien n'aurait signalé. */
        { href: "/services", label: dict.footer.links.services },
        { href: "/vpn", label: dict.footer.links.vpn },
        { href: "/boutique", label: dict.footer.links.shop },
        { href: "/auth/register", label: dict.footer.links.getStarted },
      ],
    },
    {
      title: dict.footer.columns.company,
      links: [
        { href: "/contact", label: dict.footer.links.contact },
        { href: "/blog", label: dict.footer.links.blog },
      ],
    },
    {
      title: dict.footer.columns.resources,
      links: [
        { href: "/formations", label: dict.footer.links.training },
        { href: "#faq", label: dict.footer.links.faq },
      ],
    },
  ] as const;

export default function LandingFooter({
  anchorPrefix = "",
  dict,
  locale,
}: {
  anchorPrefix?: string;
  dict: Dictionary;
  locale: Locale;
}) {
  const columns = footerColumns(dict);
  const getHref = (href: string) =>
    href.startsWith("#") ? `${anchorPrefix}${href}` : localeHref(href, locale);
  const muted = "text-slate-deep-soft";
  /* 17 px de haut avec 10 px d'écart : une pile de liens invisables au pouce.
     44 px sur mobile, densité d'origine à partir de lg où l'on vise à la
     souris. */
  const linkClass =
    "-mx-2 flex min-h-11 items-center rounded-lg px-2 text-sm text-white/85 hover:bg-white/5 hover:text-brand lg:mx-0 lg:min-h-0 lg:rounded-none lg:px-0 lg:py-0.5 lg:hover:bg-transparent";

  return (
    <footer className="bg-slate-deep py-16 text-white">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        {/* Capture e-mail — elle mène à la création de compte, pas à une
            newsletter : aucune liste de diffusion n'existe côté produit, et
            promettre un abonnement qui n'arriverait jamais serait un mensonge. */}
        {/* Capture e-mail */}
          <div className="mb-14 grid grid-cols-1 gap-8 rounded-2xl border border-slate-deep-line bg-[#0E2618] p-8 lg:grid-cols-12 lg:items-center sm:p-10">
            <div className="lg:col-span-6">
              <h2 className="font-display text-2xl font-bold leading-snug text-white sm:text-3xl">
                {dict.footer.tagline}
              </h2>
              <p className="mt-2 text-sm text-slate-deep-soft">
                {dict.footer.subtitle}
              </p>
            </div>
            <form
              action={localeHref("/auth/register", locale)}
              method="get"
              className="flex w-full flex-col gap-2 sm:flex-row lg:col-span-6"
            >
              <label htmlFor="footer-email" className="sr-only">
                {dict.footer.emailLabel}
              </label>
              <input
                id="footer-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={dict.footer.emailPlaceholder}
                className="min-w-0 flex-1 rounded-full border border-slate-deep-line bg-slate-deep px-5 py-3 text-sm text-white placeholder:text-slate-deep-soft focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button type="submit" className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary px-6 py-3 text-sm">
                {dict.footer.submit}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </form>
          </div>

        {/* Grille asymétrique : marque large + colonnes serrées */}
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
          <div className="lg:col-span-5">
            <Logo dark />
            <p className={`mt-4 max-w-xs text-sm leading-6 ${muted}`}>
              {dict.footer.address}
            </p>

            {/* Adresse et téléphone RÉELS, et pas seulement sur /contact : un
                visiteur cherche « où sont-ils, comment je les appelle » en bas
                de page, pas dans un formulaire. Les deux sont actionnables —
                itinéraire d'un côté, appel d'un clic de l'autre — avec une
                hauteur de doigt. */}
            <address className="mt-5 space-y-1 text-sm not-italic">
              <a
                href={SITE_MAP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="-mx-2 flex min-h-11 items-start gap-3 rounded-lg px-2 py-2 text-white/85 hover:bg-white/5 hover:text-brand"
              >
                <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  {SITE_STREET}
                  <span className="block text-xs text-slate-deep-soft">{SITE_CITY}</span>
                </span>
              </a>
              <a
                href={`tel:${SITE_PHONE}`}
                className="-mx-2 flex min-h-11 items-center gap-3 rounded-lg px-2 py-2 text-white/85 hover:bg-white/5 hover:text-brand"
              >
                <Phone aria-hidden="true" className="h-4 w-4 shrink-0 text-brand" />
                <span className="font-mono tracking-tight">{SITE_PHONE_DISPLAY}</span>
              </a>
            </address>
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title} className="lg:col-span-2">
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${muted}`}>
                {col.title}
              </p>
              <ul className="mt-3 lg:mt-4 lg:space-y-2" role="list">
                {col.links.map((l) => (
                  <li key={l.label}>
                    {l.href.startsWith("/auth") ? (
                      <Link href={getHref(l.href)} className={linkClass}>
                        {l.label}
                      </Link>
                    ) : (
                      <a href={getHref(l.href)} className={linkClass}>
                        {l.label}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-4 border-t border-slate-deep-line pt-6 sm:flex-row sm:items-center">
          <p className={`text-xs ${muted}`}>
            {dict.footer.rights(new Date().getFullYear())}
          </p>
          {/* 12 px de texte sur 16 px de haut : impossible à viser au doigt.
              Chaque réseau devient une pastille de 44 px, YouTube compris. */}
          <nav aria-label={dict.footer.socials} className="-mx-2 flex flex-wrap items-center">
            {SITE_SOCIALS.map((reseau) => (
              <a
                key={reseau.label}
                href={reseau.href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 items-center rounded-lg px-3 text-xs font-medium text-slate-deep-soft hover:bg-white/5 hover:text-brand"
              >
                {reseau.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
