import { Star } from "lucide-react";
import SectionHeading from "./SectionHeading";
import TestimonialForm from "./TestimonialForm";
import { getApprovedTestimonials } from "@/lib/testimonials/queries";

function Initials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center border-2 border-line bg-brand font-display text-sm font-extrabold text-[#1C1917]"
    >
      {initials}
    </span>
  );
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex gap-0.5" aria-label={`${rating} sur 5`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          aria-hidden="true"
          className={`h-3.5 w-3.5 ${i < rating ? "fill-brand text-brand" : "text-line"}`}
        />
      ))}
    </span>
  );
}

export default async function Testimonials() {
  const items = await getApprovedTestimonials(9);

  return (
    <section
      id="temoignages"
      aria-label="Témoignages"
      className="border-b-2 border-line bg-clay py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="06"
          title="Ce que disent nos utilisateurs."
          marker="utilisateurs"
        />

        {items.length > 0 ? (
          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {items.map((t) => (
              <figure
                key={t.id}
                className="flex flex-col justify-between border-2 border-line bg-paper p-6 sm:p-7"
              >
                <div>
                  {t.rating ? <Stars rating={t.rating} /> : null}
                  <blockquote className="mt-3 font-display text-lg font-semibold leading-snug text-ink">
                    «&nbsp;{t.quote}&nbsp;»
                  </blockquote>
                </div>
                <figcaption className="mt-6 flex items-center gap-3 border-t-2 border-line-soft pt-4">
                  <Initials name={t.name} />
                  <span>
                    <span className="block text-sm font-bold text-ink">{t.name}</span>
                    <span className="block font-mono text-xs text-ink-soft">
                      {[t.role, t.company].filter(Boolean).join(" · ") || "Utilisateur SafeLinkHub"}
                    </span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="border-2 border-dashed border-line bg-paper p-8 text-center">
            <p className="font-display text-lg font-semibold text-ink">
              Soyez le premier à partager votre expérience.
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">
              Vous utilisez SafeLinkHub ? Racontez-nous — votre témoignage apparaîtra ici
              après validation.
            </p>
          </div>
        )}

        <div className="mt-10">
          <TestimonialForm />
        </div>
      </div>
    </section>
  );
}
