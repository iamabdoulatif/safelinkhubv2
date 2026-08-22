import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { sql } from "drizzle-orm";
import { blogPosts, courseLessons, courses } from "@/lib/db/schema";

/* Lecture DÉFENSIVE, comme le teaser du blog sur la landing : la page
 * /formations est publique et servie par la navigation principale. Une base
 * injoignable ou des tables pas encore créées doivent donner une page vide,
 * jamais une erreur 500 sur une entrée du menu. */
export async function listPublishedCourses() {
  if (!process.env.DATABASE_URL) return [];
  try {
    return await getDb()
      .select({
        id: courses.id,
        slug: courses.slug,
        title: courses.title,
        summary: courses.summary,
        coverImageUrl: courses.coverImageUrl,
        level: courses.level,
        publishedAt: courses.publishedAt,
        lessons: sql<number>`count(${courseLessons.id})`.mapWith(Number),
      })
      .from(courses)
      .leftJoin(courseLessons, eq(courseLessons.courseId, courses.id))
      .where(eq(courses.published, true))
      .groupBy(courses.id)
      .orderBy(asc(courses.position), desc(courses.publishedAt));
  } catch {
    return [];
  }
}

export async function getPublishedCourse(slug: string) {
  if (!process.env.DATABASE_URL) return null;
  try {
    const db = getDb();
    const [course] = await db.select().from(courses).where(eq(courses.slug, slug)).limit(1);
    if (!course || !course.published) return null;
    /* Les leçons SONT des articles : on les lit par jointure. Un article
       dépublié entre-temps est écarté ici — il ne doit pas apparaître dans le
       parcours simplement parce qu'il y avait été rattaché un jour. */
    const lessons = await db
      .select({
        id: courseLessons.id,
        position: courseLessons.position,
        slug: blogPosts.slug,
        title: blogPosts.title,
        excerpt: blogPosts.excerpt,
        content: blogPosts.content,
        coverImageUrl: blogPosts.coverImageUrl,
      })
      .from(courseLessons)
      .innerJoin(blogPosts, eq(blogPosts.id, courseLessons.postId))
      .where(and(eq(courseLessons.courseId, course.id), eq(blogPosts.published, true)))
      .orderBy(asc(courseLessons.position));
    return { course, lessons };
  } catch {
    return null;
  }
}
