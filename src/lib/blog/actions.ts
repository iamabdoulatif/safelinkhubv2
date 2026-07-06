"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blogPosts } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";

// Toutes les mutations du blog sont réservées au superadmin — vérifié ici
// dans chaque action (et pas seulement dans les pages /admin/blog), car un
// Server Action exporté reste un endpoint POST appelable directement.
async function requireSuperAdminSession() {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) return null;
  return session;
}

function slugify(input: string) {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function revalidateBlog(slug?: string) {
  revalidatePath("/blog");
  if (slug) revalidatePath(`/blog/${slug}`);
  revalidatePath("/admin/blog");
}

export async function saveBlogPost(_prevState: unknown, formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return { error: "Accès réservé au superadmin." };

  const id = String(formData.get("id") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const excerpt = String(formData.get("excerpt") ?? "").trim();
  const content = String(formData.get("content") ?? "").trim();
  const published = formData.get("published") === "on";
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const coverImageUrl = String(formData.get("coverImageUrl") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();

  if (coverImageUrl && !/^(\/|https:\/\/)/.test(coverImageUrl)) {
    return { error: "L'image de couverture doit être un chemin (/blog/…) ou une URL https." };
  }

  if (!title || !content) {
    return { error: "Le titre et le contenu sont requis." };
  }

  const slug = slugify(rawSlug || title);
  if (!slug) {
    return { error: "Impossible de générer un slug à partir du titre." };
  }

  const db = getDb();

  const duplicate = await db
    .select({ id: blogPosts.id })
    .from(blogPosts)
    .where(
      id
        ? and(eq(blogPosts.slug, slug), ne(blogPosts.id, id))
        : eq(blogPosts.slug, slug),
    )
    .limit(1);
  if (duplicate.length > 0) {
    return { error: `Le slug « ${slug} » est déjà utilisé par un autre article.` };
  }

  if (id) {
    const [existing] = await db
      .select({ publishedAt: blogPosts.publishedAt, slug: blogPosts.slug })
      .from(blogPosts)
      .where(eq(blogPosts.id, id))
      .limit(1);
    if (!existing) return { error: "Article introuvable." };

    await db
      .update(blogPosts)
      .set({
        title,
        slug,
        excerpt: excerpt || null,
        category: category || null,
        content,
        coverImageUrl: coverImageUrl || null,
        published,
        publishedAt:
          published && !existing.publishedAt ? new Date() : existing.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(blogPosts.id, id));

    // L'ancien slug doit aussi être revalidé si l'article a été renommé.
    if (existing.slug !== slug) revalidatePath(`/blog/${existing.slug}`);
  } else {
    await db.insert(blogPosts).values({
      title,
      slug,
      excerpt: excerpt || null,
      category: category || null,
      content,
      coverImageUrl: coverImageUrl || null,
      published,
      publishedAt: published ? new Date() : null,
      createdBy: session.userId,
    });
  }

  revalidateBlog(slug);
  redirect("/admin/blog");
}

export async function toggleBlogPostPublished(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = getDb();
  const [post] = await db
    .select({
      published: blogPosts.published,
      publishedAt: blogPosts.publishedAt,
      slug: blogPosts.slug,
    })
    .from(blogPosts)
    .where(eq(blogPosts.id, id))
    .limit(1);
  if (!post) return;

  await db
    .update(blogPosts)
    .set({
      published: !post.published,
      publishedAt: !post.published && !post.publishedAt ? new Date() : post.publishedAt,
      updatedAt: new Date(),
    })
    .where(eq(blogPosts.id, id));

  revalidateBlog(post.slug);
}

export async function deleteBlogPost(formData: FormData) {
  const session = await requireSuperAdminSession();
  if (!session) return;

  const id = String(formData.get("id") ?? "");
  if (!id) return;

  const db = getDb();
  const [post] = await db
    .select({ slug: blogPosts.slug })
    .from(blogPosts)
    .where(eq(blogPosts.id, id))
    .limit(1);
  if (!post) return;

  await db.delete(blogPosts).where(eq(blogPosts.id, id));
  revalidateBlog(post.slug);
}
