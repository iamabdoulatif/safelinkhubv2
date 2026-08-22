import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { blogPosts, courseLessons, courses } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import CourseForm from "../CourseForm";
import LessonsEditor from "../LessonsEditor";

export default async function EditCoursePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return <p className="text-sm text-ink-soft">Accès réservé au superadmin.</p>;
  }

  const { id } = await params;
  const db = getDb();
  const [course] = await db.select().from(courses).where(eq(courses.id, id)).limit(1);
  if (!course) notFound();

  const [lessons, articles] = await Promise.all([
    db
      .select({
        id: courseLessons.id,
        position: courseLessons.position,
        postId: courseLessons.postId,
        title: blogPosts.title,
        slug: blogPosts.slug,
      })
      .from(courseLessons)
      .innerJoin(blogPosts, eq(blogPosts.id, courseLessons.postId))
      .where(eq(courseLessons.courseId, id))
      .orderBy(asc(courseLessons.position)),
    // Seuls les articles PUBLIÉS : rattacher un brouillon donnerait une leçon
    // qui disparaît du parcours public sans explication.
    db
      .select({ id: blogPosts.id, title: blogPosts.title, category: blogPosts.category })
      .from(blogPosts)
      .where(eq(blogPosts.published, true))
      .orderBy(asc(blogPosts.title)),
  ]);

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/admin/formations" className="text-sm text-brand-deep hover:underline">
        ← Formations
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-ink">{course.title}</h1>
        {course.published && (
          <Link
            href={`/formations/${course.slug}`}
            target="_blank"
            className="text-sm font-semibold text-brand-deep hover:underline"
          >
            Voir la page publique ↗
          </Link>
        )}
      </div>

      <CourseForm
        course={{
          id: course.id,
          slug: course.slug,
          title: course.title,
          summary: course.summary,
          level: course.level,
          coverImageUrl: course.coverImageUrl,
          published: course.published,
          position: course.position,
        }}
      />

      <LessonsEditor courseId={course.id} lessons={lessons} articles={articles} />
    </div>
  );
}
