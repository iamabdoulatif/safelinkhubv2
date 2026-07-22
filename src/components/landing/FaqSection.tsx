import { Plus } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { faqs } from "./content";

export default function FaqSection() {
  return (
    <section id="faq" aria-label="Questions fréquentes" className="border-b-2 border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading index="08" title="Questions fréquentes." />
        <div className="border-2 border-line">
          {faqs.map((f, i) => (
            <details key={f.q} className={`group ${i > 0 ? "border-t-2 border-line" : ""}`}>
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 font-display text-base font-bold text-ink hover:bg-clay sm:px-7">
                <span className="flex items-baseline gap-4">
                  <span className="font-mono text-xs text-ink-soft" aria-hidden="true">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {f.q}
                </span>
                <Plus
                  aria-hidden="true"
                  className="h-4 w-4 shrink-0 text-ink transition-transform group-open:rotate-45"
                />
              </summary>
              <p className="border-t-2 border-line-soft bg-clay px-5 py-4 text-sm leading-6 text-ink-soft sm:px-7">
                {f.a}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
