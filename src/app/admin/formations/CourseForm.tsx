"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { saveCourse } from "@/lib/courses/actions";
import SeoPanel from "@/components/content/SeoPanel";

type Course = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string | null;
  coverImageUrl: string | null;
  published: boolean;
  position: number;
  focusKeyword?: string | null;
} | null;

const input =
  "mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const label = "block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft";

export default function CourseForm({ course }: { course: Course }) {
  const [state, action, pending] = useActionState(saveCourse, undefined);
  const navRouter = useRouter();

  /* Après une création, on part sur la fiche : c'est là que se saisissent les
     leçons, et rester sur un formulaire vide laisserait croire que rien n'a
     été enregistré. */
  useEffect(() => {
    if (state && "success" in state && state.success && !course) {
      navRouter.push(`/admin/formations/${state.id}`);
    }
  }, [state, course, navRouter]);

  /* Contrôlés parce que le panneau de référencement les relit à la frappe. */
  const [title, setTitle] = useState(course?.title ?? "");
  const [slug, setSlug] = useState(course?.slug ?? "");
  const [summary, setSummary] = useState(course?.summary ?? "");
  const [coverImageUrl, setCoverImageUrl] = useState(course?.coverImageUrl ?? "");
  const [keyword, setKeyword] = useState(course?.focusKeyword ?? "");

  return (
    <form action={action} className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="space-y-4 border border-line bg-paper p-5 sm:p-6">
      {course && <input type="hidden" name="id" value={course.id} />}

      <label className="block">
        <span className={label}>Titre *</span>
        <input name="title" required value={title} onChange={(e) => setTitle(e.target.value)} className={input} />
      </label>

      <label className="block">
        <span className={label}>Résumé</span>
        <textarea name="summary" rows={3} value={summary} onChange={(e) => setSummary(e.target.value)} className={input} />
      </label>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className={label}>Niveau</span>
          <input
            name="level"
            placeholder="Débutant, Intermédiaire…"
            defaultValue={course?.level ?? ""}
            className={input}
          />
        </label>
        <label className="block">
          <span className={label}>Slug</span>
          <input
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder="généré depuis le titre"
            className={input}
          />
        </label>
        <label className="block">
          <span className={label}>Ordre d’affichage</span>
          <input
            name="position"
            type="number"
            defaultValue={course?.position ?? 0}
            className={input}
          />
        </label>
      </div>

      <label className="block">
        <span className={label}>Image de couverture</span>
        <input
          name="coverImageUrl"
          value={coverImageUrl}
          onChange={(e) => setCoverImageUrl(e.target.value)}
          placeholder="/formations/… ou https://…"
          className={input}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="published" defaultChecked={course?.published ?? false} />
        Publier cette formation
      </label>

      {state && "error" in state && state.error && (
        <p className="rounded-md bg-err-soft px-3 py-2 text-sm text-err">{state.error}</p>
      )}
      {state && "success" in state && state.success && course && (
        <p className="rounded-md bg-clay px-3 py-2 text-sm text-ok">Enregistré.</p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : course ? "Enregistrer" : "Créer la formation"}
      </button>
      </div>

      <div className="lg:sticky lg:top-6 lg:self-start">
        <SeoPanel
          keywordName="focusKeyword"
          keyword={keyword}
          onKeywordChange={setKeyword}
          title={title}
          slug={slug}
          excerpt={summary}
          /* Une formation n'a pas de corps de texte : ce sont ses LEÇONS qui en
             portent un, et chaque leçon est un article de blog (voir
             /admin/blog). Le contenu analysé ici est donc le résumé. */
          content={summary}
          coverImageUrl={coverImageUrl}
        />
      </div>
    </form>
  );
}
