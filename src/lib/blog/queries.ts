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
      coverImageUrl: blogPosts.coverImageUrl,
      publishedAt: blogPosts.publishedAt,
      createdAt: blogPosts.createdAt,
    })
    .from(blogPosts)
    .where(eq(blogPosts.published, true))
    .orderBy(desc(blogPosts.publishedAt));
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
