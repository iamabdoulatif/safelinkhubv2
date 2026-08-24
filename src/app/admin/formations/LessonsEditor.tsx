"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, ExternalLink, Trash2 } from "lucide-react";
import { attachLesson, deleteLesson, moveLesson } from "@/lib/courses/actions";

type Lesson = { id: string; position: number; postId: string; title: string; slug: string };
type Article = { id: string; title: string; category: string | null };

/* Éditeur de PARCOURS, pas de contenu.
 *
 * On n'écrit rien ici : le contenu d'une leçon est celui de son article, rédigé
 * dans l'éditeur de blog avec sa couverture, sa catégorie et sa publication.
 * Un second éditeur aurait dupliqué tout cela, et les deux auraient divergé. */
export default function LessonsEditor({
  courseId,
  lessons,
  articles,
}: {
  courseId: string;
  lessons: Lesson[];
  articles: Article[];
}) {
  const [state, action, pending] = useActionState(attachLesson, undefined);
  const [confirme, setConfirme] = useState<string | null>(null);
  const disponibles = articles.filter((a) => !lessons.some((l) => l.postId === a.id));

  return (
    <section className="mt-8">
      <h2 className="font-display text-xl font-bold text-ink">
        Leçons <span className="text-ink-soft">({lessons.length})</span>
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Une leçon est un article publié. Le contenu se rédige dans{" "}
        <Link href="/admin/blog" className="font-semibold text-brand-deep hover:underline">
          Blog
        </Link>{" "}
        ; ici on choisit lesquels et dans quel ordre.
      </p>

      <ol className="mt-4 divide-y divide-line border-y border-line" role="list">
        {lessons.map((l, i) => (
          <li key={l.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="font-mono text-xs font-bold text-brand-deep">
              {String(i + 1).padStart(2, "0")}
            </span>
            <Link
              href={`/blog/${l.slug}`}
              target="_blank"
              className="min-w-0 flex-1 truncate font-medium text-ink hover:underline"
            >
              {l.title}
              <ExternalLink aria-hidden="true" className="ml-1.5 inline h-3 w-3 text-ink-soft" />
            </Link>

            <div className="flex items-center gap-1">
              {/* Désactivés en bout de liste plutôt que masqués : les boutons
                  ne sautent pas d'une ligne à l'autre quand on réordonne. */}
              <form action={moveLesson}>
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="direction" value="up" />
                <button
                  disabled={i === 0}
                  aria-label={`Monter « ${l.title} »`}
                  className="rounded-md border border-line p-1.5 text-ink hover:bg-clay disabled:opacity-30"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
              </form>
              <form action={moveLesson}>
                <input type="hidden" name="id" value={l.id} />
                <input type="hidden" name="direction" value="down" />
                <button
                  disabled={i === lessons.length - 1}
                  aria-label={`Descendre « ${l.title} »`}
                  className="rounded-md border border-line p-1.5 text-ink hover:bg-clay disabled:opacity-30"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
              </form>

              {confirme === l.id ? (
                <form action={deleteLesson} className="flex gap-1.5">
                  <input type="hidden" name="id" value={l.id} />
                  <button className="rounded-md bg-err px-2.5 py-1.5 text-xs font-bold text-white">
                    Retirer
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
                  title="Retirer de la formation — l'article n'est pas supprimé"
                  className="rounded-md border border-line p-1.5 text-err hover:bg-err-soft"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </li>
        ))}
        {lessons.length === 0 && (
          <li className="py-5 text-sm text-ink-soft">
            Aucune leçon. Rattachez un article publié ci-dessous.
          </li>
        )}
      </ol>

      <form action={action} className="mt-5 flex flex-wrap items-end gap-3 border border-dashed border-line bg-clay/40 p-5">
        <input type="hidden" name="courseId" value={courseId} />
        <label className="min-w-0 flex-1">
          <span className="block text-xs font-semibold uppercase tracking-[0.12em] text-ink-soft">
            Ajouter un article publié
          </span>
          <select
            name="postId"
            required
            defaultValue=""
            className="mt-1 w-full rounded-md border border-line-soft bg-paper px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
          >
            <option value="" disabled>
              {disponibles.length ? "Choisir…" : "Tous vos articles sont déjà dans ce parcours"}
            </option>
            {disponibles.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
                {a.category ? ` — ${a.category}` : ""}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={pending || disponibles.length === 0}
          className="rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
        >
          {pending ? "Ajout…" : "Rattacher"}
        </button>
        {state && "error" in state && state.error && (
          <p className="w-full rounded-md bg-err-soft px-3 py-2 text-sm text-err">{state.error}</p>
        )}
      </form>
    </section>
  );
}
