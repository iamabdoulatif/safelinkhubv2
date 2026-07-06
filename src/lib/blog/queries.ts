// Lectures du blog, volontairement hors d'un fichier "use server" : seules
// les mutations (actions.ts) doivent devenir des endpoints POST.
import { eq, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";

export async function listPublishedPosts() {
  const db = getDb();
  return db
    .select({
      id: blogPosts.id,
      slug: blogPosts.slug,
      title: blogPosts.title,
      excerpt: blogPosts.excerpt,
      category: blogPosts.category,
      coverImageUrl: blogPosts.coverImageUrl,
      publishedAt: blogPosts.publishedAt,
      createdAt: blogPosts.createdAt,
    })
    .from(blogPosts)
    .where(eq(blogPosts.published, true))
    .orderBy(desc(blogPosts.publishedAt));
}

/** Catégories distinctes présentes parmi les articles publiés, triées. */
export async function listPublishedCategories(): Promise<string[]> {
  const db = getDb();
  const rows = await db
    .select({ category: blogPosts.category })
    .from(blogPosts)
    .where(eq(blogPosts.published, true));
  return uniqueSorted(rows.map((r) => r.category));
}

/** Toutes les catégories existantes (brouillons inclus) — pour l'autocomplétion
 * du formulaire d'admin. */
export async function listAllCategories(): Promise<string[]> {
  const db = getDb();
  const rows = await db.select({ category: blogPosts.category }).from(blogPosts);
  return uniqueSorted(rows.map((r) => r.category));
}

function uniqueSorted(values: (string | null)[]): string[] {
  const set = new Set<string>();
  for (const v of values) if (v) set.add(v);
  return Array.from(set).sort((a, b) => a.localeCompare(b, "fr"));
}

export async function getPublishedPost(slug: string) {
  const db = getDb();
  const [post] = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.slug, slug))
    .limit(1);
  if (!post || !post.published) return null;
  return post;
}

export async function listAllPosts() {
  const db = getDb();
  return db.select().from(blogPosts).orderBy(desc(blogPosts.createdAt));
}

export async function getPostById(id: string) {
  // Une valeur non-UUID ferait échouer le cast Postgres (erreur 500) — on
  // veut un 404 propre pour /admin/blog/nimporte-quoi.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return null;
  }
  const db = getDb();
  const [post] = await db
    .select()
    .from(blogPosts)
    .where(eq(blogPosts.id, id))
    .limit(1);
  return post ?? null;
}
