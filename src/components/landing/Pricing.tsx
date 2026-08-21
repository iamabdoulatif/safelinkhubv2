import Link from "next/link";
import { Check } from "lucide-react";
import SectionIntro from "./SectionIntro";
import {
  REMOTE_ACCESS_SERVICES,
  BILLING_PERIODS,
  remoteAccessPriceFcfa,
} from "@/lib/billing/remote-access-gate-config";
import {
  AUTO_SETUP_FEE_CENTS,
  VPN_TRIAL_DAYS,
} from "@/lib/billing/auto-setup-pricing";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";
import { fcfaToScCents, formatSc } from "@/lib/safecoin/pricing";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref, HTML_LANG } from "@/lib/i18n/config";

const safecoinPrice = (n: number) => formatSc(fcfaToScCents(n, DEFAULT_SC_RATE_FCFA));

/*
 * Section Tarifs — 100 % données réelles (importées de la config de
 * facturation : remote-access-gate-config.ts + auto-setup-pricing.ts). Aucun
 * chiffre en dur : si la grille change dans le code, la landing suit.
 *
 * Les libellés de période et de service passent par le dictionnaire, indexés
 * par IDENTIFIANT et non par position : réordonner la grille de facturation ne
 * peut donc pas décaler les traductions. La config reste la source des ids et
 * des prix ; elle ne porte plus le texte affiché, qui existe en deux langues.
 */
export default function Pricing({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const t = dict.pricing;
  // Le groupement des milliers suit la langue : « 4 000 » en français,
  // « 4,000 » en anglais.
  const fcfa = new Intl.NumberFormat(HTML_LANG[locale]);
  const price = (n: number) => `${fcfa.format(n)} FCFA`;

  return (
    <section
      id="tarifs"
      aria-label={t.aria}
      className="border-b border-line bg-paper py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro eyebrow={t.eyebrow} title={t.title} marker={t.marker} lead={t.lead} />

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Accès distant — grille de prix (identique pour les 4 services) */}
          <div className="slate-card slate-card-raised flex flex-col overflow-hidden bg-paper lg:col-span-7">
            <div className="border-b border-line bg-slate-deep px-5 py-4">
              <h3 className="font-display text-xl font-bold text-white">{t.remote.title}</h3>
              <p className="mt-1 text-xs text-slate-deep-soft">{t.remote.sub}</p>
            </div>

            <ul className="flex flex-wrap gap-2 border-b border-line px-5 py-4">
              {REMOTE_ACCESS_SERVICES.map((s) => (
                <li
                  key={s.id}
                  translate="no"
                  className="rounded-full border border-line bg-clay px-3 py-1 font-mono text-xs font-semibold text-ink"
                >
                  {t.services[s.id]}
                </li>
              ))}
            </ul>

            <div className="grid flex-1 grid-cols-2 sm:grid-cols-4">
              {BILLING_PERIODS.map((p, i) => (
                <div
                  key={p.id}
                  className={`p-5 text-center ${
                    i > 0 ? "border-t border-line sm:border-l sm:border-t-0" : ""
                  } ${i >= 2 ? "border-t sm:border-t-0" : ""}`}
                >
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                    {t.periods[p.id]}
                  </p>
                  <p className="mt-2 whitespace-nowrap font-mono text-lg font-bold tabular-nums text-ink">
                    {price(remoteAccessPriceFcfa(p.id))}
                  </p>
                  <p className="mt-1 whitespace-nowrap font-mono text-xs font-bold tabular-nums text-brand-deep">
                    {safecoinPrice(remoteAccessPriceFcfa(p.id))} Safecoin
                  </p>
                </div>
              ))}
            </div>

            <p className="border-t border-line bg-clay px-5 py-3 text-xs text-ink-soft">
              {t.remote.note(fcfa.format(DEFAULT_SC_RATE_FCFA))}
            </p>
          </div>

          {/* Auto-setup + essai gratuit */}
          <div className="flex flex-col gap-6 lg:col-span-5">
            <div className="slate-card slate-card-raised overflow-hidden bg-paper">
              <div className="border-b border-line bg-brand px-5 py-4">
                <h3 className="font-display text-xl font-bold text-slate-deep">
                  {t.autoSetup.title}
                </h3>
                <p className="mt-1 text-xs text-[#2C4A34]">{t.autoSetup.sub}</p>
              </div>
              <div className="grid grid-cols-1 divide-y divide-line">
                <div className="flex items-baseline justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">{t.autoSetup.containerLabel}</p>
                    <p className="text-xs text-ink-soft">{t.autoSetup.containerSub}</p>
                  </div>
                  <span className="text-right">
                    <span className="block whitespace-nowrap font-mono text-lg font-bold tabular-nums text-ink">
                      {price(AUTO_SETUP_FEE_CENTS.containerCapable)}
                    </span>
                    <span className="mt-1 block whitespace-nowrap font-mono text-xs font-bold tabular-nums text-brand-deep">
                      {safecoinPrice(AUTO_SETUP_FEE_CENTS.containerCapable)} Safecoin
                    </span>
                  </span>
                </div>
                <div className="flex items-baseline justify-between gap-3 px-5 py-4">
                  <div>
                    <p className="text-sm font-semibold text-ink">{t.autoSetup.hotspotLabel}</p>
                    <p className="text-xs text-ink-soft">{t.autoSetup.hotspotSub}</p>
                  </div>
                  <span className="text-right">
                    <span className="block whitespace-nowrap font-mono text-lg font-bold tabular-nums text-ink">
                      {price(AUTO_SETUP_FEE_CENTS.hotspotOnly)}
                    </span>
                    <span className="mt-1 block whitespace-nowrap font-mono text-xs font-bold tabular-nums text-brand-deep">
                      {safecoinPrice(AUTO_SETUP_FEE_CENTS.hotspotOnly)} Safecoin
                    </span>
                  </span>
                </div>
              </div>
              <p className="border-t border-line bg-clay px-5 py-3 text-xs text-ink-soft">
                {t.autoSetup.note}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-deep p-6 text-white">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">
                {t.trial.eyebrow}
              </p>
              {/* Un SEUL nœud texte : ce Next avale l'espace entre {expr} et le
                  texte adjacent au SSR (« 10<!-- -->jours »). */}
              <p className="mt-2 font-display text-2xl font-bold">
                {t.trial.headline(VPN_TRIAL_DAYS)}
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-deep-soft">
                {t.trial.perks.map((line) => (
                  <li key={line} className="flex items-start gap-2">
                    <Check aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                    {line}
                  </li>
                ))}
              </ul>
              <Link
                href={localeHref("/auth/register", locale)}
                className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary mt-6 px-6 py-3 text-sm"
              >
                {t.trial.cta}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
