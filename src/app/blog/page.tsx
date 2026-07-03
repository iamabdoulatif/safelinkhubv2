import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import { listPublishedPosts } from "@/lib/blog/queries";

export const metadata: Metadata = {
  title: "Blog | SafeLinkHub",
  description:
    "Actualités, guides et conseils SafeLinkHub pour gérer et monétiser vos hotspots Wi-Fi MikroTik.",
};

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default async function BlogPage() {
  const posts = await listPublishedPosts();

  return (
    <div className="flex flex-1 flex-col">
      <LandingNav anchorPrefix="/" />
      <main className="flex-1 bg-paper">
        <section className="mx-auto max-w-5xl px-4 py-14 sm:px-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-brand-deep">
            Ressources
          </p>
          <h1 className="mt-2 font-display text-4xl font-bold text-ink">Blog</h1>
          <p className="mt-3 max-w-xl text-ink-soft">
            Actualités du produit, guides MikroTik et conseils pour monétiser
            votre réseau Wi-Fi.
          </p>

          {posts.length === 0 ? (
            <div className="mt-10 border-2 border-line bg-clay p-8 text-center">
              <p className="font-semibold text-ink">Aucun article pour le moment.</p>
              <p className="mt-1 text-sm text-ink-soft">
                Revenez bientôt — les premiers articles arrivent.
              </p>
            </div>
          ) : (
            <ul className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2" role="list">
              {posts.map((post) => (
                <li key={post.id}>
                  <Link
                    href={`/blog/${post.slug}`}
                    className="group flex h-full flex-col border-2 border-line bg-paper transition-colors hover:bg-clay"
                  >
                    {post.coverImageUrl && (
                      <div className="border-b-2 border-line">
                        <Image
                          src={post.coverImageUrl}
                          alt=""
                          width={800}
                          height={450}
                          unoptimized
                          className="w-full"
                        />
                      </div>
                    )}
                    <div className="flex flex-1 flex-col p-6">
                      <p className="font-mono text-xs text-ink-soft">
                        {formatDate(post.publishedAt ?? post.createdAt)}
                      </p>
                      <h2 className="mt-2 font-display text-xl font-bold leading-snug text-ink group-hover:underline">
                        {post.title}
                      </h2>
                      {post.excerpt && (
                        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                          {post.excerpt}
                        </p>
                      )}
                      <span className="mt-auto pt-4 text-sm font-bold text-brand-deep">
                        Lire l&apos;article →
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
      <LandingFooter anchorPrefix="/" />
    </div>
  );
}
