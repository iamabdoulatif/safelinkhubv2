import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, GraduationCap, Newspaper } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import Reveal from "@/components/motion/Reveal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localeHref, localePrefix, HTML_LANG, type Locale } from "@/lib/i18n/config";
import { listPublishedCourses } from "@/lib/courses/queries";
import { listPublishedPosts } from "@/lib/blog/queries";

/* Page « Formations ».
 *
 * Elle porte DEUX contenus de nature différente : les parcours, suivis dans
 * l'ordre, et les articles du blog, indépendants. Les articles y figurent
 * parce que « Blog » a quitté le header : sans porte ici, six articles publiés
 * seraient devenus orphelins, atteignables par URL directe seulement. */
export const metadata: Metadata = {
  title: "Formations | SafeLinkHub",
  description:
    "Parcours et guides pour installer, sécuriser et monétiser un hotspot Wi-Fi MikroTik.",
};

/** Le blog sert /blog, construit avec la base disponible ; ici la lecture doit
 *  être défensive : une entrée de menu ne tombe pas parce que la base tousse. */
async function safePosts() {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await listPublishedPosts();
  } catch {
    return [];
  }
}

export async function TrainingPageContent({ locale }: { locale: Locale }) {
  const [dict, cours, articles] = await Promise.all([
    getDictionary(locale),
    listPublishedCourses(),
    safePosts(),
  ]);
  const t = dict.trainingPage;
  const dateFmt = new Intl.DateTimeFormat(HTML_LANG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div lang={locale} className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        <section className="mx-auto max-w-6xl px-4 pt-14 sm:px-6">
          <span className="slate-eyebrow">{t.eyebrow}</span>
          <h1 className="mt-5 max-w-3xl font-display text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
            {t.heading}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-ink-soft">{t.lead}</p>
        </section>

        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
          <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-ink">
            <GraduationCap className="h-5 w-5 text-brand-deep" />
            {t.coursesTitle}
          </h2>

          {cours.length === 0 ? (
            <p className="mt-4 border border-dashed border-line bg-clay/40 p-6 text-sm text-ink-soft">
              {t.coursesEmpty}
            </p>
          ) : (
            <div className="stagger mt-6 grid grid-cols-1 gap-5 md:grid-cols-3">
              {cours.map((c) => (
                <article key={c.id} className="reveal slate-card overflow-hidden bg-paper">
                  {c.coverImageUrl && !/^https?:\/\//.test(c.coverImageUrl) ? (
                    <Image
                      src={c.coverImageUrl}
                      alt=""
                      width={800}
                      height={500}
                      sizes="(min-width: 768px) 20rem, 100vw"
                      className="h-40 w-full object-cover"
                    />
                  ) : null}
                  <div className="p-6">
                    {c.level && <span className="slate-eyebrow">{c.level}</span>}
                    <h3 className="mt-3 font-display text-lg font-bold leading-snug text-ink">
                      <Link
                        href={localeHref(`/formations/${c.slug}`, locale)}
                        className="hover:underline"
                      >
                        {c.title}
                      </Link>
                    </h3>
                    {c.summary && (
                      <p className="mt-2 text-sm leading-6 text-ink-soft">{c.summary}</p>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="border-t border-line bg-clay py-12">
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 font-display text-2xl font-bold text-ink">
                  <Newspaper className="h-5 w-5 text-brand-deep" />
                  {t.articlesTitle}
                </h2>
                <p className="mt-1 text-sm text-ink-soft">{t.articlesLead}</p>
              </div>
              <Link
                href={localeHref("/blog", locale)}
                className="inline-flex items-center gap-2 slate-btn slate-btn-ghost px-5 py-2.5 text-sm"
              >
                {t.allArticles}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>

            <ul role="list" className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
              {articles.slice(0, 6).map((p) => (
                <li key={p.id} className="slate-card bg-paper p-5">
                  {p.category && <span className="slate-eyebrow">{p.category}</span>}
                  <h3 className="mt-3 font-display text-base font-bold leading-snug text-ink">
                    <Link
                      href={localeHref(`/blog/${p.slug}`, locale)}
                      className="hover:underline"
                    >
                      {p.title}
                    </Link>
                  </h3>
                  <p className="mt-1.5 font-mono text-xs text-ink-soft">
                    {dateFmt.format(p.publishedAt ?? p.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>
      <LandingFooter dict={dict} locale={locale} />
      <Reveal />
    </div>
  );
}

export default function TrainingPage() {
  return <TrainingPageContent locale="fr" />;
}
