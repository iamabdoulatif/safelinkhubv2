"use client";

import { useActionState, useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteLesson, saveLesson } from "@/lib/courses/actions";

type Lesson = {
  id: string;
  title: string;
  content: string;
  videoUrl: string | null;
  durationMinutes: number | null;
  position: number;
};

const input =
  "mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";
const label = "block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft";

function LessonForm({ courseId, lesson }: { courseId: string; lesson?: Lesson }) {
  const [state, action, pending] = useActionState(saveLesson, undefined);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="courseId" value={courseId} />
      {lesson && <input type="hidden" name="id" value={lesson.id} />}
      <label className="block">
        <span className={label}>Titre de la leçon *</span>
        <input name="title" required defaultValue={lesson?.title ?? ""} className={input} />
      </label>
      <label className="block">
        <span className={label}>Contenu *</span>
        <textarea
          name="content"
          required
          rows={6}
          defaultValue={lesson?.content ?? ""}
          placeholder="Un paragraphe par bloc. « ## » en début de ligne pour un intertitre."
          className={input}
        />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className={label}>Vidéo (https)</span>
          <input name="videoUrl" defaultValue={lesson?.videoUrl ?? ""} className={input} />
        </label>
        <label className="block">
          <span className={label}>Durée (minutes)</span>
          <input
            name="durationMinutes"
            type="number"
            min={1}
            defaultValue={lesson?.durationMinutes ?? ""}
            className={input}
          />
        </label>
      </div>
      {state && "error" in state && state.error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{state.error}</p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
      >
        {pending ? "Enregistrement…" : lesson ? "Enregistrer la leçon" : "Ajouter la leçon"}
      </button>
    </form>
  );
}

export default function LessonsEditor({
  courseId,
  lessons,
}: {
  courseId: string;
  lessons: Lesson[];
}) {
  const [confirme, setConfirme] = useState<string | null>(null);

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-bold text-ink">
        Leçons <span className="text-ink-soft">({lessons.length})</span>
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Elles s’affichent dans l’ordre ci-dessous, numérotées automatiquement.
      </p>

      <ol className="mt-4 space-y-4" role="list">
        {lessons.map((l, i) => (
          <li key={l.id} className="border border-line bg-paper p-5">
            <div className="flex items-start justify-between gap-3">
              <p className="font-mono text-xs font-bold text-brand-deep">
                {String(i + 1).padStart(2, "0")}
              </p>
              {confirme === l.id ? (
                <form action={deleteLesson} className="flex gap-1.5">
                  <input type="hidden" name="id" value={l.id} />
                  <button className="rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-bold text-white">
                    Confirmer
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirme(null)}
                    className="rounded-md border border-line px-2.5 py-1.5 text-xs font-semibold text-ink-soft"
                  >
                    Annuler
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirme(l.id)}
                  title="Supprimer cette leçon"
                  className="rounded-md border border-line p-1.5 text-red-700 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div className="mt-3">
              <LessonForm courseId={courseId} lesson={l} />
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-6 border border-dashed border-line bg-clay/40 p-5">
        <h3 className="font-semibold text-ink">Nouvelle leçon</h3>
        <div className="mt-3">
          <LessonForm courseId={courseId} />
        </div>
      </div>
    </section>
  );
}
