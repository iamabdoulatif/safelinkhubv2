import { Plus } from "lucide-react";
import SectionIntro from "./SectionIntro";
import { faqs } from "./content";
import type { Dictionary } from "@/lib/i18n/fr";

/* FAQ en grille de deux colonnes — le motif Slate. Chaque question est un
 * <details> natif : ouverture au clavier, aucun JavaScript, aucune animation. */
export default function FaqSection({ dict }: { dict: Dictionary }) {
  return (
    <section id="faq" aria-label={dict.faq.aria} className="border-b border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro
          eyebrow={dict.faq.eyebrow}
          title={dict.faq.title}
          lead={dict.faq.lead}
        />
        <div className="stagger mt-12 grid grid-cols-1 gap-4 md:grid-cols-2">
          {faqs.map((_, i) => {
            const f = dict.content.faqs[i];
            return (
            <details key={f.q} className="reveal slate-card group bg-paper p-5 sm:p-6">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-4 font-display text-base font-bold text-ink">
                {f.q}
                <Plus
                  aria-hidden="true"
                  className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft group-open:rotate-45"
                />
              </summary>
              <p className="mt-3 text-sm leading-6 text-ink-soft">{f.a}</p>
            </details>
            );
          })}
        </div>
      </div>
    </section>
  );
}
