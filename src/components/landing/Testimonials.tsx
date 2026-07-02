import SectionHeading from "./SectionHeading";
import { testimonials } from "./content";

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

export default function Testimonials() {
  return (
    <section aria-label="Témoignages" className="border-b-2 border-line bg-clay py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading
          index="05"
          title="Adopté par les FAI à travers l'Afrique."
          marker="l'Afrique"
        />
        <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
          {testimonials.map((t) => (
            <figure key={t.author} className="flex flex-col justify-between border-2 border-line bg-paper p-6 sm:p-7">
              <blockquote className="font-display text-lg font-semibold leading-snug text-ink">
                «&nbsp;{t.quote}&nbsp;»
              </blockquote>
              <figcaption className="mt-6 flex items-center gap-3 border-t-2 border-line-soft pt-4">
                <Initials name={t.author} />
                <span>
                  <span className="block text-sm font-bold text-ink">{t.author}</span>
                  <span className="block font-mono text-xs text-ink-soft">{t.company}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
