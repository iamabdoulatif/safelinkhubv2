import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SectionIntro from "./SectionIntro";
import { listPublishedPosts } from "@/lib/blog/queries";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref, HTML_LANG } from "@/lib/i18n/config";

/* Aperçu du blog — le bloc « Love to keep learning » de Slate : un article
 * large, deux articles secondaires.
 *
 * listPublishedPosts() n'a pas de garde base-absente (elle sert /blog, qui est
 * construite avec la base disponible). Ici la lecture est défensive : sur la
 * landing, un blog vide ou une base injoignable doit faire disparaître la
 * section, pas casser la page d'accueil. */
async function safePosts() {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await listPublishedPosts();
  } catch {
    return [];
  }
}



/** Repli quand un article n'a pas de couverture — plutôt qu'un aplat gris. */
const FALLBACK_COVER = "/landing/photos/antennes-toit.jpg";

/* Les couvertures d'articles sont des chemins locaux (/blog/xxx.svg) : elles
 * passent par next/image sans configuration d'hôte distant. Une URL absolue
 * saisie par le superadmin ne serait PAS optimisable sans l'ajouter à
 * images.remotePatterns — d'où le repli sur une balise simple dans ce cas. */
function Cover({ src, className }: { src: string | null; className: string }) {
  const url = src || FALLBACK_COVER;
  if (/^https?:\/\//.test(url)) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={className} loading="lazy" />;
  }
  return (
    <Image src={url} alt="" width={1400} height={900} sizes="(min-width: 1024px) 40rem, 100vw" className={className} />
  );
}

export default async function BlogTeaser({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.blogTeaser;
  /* Les titres et extraits d'articles viennent de la base et restent dans la
     langue de rédaction : seul l'habillage de la section est traduit. */
  const dateFmt = new Intl.DateTimeFormat(HTML_LANG[locale], {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const posts = (await safePosts()).slice(0, 3);
  if (posts.length === 0) return null;

  const [lead, ...rest] = posts;

  return (
    <section aria-label={t.aria} className="border-b border-line bg-clay py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro eyebrow={t.eyebrow} title={t.title} marker={t.marker} />

        <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <article className="slate-card overflow-hidden bg-paper lg:col-span-7">
            <Cover src={lead.coverImageUrl} className="h-52 w-full object-cover sm:h-64" />
            <div className="p-6 sm:p-7">
              {lead.category ? (
                <span className="slate-eyebrow">{lead.category}</span>
              ) : null}
              <h3 className="mt-4 font-display text-xl font-bold leading-snug text-ink sm:text-2xl">
                <Link href={localeHref(`/blog/${lead.slug}`, locale)} className="hover:underline">
                  {lead.title}
                </Link>
              </h3>
              {lead.excerpt ? (
                <p className="mt-2 text-sm leading-6 text-ink-soft">{lead.excerpt}</p>
              ) : null}
              <p className="mt-4 font-mono text-xs text-ink-soft">
                {dateFmt.format(lead.publishedAt ?? lead.createdAt)}
              </p>
            </div>
          </article>

          <div className="grid grid-cols-1 gap-5 lg:col-span-5">
            {rest.map((p) => (
              <article key={p.id} className="slate-card flex gap-4 overflow-hidden bg-paper p-4">
                <Cover src={p.coverImageUrl} className="h-24 w-24 shrink-0 rounded-xl object-cover" />
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold leading-snug text-ink">
                    <Link href={localeHref(`/blog/${p.slug}`, locale)} className="hover:underline">
                      {p.title}
                    </Link>
                  </h3>
                  <p className="mt-1.5 font-mono text-xs text-ink-soft">
                    {dateFmt.format(p.publishedAt ?? p.createdAt)}
                  </p>
                </div>
              </article>
            ))}
            <Link
              href={localeHref("/blog", locale)}
              className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-ghost w-full px-5 py-3 text-sm"
            >
              {t.all}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
