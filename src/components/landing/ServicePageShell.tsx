import Link from "next/link";
import { ArrowRight } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import Reveal from "@/components/motion/Reveal";
import type { Dictionary } from "@/lib/i18n/fr";
import { localeHref, localePrefix, type Locale } from "@/lib/i18n/config";

/* Coquille commune aux pages de service : même en-tête, même pied, même
 * gabarit. Les trois pages ne diffèrent que par leur contenu — les écrire
 * séparément aurait garanti qu'elles divergent à la première retouche. */
export default function ServicePageShell({
  dict,
  locale,
  eyebrow,
  heading,
  lead,
  ctaLabel,
  ctaHref,
  children,
}: {
  dict: Dictionary;
  locale: Locale;
  eyebrow: string;
  heading: string;
  lead: string;
  ctaLabel: string;
  ctaHref: string;
  children: React.ReactNode;
}) {
  return (
    <div lang={locale} className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        <section className="mx-auto max-w-4xl px-4 py-14 sm:px-6">
          <span className="slate-eyebrow">{eyebrow}</span>
          <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
            {heading}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-soft">{lead}</p>

          {children}

          <Link
            href={localeHref(ctaHref, locale)}
            className="mt-10 inline-flex items-center gap-2 slate-btn slate-btn-primary px-7 py-3.5 text-base"
          >
            {ctaLabel}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <LandingFooter dict={dict} locale={locale} />
      <Reveal />
    </div>
  );
}
