import { redirect } from "next/navigation";
import { Star } from "lucide-react";
import { getSession, isSuperAdmin } from "@/lib/auth/session";
import { getAllTestimonials } from "@/lib/testimonials/queries";
import { moderateTestimonial } from "@/lib/testimonials/actions";
import DeleteTestimonialButton from "./DeleteTestimonialButton";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: "En attente", className: "bg-brand text-slate-deep" },
  approved: { label: "Publié", className: "bg-ok/15 text-ok" },
  hidden: { label: "Masqué", className: "bg-clay text-ink-soft line-through" },
};

export default async function AdminTestimonialsPage() {
  const session = await getSession();
  if (!isSuperAdmin(session?.role)) redirect("/admin");

  const items = await getAllTestimonials();
  const pending = items.filter((t) => t.status === "pending").length;

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-2xl font-bold text-ink">Témoignages</h1>
      <p className="mt-1 text-sm text-ink-soft">
        Avis soumis depuis la landing publique. Seuls les témoignages « publiés » apparaissent sur
        le site
        {pending > 0 && ` — ${pending} en attente`}.
      </p>

      {items.length === 0 ? (
        <div className="mt-6 border border-line bg-paper p-8 text-center rounded-xl">
          <p className="font-semibold text-ink">Aucun témoignage.</p>
          <p className="mt-1 text-sm text-ink-soft">
            Les témoignages envoyés depuis la landing apparaîtront ici.
          </p>
        </div>
      ) : (
        <ul className="mt-4 space-y-3" role="list">
          {items.map((t) => {
            const status = STATUS[t.status] ?? STATUS.pending;
            return (
              <li key={t.id} className="border border-line bg-paper p-4 sm:p-5 rounded-xl">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium text-ink">
                      {t.name}
                      {(t.role || t.company) && (
                        <span className="font-normal text-ink-soft">
                          {" "}
                          — {[t.role, t.company].filter(Boolean).join(", ")}
                        </span>
                      )}
                    </p>
                    {t.rating ? (
                      <span className="mt-1 flex gap-0.5" aria-label={`${t.rating} sur 5`}>
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star
                            key={i}
                            aria-hidden="true"
                            className={`h-3.5 w-3.5 ${i < t.rating! ? "fill-brand text-brand" : "text-line"}`}
                          />
                        ))}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>
                      {status.label}
                    </span>
                    <span className="font-mono text-xs text-ink-soft">{formatDate(t.createdAt)}</span>
                  </div>
                </div>

                <blockquote className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                  «&nbsp;{t.quote}&nbsp;»
                </blockquote>

                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line-soft pt-3">
                  {t.status !== "approved" && (
                    <form action={moderateTestimonial}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value="approved" />
                      <button
                        type="submit"
                        className="border border-line bg-brand px-3 py-1.5 text-xs font-bold text-slate-deep hover:bg-ink hover:text-paper rounded-full"
                      >
                        Publier
                      </button>
                    </form>
                  )}
                  {t.status !== "hidden" && (
                    <form action={moderateTestimonial}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value="hidden" />
                      <button
                        type="submit"
                        className="border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay rounded-xl"
                      >
                        Masquer
                      </button>
                    </form>
                  )}
                  {t.status !== "pending" && (
                    <form action={moderateTestimonial}>
                      <input type="hidden" name="id" value={t.id} />
                      <input type="hidden" name="status" value="pending" />
                      <button
                        type="submit"
                        className="border border-line px-3 py-1.5 text-xs font-bold text-ink hover:bg-clay rounded-xl"
                      >
                        Remettre en attente
                      </button>
                    </form>
                  )}
                  <DeleteTestimonialButton id={t.id} name={t.name} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
