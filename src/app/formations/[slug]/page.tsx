import { notFound } from "next/navigation";
import Link from "next/link";
import { Clock, PlayCircle } from "lucide-react";
import LandingNav from "@/components/landing/LandingNav";
import LandingFooter from "@/components/landing/LandingFooter";
import ContentBlocks from "@/components/content/ContentBlocks";
import Reveal from "@/components/motion/Reveal";
import { getDictionary } from "@/lib/i18n/dictionaries";
import { localeHref, localePrefix, type Locale } from "@/lib/i18n/config";
import { getPublishedCourse } from "@/lib/courses/queries";

export async function CoursePageContent({
  locale,
  params,
}: {
  locale: Locale;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [dict, data] = await Promise.all([getDictionary(locale), getPublishedCourse(slug)]);
  if (!data) notFound();
  const { course, lessons } = data;
  const t = dict.trainingPage;

  return (
    <div lang={locale} className="theme-slate flex flex-1 flex-col">
      <LandingNav anchorPrefix={localePrefix(locale) || "/"} nav={dict.nav} locale={locale} />
      <main className="flex-1 bg-paper">
        <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
          <Link
            href={localeHref("/formations", locale)}
            className="text-sm font-semibold text-brand-deep hover:underline"
          >
            {t.backToTraining}
          </Link>

          {course.level && <span className="slate-eyebrow mt-6 inline-block">{course.level}</span>}
          <h1 className="mt-4 font-display text-4xl font-bold leading-tight tracking-tight text-ink">
            {course.title}
          </h1>
          {course.summary && (
            <p className="mt-3 text-base leading-7 text-ink-soft">{course.summary}</p>
          )}
          <p className="mt-3 text-sm text-ink-soft">{t.lessonsCount(lessons.length)}</p>

          <ol className="mt-10 space-y-10" role="list">
            {lessons.map((lesson, i) => (
              <li key={lesson.id} className="border-t border-line pt-8">
                <p className="font-mono text-xs font-bold text-brand-deep">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h2 className="mt-2 font-display text-2xl font-bold text-ink">{lesson.title}</h2>
                <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-ink-soft">
                  {lesson.durationMinutes ? (
                    <span className="inline-flex items-center gap-1.5">
                      <Clock aria-hidden="true" className="h-3.5 w-3.5" />
                      {lesson.durationMinutes} min
                    </span>
                  ) : null}
                  {lesson.videoUrl && (
                    <a
                      href={lesson.videoUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-brand-deep hover:underline"
                    >
                      <PlayCircle aria-hidden="true" className="h-3.5 w-3.5" />
                      Vidéo
                    </a>
                  )}
                </div>
                <div className="mt-2">
                  <ContentBlocks content={lesson.content} />
                </div>
              </li>
            ))}
          </ol>
        </article>
      </main>
      <LandingFooter dict={dict} locale={locale} />
      <Reveal />
    </div>
  );
}

export default function CoursePage({ params }: { params: Promise<{ slug: string }> }) {
  return <CoursePageContent locale="fr" params={params} />;
}
