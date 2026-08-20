import Link from "next/link";
import { ArrowRight } from "lucide-react";
import SectionIntro from "./SectionIntro";
import { listPublishedPosts } from "@/lib/blog/queries";

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

const dateFr = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });

export default async function BlogTeaser() {
  const posts = (await safePosts()).slice(0, 3);
  if (posts.length === 0) return null;

  const [lead, ...rest] = posts;

  return (
    <section aria-label="Derniers articles" className="border-b border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro
          eyebrow="Le blog"
          title="Ce que nos opérateurs apprennent sur le terrain."
          marker="sur le terrain"
        />

        <div className="mt-12 grid grid-cols-1 gap-5 lg:grid-cols-12">
          <article className="slate-card overflow-hidden bg-paper lg:col-span-7">
            <div aria-hidden="true" className="h-52 bg-clay sm:h-64" />
            <div className="p-6 sm:p-7">
              {lead.category ? (
                <span className="slate-eyebrow">{lead.category}</span>
              ) : null}
              <h3 className="mt-4 font-display text-xl font-bold leading-snug text-ink sm:text-2xl">
                <Link href={`/blog/${lead.slug}`} className="hover:underline">
                  {lead.title}
                </Link>
              </h3>
              {lead.excerpt ? (
                <p className="mt-2 text-sm leading-6 text-ink-soft">{lead.excerpt}</p>
              ) : null}
              <p className="mt-4 font-mono text-xs text-ink-soft">
                {dateFr.format(lead.publishedAt ?? lead.createdAt)}
              </p>
            </div>
          </article>

          <div className="grid grid-cols-1 gap-5 lg:col-span-5">
            {rest.map((p) => (
              <article key={p.id} className="slate-card flex gap-4 overflow-hidden bg-paper p-4">
                <div aria-hidden="true" className="h-24 w-24 shrink-0 rounded-xl bg-clay" />
                <div className="min-w-0">
                  <h3 className="font-display text-base font-bold leading-snug text-ink">
                    <Link href={`/blog/${p.slug}`} className="hover:underline">
                      {p.title}
                    </Link>
                  </h3>
                  <p className="mt-1.5 font-mono text-xs text-ink-soft">
                    {dateFr.format(p.publishedAt ?? p.createdAt)}
                  </p>
                </div>
              </article>
            ))}
            <Link
              href="/blog"
              className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-ghost w-full px-5 py-3 text-sm"
            >
              Tous les articles
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
