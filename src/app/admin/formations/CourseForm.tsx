"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { saveCourse } from "@/lib/courses/actions";

type Course = {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  level: string | null;
  coverImageUrl: string | null;
  published: boolean;
  position: number;
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

  return (
    <form action={action} className="mt-6 space-y-4 border border-line bg-paper p-5 sm:p-6">
      {course && <input type="hidden" name="id" value={course.id} />}

      <label className="block">
        <span className={label}>Titre *</span>
        <input name="title" required defaultValue={course?.title ?? ""} className={input} />
      </label>

      <label className="block">
        <span className={label}>Résumé</span>
        <textarea name="summary" rows={3} defaultValue={course?.summary ?? ""} className={input} />
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
            placeholder="généré depuis le titre"
            defaultValue={course?.slug ?? ""}
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
          placeholder="/formations/… ou https://…"
          defaultValue={course?.coverImageUrl ?? ""}
          className={input}
        />
      </label>

      <label className="flex items-center gap-2 text-sm text-ink">
        <input type="checkbox" name="published" defaultChecked={course?.published ?? false} />
        Publier cette formation
      </label>

      {state && "error" in state && state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
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
    </form>
  );
}
