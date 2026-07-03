import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { getPublishedPost } from "@/lib/blog/queries";

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

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
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

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  return (
    <div className="flex flex-1 flex-col">
      <LandingNav anchorPrefix="/" />
      <main className="flex-1 bg-paper">
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <Link href="/blog" className="text-sm font-bold text-brand-deep hover:underline">
            ← Tous les articles
          </Link>
          <p className="mt-6 font-mono text-xs text-ink-soft">
            {formatDate(post.publishedAt ?? post.createdAt)}
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold leading-tight text-ink">
            {post.title}
          </h1>
          {post.coverImageUrl && (
            <div className="mt-6 border-2 border-line">
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
          {post.excerpt && (
            <p className="mt-4 border-l-4 border-brand pl-4 text-lg text-ink-soft">
              {post.excerpt}
            </p>
          )}
          <div className="mt-6">
            <ContentBlocks content={post.content} />
          </div>
        </article>
      </main>
      <LandingFooter anchorPrefix="/" />
    </div>
  );
}
