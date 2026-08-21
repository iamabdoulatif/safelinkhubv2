import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import BlogAd from "@/components/analytics/BlogAd";
import { getPublishedPost } from "@/lib/blog/queries";
import { getMarketingSettings } from "@/lib/marketing/queries";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localePrefix, type Locale } from "@/lib/i18n/config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) return { title: "Article introuvable | SafeLinkHub" };
  return {
    title: `${post.title} | Blog SafeLinkHub`,
    description: post.excerpt ?? undefined,
  };
}

function formatDate(date: Date, locale: Locale) {
  return new Intl.DateTimeFormat(locale, {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Rendu volontairement minimal du contenu (pas de dépendance markdown) :
 * blocs séparés par une ligne vide, "## " en début de bloc = sous-titre. */
function ContentBlocks({ content }: { content: string }) {
  return (
    <>
      {content.split(/\n{2,}/).map((block, i) =>
        block.startsWith("## ") ? (
          <h2 key={i} className="mt-8 font-display text-2xl font-bold text-ink">
            {block.slice(3)}
          </h2>
        ) : (
          <p key={i} className="mt-4 whitespace-pre-line leading-relaxed text-ink">
            {block}
          </p>
        ),
      )}
    </>
  );
}

export async function BlogPostPageContent({
  locale,
  params,
}: {
  locale: Locale;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const [marketing, dict] = await Promise.all([getMarketingSettings(), getDictionary(locale)]);
  const showAd = Boolean(
    marketing.adsenseEnabled && marketing.adsenseClientId && marketing.adsenseSlotId,
  );

  return (
    <div className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        {/* Hero article (bande anthracite) */}
        <div className="border-b border-line bg-slate-deep">
          <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
            <Link
              href={`${locale === "en" ? "/en" : ""}/blog`}
              className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-brand hover:text-white"
            >
              ← {dict.blog.allArticles}
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-slate-deep-soft">
              <time>{formatDate(post.publishedAt ?? post.createdAt, locale)}</time>
              {post.category && (
                <>
                  <span aria-hidden>·</span>
                  <Link
                    href={`${locale === "en" ? "/en" : ""}/blog?sujet=${encodeURIComponent(post.category)}`}
                    className="rounded bg-brand px-2 py-0.5 font-semibold uppercase tracking-wide text-slate-deep"
                  >
                    {post.category}
                  </Link>
                </>
              )}
            </div>
            <h1 className="mt-3 font-display text-4xl font-bold leading-[1.05] tracking-tight text-white sm:text-5xl">
              {post.title}
            </h1>
            {post.excerpt && (
              <p className="mt-5 border-l-2 border-brand pl-4 text-lg text-slate-deep-soft">
                {post.excerpt}
              </p>
            )}
          </div>
        </div>

        <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          {post.coverImageUrl && (
            <div className="slate-card mb-8 overflow-hidden">
              <Image
                src={post.coverImageUrl}
                alt=""
                width={800}
                height={450}
                unoptimized
                priority
                className="w-full"
              />
            </div>
          )}
          <div>
            <ContentBlocks content={post.content} />
          </div>
          {showAd && (
            <div className="mt-10 border-t-2 border-line pt-6">
              <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-ink-soft">
                {dict.blog.advertising}
              </p>
              <BlogAd client={marketing.adsenseClientId!} slot={marketing.adsenseSlotId!} />
            </div>
          )}
        </article>
      </main>
      <LandingFooter anchorPrefix={localePrefix(locale) || "/"} dict={dict} locale={locale} />
    </div>
  );
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return <BlogPostPageContent locale="fr" params={params} />;
}
