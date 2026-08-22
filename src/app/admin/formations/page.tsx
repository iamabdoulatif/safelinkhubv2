import Link from "next/link";
import { asc, desc, eq, sql } from "drizzle-orm";
import { GraduationCap, Plus } from "lucide-react";
import { getDb } from "@/lib/db";
import { courseLessons, courses } from "@/lib/db/schema";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import DeleteCourseButton from "./DeleteCourseButton";

export default async function AdminCoursesPage() {
  const session = await getSession();
  if (!session || !isSuperAdmin(session.role)) {
    return <p className="text-sm text-ink-soft">Accès réservé au superadmin.</p>;
  }

  const db = getDb();
  const liste = await db
    .select({
      id: courses.id,
      slug: courses.slug,
      title: courses.title,
      level: courses.level,
      published: courses.published,
      position: courses.position,
      lessons: sql<number>`count(${courseLessons.id})`.mapWith(Number),
    })
    .from(courses)
    .leftJoin(courseLessons, eq(courseLessons.courseId, courses.id))
    .groupBy(courses.id)
    .orderBy(asc(courses.position), desc(courses.createdAt));

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-ink">
          <GraduationCap className="h-5 w-5" />
          Formations
        </h1>
        <Link
          href="/admin/formations/new"
          className="inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-deep-line"
        >
          <Plus className="h-4 w-4" />
          Nouvelle formation
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Les parcours publiés apparaissent sur /formations, en français et en anglais.
      </p>

      {liste.length === 0 ? (
        <p className="mt-6 border border-dashed border-line bg-clay/40 p-6 text-sm text-ink-soft">
          Aucune formation pour le moment. La page publique affiche les articles du blog en
          attendant le premier parcours.
        </p>
      ) : (
        <ul role="list" className="mt-6 divide-y divide-line border-y border-line">
          {liste.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
              <div className="min-w-0">
                <Link
                  href={`/admin/formations/${c.id}`}
                  className="font-medium text-ink hover:underline"
                >
                  {c.title}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-ink-soft">
                  /{c.slug} · {c.lessons} leçon(s){c.level ? ` · ${c.level}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    c.published ? "bg-brand text-slate-deep" : "bg-clay text-ink-soft"
                  }`}
                >
                  {c.published ? "Publiée" : "Brouillon"}
                </span>
                <DeleteCourseButton id={c.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
