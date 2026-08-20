import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import SectionIntro from "./SectionIntro";
import {
  RESELLER_PACK_FCFA,
  RESELLER_QUOTA,
  RESELLER_SETUP_FEE_CENTS,
} from "@/lib/billing/reseller";
import { AUTO_SETUP_FEE_CENTS } from "@/lib/billing/auto-setup-pricing";

/* Comptes utilisateur et revendeur, présentés côte à côte.
 *
 * TOUS les montants sont IMPORTÉS de la configuration de facturation, jamais
 * recopiés : la page ne peut pas annoncer un prix que le débit ne pratique pas.
 * Si le pack change dans lib/billing/reseller.ts, cette section suit. */

const fcfa = (n: number) => `${new Intl.NumberFormat("fr-FR").format(n)} FCFA`;
const economie = RESELLER_QUOTA * (AUTO_SETUP_FEE_CENTS.hotspotOnly - RESELLER_SETUP_FEE_CENTS);

const plans = [
  {
    name: "Utilisateur",
    tagline: "Un ou deux MikroTik par an",
    price: "Gratuit",
    priceNote: "Rien à payer à l'inscription",
    featured: false,
    cta: "Créer un compte",
    points: [
      `Installation à ${fcfa(AUTO_SETUP_FEE_CENTS.hotspotOnly)} — ${fcfa(AUTO_SETUP_FEE_CENTS.containerCapable)} avec conteneur`,
      "Premier routeur installé gratuitement",
      "10 jours d'accès distant offerts",
      "Facturation mobile money et vouchers illimités",
    ],
  },
  {
    name: "Technicien ou revendeur",
    tagline: "Plusieurs MikroTik par mois",
    price: fcfa(RESELLER_PACK_FCFA),
    priceNote: "par an — reversés en crédit sur votre portefeuille",
    featured: true,
    cta: "Devenir revendeur",
    points: [
      `${RESELLER_QUOTA} installations à ${fcfa(RESELLER_SETUP_FEE_CENTS)} au lieu de ${fcfa(AUTO_SETUP_FEE_CENTS.hotspotOnly)}`,
      "Tarif unique, que la carte accepte les conteneurs ou non",
      `Le montant du pack revient en totalité sur votre portefeuille`,
      "Quota remis à zéro à chaque renouvellement annuel",
    ],
  },
] as const;

export default function ResellerSection() {
  return (
    <section
      id="revendeurs"
      aria-label="Comptes utilisateur et revendeur"
      className="border-b border-line bg-clay py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro
          eyebrow="Techniciens & revendeurs"
          title={"Vous en posez plusieurs par mois\u202F?"}
          marker="plusieurs par mois"
          lead="Le compte revendeur ramène l'installation d'un MikroTik à un prix d'intégrateur. Le pack se paie une fois par an et revient intégralement en crédit."
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
                    Remise {Math.round((1 - RESELLER_SETUP_FEE_CENTS / AUTO_SETUP_FEE_CENTS.hotspotOnly) * 100)} %
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
                href="/auth/register"
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
          {`Sur ${RESELLER_QUOTA} installations, le pack revendeur représente ${fcfa(economie)} d'économie. Le statut se demande à l'inscription et s'active au paiement du pack.`}
        </p>
      </div>
    </section>
  );
}
