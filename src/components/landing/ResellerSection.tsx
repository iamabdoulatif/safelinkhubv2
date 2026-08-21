import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import SectionIntro from "./SectionIntro";
import {
  RESELLER_PACK_FCFA,
  RESELLER_QUOTA,
  RESELLER_SETUP_FEE_CENTS,
} from "@/lib/billing/reseller";
import { AUTO_SETUP_FEE_CENTS } from "@/lib/billing/auto-setup-pricing";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";

/* Comptes utilisateur et revendeur, présentés côte à côte.
 *
 * TOUS les montants sont IMPORTÉS de la configuration de facturation, jamais
 * recopiés : la page ne peut pas annoncer un prix que le débit ne pratique pas.
 * Si le pack change dans lib/billing/reseller.ts, cette section suit. */

const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;
const economie = RESELLER_QUOTA * (AUTO_SETUP_FEE_CENTS.hotspotOnly - RESELLER_SETUP_FEE_CENTS);

const buildPlans = (dict: Dictionary) =>
  [
    {
      name: dict.reseller.user.name,
      tagline: dict.reseller.user.tagline,
      price: dict.reseller.user.price,
      priceNote: dict.reseller.user.priceNote,
      featured: false,
      cta: dict.reseller.user.cta,
      points: dict.reseller.user.points(
        fcfa(AUTO_SETUP_FEE_CENTS.hotspotOnly),
        fcfa(AUTO_SETUP_FEE_CENTS.containerCapable),
      ),
    },
    {
      name: dict.reseller.pro.name,
      tagline: dict.reseller.pro.tagline,
      price: fcfa(RESELLER_PACK_FCFA),
      priceNote: dict.reseller.pro.priceNote,
      featured: true,
      cta: dict.reseller.pro.cta,
      points: dict.reseller.pro.points(
        RESELLER_QUOTA,
        fcfa(RESELLER_SETUP_FEE_CENTS),
        fcfa(AUTO_SETUP_FEE_CENTS.hotspotOnly),
      ),
    },
  ] as const;

export default function ResellerSection({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  const plans = buildPlans(dict);
  return (
    <section
      id="revendeurs"
      aria-label={dict.reseller.aria}
      className="border-b border-line bg-clay py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro
          eyebrow={dict.reseller.eyebrow}
          title={dict.reseller.title}
          marker={dict.reseller.mark}
          lead={dict.reseller.lead}
        />

        <div className="stagger mt-12 grid grid-cols-1 gap-5 lg:grid-cols-2">
          {plans.map((plan) => (
            <article
              key={plan.name}
              className={`reveal slate-card flex flex-col p-6 sm:p-8 ${
                plan.featured ? "border-brand-deep bg-brand/15" : "bg-paper"
              }`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-display text-xl font-bold text-ink">{plan.name}</h3>
                {plan.featured && (
                  <span className="shrink-0 rounded-full bg-slate-deep px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                    {dict.reseller.pro.discount(Math.round((1 - RESELLER_SETUP_FEE_CENTS / AUTO_SETUP_FEE_CENTS.hotspotOnly) * 100))}
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-soft">{plan.tagline}</p>

              <p className="mt-6 font-display text-3xl font-bold tracking-tight text-ink">
                {plan.price}
              </p>
              <p className="mt-1 text-xs leading-5 text-ink-soft">{plan.priceNote}</p>

              <ul role="list" className="mt-6 flex-1 space-y-3">
                {plan.points.map((point) => (
                  <li key={point} className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-slate-deep"
                    >
                      <Check className="h-3 w-3" strokeWidth={3} />
                    </span>
                    <span className="text-sm leading-6 text-ink">{point}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={localeHref("/auth/register", locale)}
                className={`mt-8 inline-flex items-center justify-center gap-2 slate-btn px-6 py-3 text-sm ${
                  plan.featured ? "slate-btn-dark" : "slate-btn-ghost"
                }`}
              >
                {plan.cta}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </article>
          ))}
        </div>

        <p className="mt-6 text-center text-sm text-ink-soft">
          {dict.reseller.footnote(RESELLER_QUOTA, fcfa(economie))}
        </p>
      </div>
    </section>
  );
}
