import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";

/* Appel final — grande carte lime pleine largeur, motif de clôture de Slate.
 * Texte anthracite sur le lime : jamais de blanc, qui ne tiendrait pas le
 * contraste sur #C8F24E. */
export default function FinalCta({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  return (
    <section aria-label={dict.finalCta.aria} className="bg-paper px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto max-w-6xl">
        <div className="reveal reveal-scale rounded-3xl bg-brand px-6 py-14 text-center sm:px-12 sm:py-20">
          <h2 className="mx-auto max-w-2xl font-display text-3xl font-bold leading-[1.1] tracking-tight text-slate-deep sm:text-4xl md:text-5xl">
            {dict.finalCta.title}
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-base text-[#2C4A34]">
            {dict.finalCta.lead}
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href={localeHref("/auth/register", locale)} className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-dark px-7 py-3.5 text-base">
              {dict.finalCta.primary}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
            <Link
              href={localeHref("/contact", locale)}
              className="inline-flex items-center justify-center gap-2 slate-btn border border-slate-deep bg-transparent px-7 py-3.5 text-base text-slate-deep hover:bg-[#BCE93C]"
            >
              {dict.finalCta.secondary}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
