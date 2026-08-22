import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localeHref, localePrefix, type Locale } from "@/lib/i18n/config";
import { searchSite } from "@/lib/search/queries";

export const metadata: Metadata = {
  title: "Recherche | SafeLinkHub",
  description: "Chercher une page, un guide ou une formation sur SafeLinkHub.",
};

export async function SearchPageContent({
  locale,
  searchParams,
}: {
  locale: Locale;
  searchParams: Promise<{ q?: string }>;
}) {
  const [{ q }, dict] = await Promise.all([searchParams, getDictionary(locale)]);
  const requete = (q ?? "").trim();
  const t = dict.searchPage;
  const resultats = requete ? await searchSite(requete, locale, dict) : [];

  return (
    <div lang={locale} className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        <section className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <span className="slate-eyebrow">{t.eyebrow}</span>
          <h1 className="mt-5 font-display text-4xl font-bold tracking-tight text-ink">
            {t.heading}
          </h1>

          {/* Formulaire GET : la recherche vit dans l'URL, donc elle se
              partage, se met en favori et revient avec le bouton Précédent. */}
          <form action={localeHref("/recherche", locale)} method="get" className="mt-8 flex gap-2">
            <label htmlFor="q" className="sr-only">
              {t.heading}
            </label>
            <input
              id="q"
              name="q"
              type="search"
              defaultValue={requete}
              placeholder={t.placeholder}
              autoComplete="off"
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-5 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary px-6 py-3 text-sm"
            >
              <Search aria-hidden="true" className="h-4 w-4" />
              {t.submit}
            </button>
          </form>

          {!requete ? (
            <p className="mt-8 text-sm text-ink-soft">{t.prompt}</p>
          ) : resultats.length === 0 ? (
            <div className="mt-8">
              <p className="text-sm font-medium text-ink">{t.empty(requete)}</p>
              <p className="mt-1 text-sm text-ink-soft">{t.hint}</p>
            </div>
          ) : (
            <>
              <p className="mt-8 text-sm text-ink-soft" aria-live="polite">
                {t.resultsFor(resultats.length, requete)}
              </p>
              <ul role="list" className="mt-4 divide-y divide-line border-y border-line">
                {resultats.map((r) => (
                  <li key={`${r.kind}-${r.href}`} className="py-4">
                    <span className="slate-eyebrow">{t.kinds[r.kind]}</span>
                    <h2 className="mt-2 font-display text-lg font-bold leading-snug text-ink">
                      <Link href={r.href} className="hover:underline">
                        {r.title}
                      </Link>
                    </h2>
                    {r.excerpt && (
                      <p className="mt-1 text-sm leading-6 text-ink-soft">{r.excerpt}</p>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
      <LandingFooter dict={dict} locale={locale} />
    </div>
  );
}

export default function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  return <SearchPageContent locale="fr" searchParams={searchParams} />;
}
