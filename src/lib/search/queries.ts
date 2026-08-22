import "server-only";
import { and, eq, ilike, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blogPosts, courses } from "@/lib/db/schema";
import type { Dictionary } from "@/lib/i18n/fr";
import { localeHref, type Locale } from "@/lib/i18n/config";

export type SearchHit = {
  kind: "page" | "article" | "course";
  title: string;
  excerpt: string | null;
  href: string;
};

/* Pages publiques indexées à la main.
 *
 * Elles ne vivent dans aucune table : les énumérer ici est plus honnête qu'un
 * balayage du système de fichiers, qui indexerait aussi les routes techniques
 * et les pages d'authentification. Le prix est de tenir cette liste à jour —
 * d'où le test qui la confronte aux routes réellement présentes. */
const PAGES: { path: string; key: keyof Dictionary["nav"] }[] = [
  { path: "/services", key: "services" },
  { path: "/vpn", key: "vpn" },
  { path: "/formations", key: "training" },
  { path: "/boutique", key: "shop" },
  { path: "/contact", key: "contact" },
];

/**
 * Recherche plein texte simple, en SQL.
 *
 * Le volume est petit — quelques articles, quelques formations : un `ILIKE`
 * suffit et évite d'installer un moteur d'indexation qu'il faudrait ensuite
 * maintenir, synchroniser et surveiller. À réévaluer le jour où le contenu se
 * compte en milliers d'entrées, pas avant.
 */
export async function searchSite(
  requete: string,
  locale: Locale,
  dict: Dictionary,
): Promise<SearchHit[]> {
  const q = requete.trim();
  if (q.length < 2) return [];
  const motif = `%${q.replace(/[%_]/g, (c) => `\\${c}`)}%`;
  const minuscule = q.toLowerCase();

  const pages: SearchHit[] = PAGES.filter(({ key }) =>
    String(dict.nav[key]).toLowerCase().includes(minuscule),
  ).map(({ path, key }) => ({
    kind: "page" as const,
    title: String(dict.nav[key]),
    excerpt: null,
    href: localeHref(path, locale),
  }));

  if (!process.env.DATABASE_URL) return pages;

  try {
    const db = getDb();
    const [articles, parcours] = await Promise.all([
      db
        .select({
          slug: blogPosts.slug,
          title: blogPosts.title,
          excerpt: blogPosts.excerpt,
        })
        .from(blogPosts)
        .where(
          and(
            eq(blogPosts.published, true),
            or(
              ilike(blogPosts.title, motif),
              ilike(blogPosts.excerpt, motif),
              ilike(blogPosts.content, motif),
            ),
          ),
        )
        .limit(20),
      db
        .select({ slug: courses.slug, title: courses.title, summary: courses.summary })
        .from(courses)
        .where(
          and(
            eq(courses.published, true),
            or(ilike(courses.title, motif), ilike(courses.summary, motif)),
          ),
        )
        .limit(20)
        // La table peut ne pas exister encore en base : une recherche ne doit
        // pas tomber pour autant, elle rend simplement moins de résultats.
        .catch(() => []),
    ]);

    return [
      ...pages,
      ...parcours.map((c) => ({
        kind: "course" as const,
        title: c.title,
        excerpt: c.summary,
        href: localeHref(`/formations/${c.slug}`, locale),
      })),
      ...articles.map((a) => ({
        kind: "article" as const,
        title: a.title,
        excerpt: a.excerpt,
        href: localeHref(`/blog/${a.slug}`, locale),
      })),
    ];
  } catch {
    return pages;
  }
}
