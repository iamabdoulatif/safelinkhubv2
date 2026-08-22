import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  GraduationCap,
  MonitorSmartphone,
  CircuitBoard,
  Newspaper,
  RefreshCw,
  Tag,
  Terminal,
  Unlock,
  Wrench,
} from "lucide-react";

/* Appariées par INDEX aux arguments du dictionnaire : un composant React ne se
   sérialise pas dans un fichier de traduction. */
const BENEFIT_ICONS = [Wrench, Terminal, MonitorSmartphone, Unlock] as const;
const ABOUT_ICONS = [CircuitBoard, RefreshCw] as const;
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import Reveal from "@/components/motion/Reveal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localeHref, localePrefix, HTML_LANG, type Locale } from "@/lib/i18n/config";
import { listPublishedCourses } from "@/lib/courses/queries";

/* Illustration de repli, comme pour les articles sans couverture : une carte
   sans image casse la grille et fait paraître le parcours inachevé. Les trois
   photos du dossier tournent selon le rang, pour que deux cartes voisines ne
   portent pas la même image. */
const ILLUSTRATIONS = [
  "/photos/illustration-ports.jpg",
  "/photos/illustration-cables.jpg",
  "/photos/illustration-baie.jpg",
] as const;
import { listPublishedPosts } from "@/lib/blog/queries";
import Testimonials from "@/components/landing/Testimonials";

/* Page « Formations ».
 *
 * Elle porte DEUX contenus de nature différente : les parcours, suivis dans
 * l'ordre, et les articles du blog, indépendants. Les articles y figurent
 * parce que « Blog » a quitté le header : sans porte ici, six articles publiés
 * seraient devenus orphelins, atteignables par URL directe seulement. */
/* ISR plutôt que statique : cette page liste des ARTICLES et des PARCOURS,
 * qui changent sans redéploiement. Figée au build, elle servait encore les
 * anciennes couvertures alors que la base avait été mise à jour — et la
 * construction de la CI lit une base distincte de celle de production, ce qui
 * gèle aussi les compteurs par thème sur un état qui n'est pas le vôtre.
 * Cinq minutes : assez pour que publier un article se voie, assez peu pour ne
 * pas rendre la page dynamique à chaque visite. */
export const revalidate = 300;

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

/* Une couverture distante ne passe pas par next/image sans être déclarée dans
   images.remotePatterns : on retombe sur une balise simple plutôt que de faire
   échouer le rendu d'une page publique. */
function Illustration({
  src,
  rang,
  titre,
  className = "h-44 w-full object-cover",
}: {
  src: string | null;
  rang: number;
  titre: string;
  className?: string;
}) {
  const url = src || ILLUSTRATIONS[rang % ILLUSTRATIONS.length];
  const classe = className;
  if (/^https?:\/\//.test(url)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={classe} loading="lazy" />;
  }
  return (
    <Image
      src={url}
      alt=""
      width={800}
      height={500}
      sizes="(min-width: 768px) 22rem, 100vw"
      className={classe}
      title={titre}
    />
  );
}

