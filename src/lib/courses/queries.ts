import "server-only";
import { asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { courseLessons, courses } from "@/lib/db/schema";

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
      })
      .from(courses)
      .where(eq(courses.published, true))
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
    const lessons = await db
      .select()
      .from(courseLessons)
      .where(eq(courseLessons.courseId, course.id))
      .orderBy(asc(courseLessons.position));
    return { course, lessons };
  } catch {
    return null;
  }
}
