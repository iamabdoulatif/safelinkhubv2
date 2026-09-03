import { Star } from "lucide-react";
import SectionIntro from "./SectionIntro";
import TestimonialForm from "./TestimonialForm";
import { getApprovedTestimonials } from "@/lib/testimonials/queries";
import type { Dictionary } from "@/lib/i18n/fr";
import type { Locale } from "@/lib/i18n/config";

function Initials({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("");
  return (
    <span
      aria-hidden="true"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-brand font-display text-sm font-bold text-slate-deep"
    >
      {initials}
    </span>
  );
}

function Stars({ rating, label }: { rating: number; label: string }) {
  return (
    <span className="flex gap-0.5" aria-label={label}>
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

export default async function Testimonials({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.testimonials;
  const items = await getApprovedTestimonials(9);

  return (
    <section
      id="temoignages"
      aria-label={t.aria}
      className="border-b border-line bg-paper py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro eyebrow={t.eyebrow} title={t.title} marker={t.marker} lead={t.lead} />

        {items.length > 0 ? (
          <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
            {items.map((item) => (
              <figure
                key={item.id}
                className="slate-card flex flex-col justify-between bg-paper p-6 sm:p-7"
              >
                <div>
                  {item.rating ? <Stars rating={item.rating} label={t.ratingLabel(item.rating)} /> : null}
                  <blockquote className="mt-3 font-display text-lg font-semibold leading-snug text-ink">
                    «&nbsp;{item.quote}&nbsp;»
                  </blockquote>
                </div>
                <figcaption className="mt-6 flex items-center gap-3 border-t border-line pt-4">
                  <Initials name={item.name} />
                  <span>
                    <span className="block text-sm font-bold text-ink">{item.name}</span>
                    <span className="block text-xs text-ink-soft">
                      {[item.role, item.company].filter(Boolean).join(" · ") || t.fallbackRole}
                    </span>
                  </span>
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <div className="mt-12 rounded-2xl border border-dashed border-line bg-paper p-8 text-center">
            <p className="font-display text-lg font-semibold text-ink">{t.empty.title}</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-soft">{t.empty.text}</p>
          </div>
        )}

        <div className="mt-10">
          <TestimonialForm t={t.form} locale={locale} />
        </div>
      </div>
    </section>
  );
}
