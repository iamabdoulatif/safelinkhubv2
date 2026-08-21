import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowRight,
  Check,
  Coins,
  Gauge,
  LockKeyhole,
  WalletCards,
} from "lucide-react";
import SectionIntro from "./SectionIntro";
import { autoSetupFeeCentsFor } from "@/lib/billing/auto-setup-pricing";
import { remoteAccessPriceFcfa } from "@/lib/billing/remote-access-gate-config";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";
import { fcfaToScCents, formatSc } from "@/lib/safecoin/pricing";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref, HTML_LANG } from "@/lib/i18n/config";

function scFromFcfa(amountFcfa: number) {
  return formatSc(fcfaToScCents(amountFcfa, DEFAULT_SC_RATE_FCFA));
}

/* Les icônes restent ici, appariées par index aux trois étapes du
 * dictionnaire : un composant React ne se sérialise pas dans un fichier de
 * traduction. */
const FLOW_ICONS = [ArrowDownToLine, Coins, Gauge] as const;

const VPN_PERIODS = ["monthly", "quarterly", "semiannual", "yearly"] as const;

export default function SafecoinSection({
  dict,
  locale,
}: {
  dict: Dictionary;
  locale: Locale;
}) {
  const t = dict.safecoin;
  const fcfa = new Intl.NumberFormat(HTML_LANG[locale]);

  return (
    <section
      id="safecoin"
      aria-label={t.aria}
      className="border-b border-line bg-clay py-16 sm:py-24"
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionIntro eyebrow={t.eyebrow} title={t.title} marker={t.marker} lead={t.lead} />

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="slate-card slate-card-raised relative overflow-hidden bg-slate-deep p-6 text-white sm:p-8 lg:col-span-5">
            <div className="flex items-center justify-between gap-3 border-b border-white/20 pb-4">
              <span className="font-mono text-[10px] font-bold uppercase tracking-[0.22em] text-brand">
                {t.card.badge}
              </span>
              <LockKeyhole aria-hidden="true" className="h-4 w-4 text-brand" />
            </div>

            <div className="mt-10 flex items-center gap-5">
              <div
                aria-hidden="true"
                className="flex h-24 w-24 shrink-0 flex-col items-center justify-center border border-brand bg-brand text-slate-deep"
              >
                <Coins className="h-7 w-7" />
                <span className="mt-1 font-mono text-sm font-black tracking-widest">SC</span>
              </div>
              <div>
                <p className="font-display text-2xl font-bold" translate="no">
                  Safecoin
                </p>
                <p className="mt-1 text-sm text-[#A8A29E]">{t.card.tagline}</p>
              </div>
            </div>

            <div className="mt-10 border-t border-white/20 pt-5">
              <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-[#A8A29E]">
                {t.card.rateLabel}
              </p>
              <p className="mt-2 font-display text-4xl font-extrabold tracking-tight">
                1 SC <span className="text-brand">=</span> {fcfa.format(DEFAULT_SC_RATE_FCFA)} FCFA
              </p>
              <p className="mt-3 max-w-sm text-sm leading-6 text-[#A8A29E]">{t.card.rateNote}</p>
            </div>
          </div>

          <div className="slate-card bg-paper p-6 sm:p-8 lg:col-span-7">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-brand-deep">
                  {t.flow.eyebrow}
                </p>
                <h3 className="mt-2 max-w-xl font-display text-2xl font-bold leading-tight text-ink sm:text-3xl">
                  {t.flow.title}
                </h3>
              </div>
              <WalletCards aria-hidden="true" className="hidden h-8 w-8 shrink-0 text-ink sm:block" />
            </div>

            <div className="mt-8 grid grid-cols-1 gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-3">
              {t.flow.steps.map((step, i) => {
                const Icon = FLOW_ICONS[i];
                return (
                  <div key={step.number} className="bg-paper p-4 sm:p-5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-mono text-xs font-bold text-brand-deep">
                        {step.number}
                      </span>
                      <Icon aria-hidden="true" className="h-4 w-4 text-ink-soft" />
                    </div>
                    <h4 className="mt-5 font-display text-base font-bold text-ink">{step.title}</h4>
                    <p className="mt-1 text-xs leading-5 text-ink-soft">{step.text}</p>
                  </div>
                );
              })}
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm text-ink-soft">
              {t.flow.perks.map((item) => (
                <span key={item} className="flex items-center gap-2">
                  <Check aria-hidden="true" className="h-4 w-4 shrink-0 text-ok" />
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="slate-card overflow-hidden bg-paper lg:col-span-7">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-line px-5 py-4">
              <div>
                <h3 className="font-display text-xl font-bold text-ink">{t.usage.title}</h3>
                <p className="mt-1 text-xs text-ink-soft">{t.usage.sub}</p>
              </div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-brand-deep">
                {t.usage.badge}
              </span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4">
              {VPN_PERIODS.map((periodId, index) => {
                const amount = remoteAccessPriceFcfa(periodId);
                return (
                  <div
                    key={periodId}
                    className={`p-4 sm:p-5 ${index > 0 ? "border-t border-line sm:border-l sm:border-t-0" : ""} ${index > 1 ? "border-t sm:border-t-0" : ""}`}
                  >
                    <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                      {dict.pricing.periods[periodId]}
                    </p>
                    <p className="mt-2 font-display text-2xl font-bold tabular-nums text-ink">
                      {scFromFcfa(amount)}
                    </p>
                    <p className="mt-1 font-mono text-[10px] text-ink-soft">
                      {fcfa.format(amount)} FCFA
                    </p>
                  </div>
                );
              })}
            </div>
            <p className="border-t border-line bg-clay px-5 py-3 text-xs text-ink-soft">
              {t.usage.note}
            </p>
          </div>

          <div className="rounded-2xl bg-brand p-6 lg:col-span-5">
            <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-slate-deep/70">
              {t.setup.eyebrow}
            </p>
            <h3 className="mt-2 font-display text-xl font-bold text-slate-deep">{t.setup.title}</h3>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="border border-slate-deep bg-brand px-3 py-3">
                <p className="text-xs font-semibold text-[#44403C]">{t.setup.hotspotOnly}</p>
                <p className="mt-2 font-display text-2xl font-extrabold text-slate-deep">
                  {scFromFcfa(autoSetupFeeCentsFor(false))}
                </p>
              </div>
              <div className="border border-slate-deep bg-slate-deep px-3 py-3 text-white">
                <p className="text-xs font-semibold text-clay">{t.setup.withContainer}</p>
                <p className="mt-2 font-display text-2xl font-extrabold text-brand">
                  {scFromFcfa(autoSetupFeeCentsFor(true))}
                </p>
              </div>
            </div>
            <Link
              href={localeHref("/auth/register", locale)}
              className="mt-5 inline-flex items-center gap-2 border border-slate-deep bg-slate-deep px-4 py-2.5 text-sm font-bold text-white hover:bg-paper hover:text-ink"
            >
              {t.setup.cta}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <p className="mt-6 max-w-3xl font-mono text-[11px] leading-5 text-ink-soft">
          {t.disclaimer}
        </p>
      </div>
    </section>
  );
}