export async function TrainingPageContent({ locale }: { locale: Locale }) {
  const [dict, cours, articles] = await Promise.all([
    getDictionary(locale),
    listPublishedCourses(),
    safePosts(),
  ]);
  const t = dict.trainingPage;
  /* Comptés depuis les articles déjà chargés : une requête de plus pour la
     même information serait du travail en double. */
  const themes = [...articles.reduce((acc, a) => {
    if (a.category) acc.set(a.category, (acc.get(a.category) ?? 0) + 1);
    return acc;
  }, new Map<string, number>())]
    .map(([nom, total]) => ({ nom, total }))
    .sort((a, b) => b.total - a.total || a.nom.localeCompare(b.nom));
  const dateFmt = new Intl.DateTimeFormat(HTML_LANG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div lang={locale} className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        <section className="border-b border-line bg-clay">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <span className="slate-eyebrow">{t.eyebrow}</span>
              <h1 className="mt-5 font-display text-4xl font-bold leading-tight tracking-tight text-ink sm:text-5xl">
                {t.heading}
              </h1>
              <p className="mt-4 max-w-xl text-base leading-7 text-ink-soft">{t.lead}</p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="#guides"
                  className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary px-6 py-3 text-sm"
                >
                  {t.heroCta}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </a>
                <Link
                  href={localeHref("/services", locale)}
                  className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-ghost px-6 py-3 text-sm"
                >
                  {t.heroSecondary}
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5">
              {/* Photo décorative : alt vide, elle n'apporte rien qu'un lecteur
                  d'écran doive entendre. */}
              <Image
                src="/photos/formations-hero.jpg"
                alt=""
                width={1200}
                height={900}
                sizes="(min-width: 1024px) 26rem, 100vw"
                className="slate-card h-64 w-full object-cover lg:h-80"
                priority
              />
            </div>
          </div>
        </section>

        {/* Bandeau d'arguments — aplat vert profond, pas de dégradé : la
            charte l'interdit, et un aplat tient mieux le contraste. */}
        <section className="bg-slate-deep py-12">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-4 sm:px-6 sm:grid-cols-2 lg:grid-cols-4">
            {t.benefits.map((b, i) => {
              const Icone = BENEFIT_ICONS[i];
              return (
                <article key={b.title} className="tile-hover tile-hover-dark rounded-xl border-l border-slate-deep-line py-2 pl-5 pr-4">
                  <Icone aria-hidden="true" className="tile-hover-icon h-6 w-6 text-brand" />
                  <h2 className="mt-4 font-display text-lg font-bold text-white">{b.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-deep-soft">{b.text}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* Thèmes — comptés sur les articles réellement publiés, jamais saisis
            à la main : un compteur figé mentirait dès la publication suivante. */}
        {themes.length > 0 && (
          <section className="border-b border-line bg-paper py-12">
            <div className="mx-auto max-w-6xl px-4 sm:px-6">
              <h2 className="font-display text-2xl font-bold text-ink">{t.categoriesTitle}</h2>
              <p className="mt-1 text-sm text-ink-soft">{t.categoriesLead}</p>
              <ul role="list" className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {themes.map(({ nom, total }) => (
                  <li key={nom}>
                    <Link
                      href={localeHref(`/blog?sujet=${encodeURIComponent(nom)}`, locale)}
                      className="slate-card flex items-center gap-4 bg-paper p-5 transition-colors hover:bg-clay"
                    >
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-clay text-brand-deep">
                        <Tag aria-hidden="true" className="h-5 w-5" />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate font-semibold text-ink">{nom}</span>
                        <span className="mt-0.5 block text-xs text-ink-soft">
                          {t.categoryCount(total)}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

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
              {cours.map((c, i) => (
                <article key={c.id} className="reveal slate-card flex flex-col overflow-hidden bg-paper">
                  <div className="relative">
                    <Illustration src={c.coverImageUrl} rang={i} titre={c.title} />
                    {c.level && (
                      <span className="absolute left-3 top-3 rounded-full bg-brand px-3 py-1 text-[11px] font-bold text-slate-deep">
                        {c.level}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col p-6">
                    <h3 className="font-display text-lg font-bold leading-snug text-ink">
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
                    <p className="mt-4 flex items-center gap-1.5 border-t border-line pt-3 text-xs text-ink-soft">
                      <BookOpen aria-hidden="true" className="h-3.5 w-3.5" />
                      {t.lessonsCount(c.lessons)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section id="guides" className="border-t border-line bg-clay py-12">
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
              {articles.slice(0, 6).map((p, i) => (
                <li key={p.id} className="slate-card flex gap-4 overflow-hidden bg-paper p-4">
                  {/* Vos six articles ont tous leur illustration ; le repli ne
                      sert qu'aux prochains, publiés sans couverture. */}
                  <span className="shrink-0">
                    <Illustration
                      src={p.coverImageUrl}
                      rang={i}
                      titre={p.title}
                      className="h-24 w-24 rounded-xl object-cover"
                    />
                  </span>
                  <span className="min-w-0">
                    {p.category && <span className="slate-eyebrow">{p.category}</span>}
                    <h3 className="mt-2 font-display text-base font-bold leading-snug text-ink">
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
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </section>
        {/* « Qui écrit » — l'équivalent du bloc « À propos » du modèle. Sans
            lui, la page affirme des guides de terrain sans jamais dire d'où
            ils viennent. Aucun compteur inventé ici : le modèle affiche
            « 150k cours », un chiffre que rien chez vous ne soutiendrait. */}
        <section className="border-t border-line bg-clay py-14">
          <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Image
                src="/photos/formations-equipe.jpg"
                alt=""
                width={1400}
                height={933}
                sizes="(min-width: 1024px) 26rem, 100vw"
                className="slate-card h-64 w-full object-cover lg:h-80"
              />
            </div>
            <div className="lg:col-span-7">
              <span className="slate-eyebrow">{t.aboutEyebrow}</span>
              <h2 className="mt-4 font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
                {t.aboutTitle}
              </h2>
              <p className="mt-3 text-base leading-7 text-ink-soft">{t.aboutText}</p>

              <ul role="list" className="mt-6 space-y-4">
                {t.aboutPoints.map((point, i) => {
                  const Icone = ABOUT_ICONS[i];
                  return (
                    <li key={point.title} className="flex gap-3">
                      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-paper text-brand-deep">
                        <Icone aria-hidden="true" className="h-4 w-4" />
                      </span>
                      <span>
                        <span className="block font-semibold text-ink">{point.title}</span>
                        <span className="mt-0.5 block text-sm leading-6 text-ink-soft">
                          {point.text}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <Link
                href={localeHref("/services", locale)}
                className="mt-7 inline-flex items-center gap-2 slate-btn slate-btn-ghost px-6 py-3 text-sm"
              >
                {t.aboutCta}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        {/* Les avis viennent de la MÊME source que la landing — composant et
            données uniques. En écrire un second jeu ici aurait produit deux
            vitrines de témoignages à faire vivre en parallèle. */}
        <Testimonials dict={dict} locale={locale} />

        <section className="bg-paper px-4 py-14 sm:px-6">
          <div className="mx-auto max-w-6xl rounded-3xl bg-brand px-6 py-12 text-center sm:px-12">
            <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold leading-tight tracking-tight text-slate-deep">
              {t.ctaTitle}
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-sm text-[#2C4A34]">{t.ctaText}</p>
            <Link
              href={localeHref("/auth/register", locale)}
              className="mt-7 inline-flex items-center justify-center gap-2 slate-btn slate-btn-dark px-7 py-3.5 text-base"
            >
              {t.ctaButton}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
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
