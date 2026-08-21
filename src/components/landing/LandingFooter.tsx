import Link from "next/link";
import { ArrowRight } from "lucide-react";
import Logo from "./Logo";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";

const footerColumns = (dict: Dictionary) =>
  [
    {
      title: dict.footer.columns.product,
      links: [
        { href: "/", label: dict.footer.links.home },
        { href: "#features", label: dict.footer.links.features },
        { href: "#plateforme", label: dict.footer.links.platform },
        { href: "#tarifs", label: dict.footer.links.pricing },
        { href: "#faq", label: dict.footer.links.faq },
        { href: "/boutique", label: dict.footer.links.shop },
        { href: "/auth/register", label: dict.footer.links.getStarted },
      ],
    },
    {
      title: dict.footer.columns.company,
      links: [
        { href: "/contact", label: dict.footer.links.contact },
        { href: "/careers", label: dict.footer.links.careers },
      ],
    },
    {
      title: dict.footer.columns.resources,
      links: [
        { href: "/blog", label: dict.footer.links.blog },
        { href: "/legal/terms", label: dict.footer.links.terms },
        { href: "/legal/privacy", label: dict.footer.links.privacy },
        { href: "/support", label: dict.footer.links.support },
      ],
    },
  ] as const;

const socials = [
  { href: "https://x.com/safelinkhub", label: "Twitter / X" },
  { href: "https://linkedin.com/company/safelinkhub", label: "LinkedIn" },
  { href: "https://tiktok.com/@safelinkhub", label: "TikTok" },
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
  const linkClass = "text-sm text-white/85 hover:text-brand";

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
          </div>
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title} className="lg:col-span-2">
              <p className={`text-[11px] font-semibold uppercase tracking-wider ${muted}`}>
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5" role="list">
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
          <nav aria-label={dict.footer.socials} className="flex gap-5">
            {socials.map((s) => (
              <a
                key={s.label}
                href={s.href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-slate-deep-soft hover:text-brand"
              >
                {s.label}
              </a>
            ))}
          </nav>
        </div>
      </div>
    </footer>
  );
}
