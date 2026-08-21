import Link from "next/link";
import { ArrowRight } from "lucide-react";
import VendorMarquee from "./VendorMarquee";
import { MikrotikOrbitScene } from "./MikrotikOrbitScene";
import { type PlatformStats } from "@/lib/landing/platform-stats";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";
import { VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";

const nf = new Intl.NumberFormat("fr-FR");

/* Hero Slate : titre centré avec un mot au surligneur, capture e-mail, et
 * scène MikroTik réelle qui répond aux faits produit de part et d'autre.
 *
 * LES CHIFFRES SONT RÉELS. Ces cartes ont affiché pendant plusieurs jours des
 * montants de maquette — 18 742 000 FCFA sur trente jours, 486 500 le jour même
 * — alors que la base en comptait 1 750 et zéro. Elles ne portent plus AUCUN
 * montant : deux volumes mesurés (routeurs supervisés, sessions en cours) et
 * deux faits produit vérifiables (constructeurs, opérateurs mobile money).
 * Voir lib/landing/platform-stats.ts.
 *
 * La scène devient un canvas Three.js décoratif et transparent sur desktop,
 * puis revient dans le flux sous le CTA sur mobile. Les faits restent du HTML
 * lisible au-dessus de la scène. */

export default function Hero({
  dict,
  locale,
  stats,
}: {
  dict: Dictionary;
  locale: Locale;
  stats: PlatformStats;
}) {
  return (
    <section aria-label={dict.hero.eyebrow} className="relative overflow-hidden border-b border-line bg-paper">
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        <div className="hero-layout">
          {/* Le message reste premier dans le DOM : mobile et lecteurs d'écran
              le rencontrent avant l'animation. */}
          <div className="hero-seq relative z-10 mx-auto max-w-3xl text-center lg:mx-0 lg:max-w-xl lg:text-left">
            <span className="slate-eyebrow">{dict.hero.eyebrow}</span>

            <h1 className="mt-6 font-display text-[2.25rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl md:text-6xl">
              {dict.hero.titleA}
              <span className="marker marker-sweep">{dict.hero.titleMark}</span>
            </h1>

            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-ink-soft sm:text-lg lg:mx-0">
            {dict.hero.lead}
            </p>

            {/* Capture e-mail — l'inscription se termine sur /auth/register, qui
                pré-remplit le champ à partir du paramètre d'URL. */}
            <form
              action={localeHref("/auth/register", locale)}
              method="get"
              className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row lg:mx-0"
            >
              <label htmlFor="hero-email" className="sr-only">
              {dict.hero.emailLabel}
              </label>
              <input
                id="hero-email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={dict.hero.emailPlaceholder}
                className="min-w-0 flex-1 rounded-full border border-line bg-paper px-5 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <button type="submit" className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary px-6 py-3 text-sm">
              {dict.hero.submit}
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </form>

            <p className="mt-3 text-xs text-ink-soft">
              {/* Un SEUL nœud texte : ce Next avale l'espace entre {expr} et le
                  texte adjacent au rendu serveur. Même contournement qu'ailleurs. */}
              {dict.hero.microcopy(VPN_TRIAL_DAYS)}
            </p>

            <div className="mt-6 flex justify-center lg:justify-start">
              <Link
                href="#demo"
                className="text-sm font-semibold text-brand-deep underline-offset-4 hover:underline"
              >
              {dict.hero.watch}
              </Link>
            </div>
          </div>

          <MikrotikOrbitScene
            routerAlt={dict.hero.routerAlt}
            routerLabel={dict.hero.cards.routers}
            routerValue={stats.routers > 0 ? nf.format(stats.routers) : undefined}
            routerCountTo={stats.routers > 0 ? stats.routers : undefined}
            routerSub={dict.hero.cards.routersSub}
            sessionLabel={dict.hero.cards.sessions}
            sessionValue={stats.sessions > 0 ? nf.format(stats.sessions) : undefined}
            sessionCountTo={stats.sessions > 0 ? stats.sessions : undefined}
            sessionSub={dict.hero.cards.sessionsSub}
            trialLabel={dict.hero.cards.trial}
            trialValue={dict.hero.cards.trialValue(VPN_TRIAL_DAYS)}
            trialSub={dict.hero.cards.trialSub}
            mobileMoneyLabel={dict.hero.cards.mobileMoney}
            mobileMoneyValue={String(stats.mobileMoney.length)}
            mobileMoneySub={stats.mobileMoney.join(" · ")}
          />
        </div>
      </div>

      {/* Bande de compatibilité constructeurs — logos défilants */}
      <VendorMarquee dict={dict} />

    </section>
  );
}
