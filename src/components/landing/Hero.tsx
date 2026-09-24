import Image from "next/image";
import Link from "next/link";
import { ArrowRight, PlayCircle } from "lucide-react";
import VendorMarquee from "./VendorMarquee";
import { type PlatformStats } from "@/lib/landing/platform-stats";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";
import { VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";

const nf = new Intl.NumberFormat("fr-FR");

/* Hero « SaaS 2026 » : titre centré, capture e-mail, puis le PRODUIT lui-même
 * — une console du parc de routeurs, avec les vraies photos de modèles.
 *
 * LES CHIFFRES SONT RÉELS. Les cartes du hero ont affiché pendant plusieurs
 * jours des montants de maquette alors que la base comptait presque zéro. La
 * bande de chiffres ne porte AUCUN montant : deux volumes mesurés (routeurs
 * supervisés, sessions en cours), masqués si la base n'a pas répondu, et deux
 * faits produit (essai, opérateurs mobile money). Voir platform-stats.ts.
 *
 * La console est une illustration de l'interface (noms de zones fictifs, aucun
 * chiffre d'affaires) : elle est marquée comme telle et masquée aux lecteurs
 * d'écran, qui ont déjà le texte. */

/** Lignes de l'aperçu. Photos de public/mikrotik ; charge en pourcentage. */
const APERCU = [
  { name: "ZONE-MARCHE", model: "hAP ax²", img: "/mikrotik/hap-ax2.webp", status: "online", cpu: 18 },
  { name: "CAMPUS-NORD", model: "RB5009", img: "/mikrotik/rb5009.webp", status: "online", cpu: 42 },
  { name: "RESIDENCE-B", model: "Chateau Pro", img: "/mikrotik/chato.webp", status: "online", cpu: 27 },
  { name: "KIOSQUE-GARE", model: "hAP be lite", img: "/mikrotik/hap-be-lite.webp", status: "setup", cpu: 9 },
] as const;

export default function Hero({
  dict,
  locale,
  stats,
}: {
  dict: Dictionary;
  locale: Locale;
  stats: PlatformStats;
}) {
  const t = dict.hero;
  const chiffres = [
    {
      label: t.cards.routers,
      value: stats.routers > 0 ? nf.format(stats.routers) : undefined,
      sub: t.cards.routersSub,
    },
    {
      label: t.cards.sessions,
      value: stats.sessions > 0 ? nf.format(stats.sessions) : undefined,
      sub: t.cards.sessionsSub,
    },
    { label: t.cards.trial, value: t.cards.trialValue(VPN_TRIAL_DAYS), sub: t.cards.trialSub },
    {
      label: t.cards.mobileMoney,
      value: String(stats.mobileMoney.length),
      sub: stats.mobileMoney.join(" · "),
    },
  ].filter((c) => c.value !== undefined);

  return (
    <section aria-label={t.eyebrow} className="relative overflow-hidden border-b border-line bg-paper">
      {/* Trame discrète derrière le titre — pas de dégradé de couleur. */}
      <div aria-hidden="true" className="hero-grid pointer-events-none absolute inset-x-0 top-0 h-[36rem]" />

      <div className="relative mx-auto max-w-6xl px-4 pb-14 pt-12 sm:px-6 sm:pb-20 sm:pt-20">
        <div className="hero-seq mx-auto max-w-3xl text-center">
          <span className="slate-eyebrow">{t.eyebrow}</span>

          <h1 className="mt-5 text-balance font-display text-[2.25rem] font-bold leading-[1.05] tracking-tight text-ink sm:mt-6 sm:text-6xl md:text-7xl">
            {t.titleA}
            <span className="marker marker-sweep">{t.titleMark}</span>
          </h1>

          <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-ink-soft sm:mt-6 sm:text-lg">
            {t.lead}
          </p>

          {/* Capture e-mail — l'inscription se termine sur /auth/register, qui
              pré-remplit le champ à partir du paramètre d'URL. */}
          <form
            action={localeHref("/auth/register", locale)}
            method="get"
            className="mx-auto mt-8 flex w-full max-w-lg flex-col gap-2 rounded-full sm:flex-row sm:border sm:border-line sm:bg-paper sm:p-1.5 sm:shadow-menu"
          >
            <label htmlFor="hero-email" className="sr-only">
              {t.emailLabel}
            </label>
            <input
              id="hero-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder={t.emailPlaceholder}
              className="min-h-12 min-w-0 flex-1 rounded-full border border-line bg-paper px-5 text-sm text-ink placeholder:text-ink-soft focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand sm:border-transparent"
            />
            <button
              type="submit"
              className="inline-flex min-h-12 items-center justify-center gap-2 slate-btn slate-btn-primary px-6 text-sm"
            >
              {t.submit}
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-3 text-xs text-ink-soft">
            {/* Un SEUL nœud texte : ce Next avale l'espace entre {expr} et le
                texte adjacent au rendu serveur. */}
            {t.microcopy(VPN_TRIAL_DAYS)}
          </p>

          <div className="mt-4 flex justify-center">
            <Link
              href="#demo"
              className="inline-flex items-center gap-2 py-2 text-sm font-semibold text-ink underline-offset-4 hover:underline"
            >
              <PlayCircle aria-hidden="true" className="h-4 w-4 text-brand-deep" />
              {t.watch}
            </Link>
          </div>
        </div>

        {/* Console produit */}
        <figure className="reveal reveal-scale relative mx-auto mt-12 max-w-5xl sm:mt-16">
          <div
            aria-hidden="true"
            className="overflow-hidden rounded-2xl border border-line bg-paper shadow-modal"
          >
            <div className="flex h-10 items-center gap-2 border-b border-line bg-clay px-4">
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="h-2.5 w-2.5 rounded-full bg-line-strong" />
              <span className="ml-3 truncate rounded-md bg-paper px-3 py-0.5 font-mono text-[11px] text-ink-soft">
                safelinkhub.io/admin/router
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-[13rem_minmax(0,1fr)]">
              <div className="hidden border-r border-line bg-clay/60 p-4 md:block">
                <p className="font-display text-sm font-bold text-ink">SafeLinkHub</p>
                <ul className="mt-5 space-y-1 text-[13px]">
                  {t.console.nav.map((item, i) => (
                    <li
                      key={item}
                      className={`rounded-md px-2.5 py-1.5 ${i === 1 ? "bg-paper font-semibold text-ink shadow-menu" : "text-ink-soft"}`}
                    >
                      {item}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="min-w-0 p-4 text-left sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-display text-lg font-bold text-ink">{t.console.title}</p>
                  <span className="inline-flex h-8 items-center rounded-full bg-slate-deep px-3.5 text-xs font-semibold text-white">
                    {t.console.action}
                  </span>
                </div>

                <ul className="mt-5 divide-y divide-line-soft rounded-xl border border-line">
                  {APERCU.map((r) => {
                    const online = r.status === "online";
                    return (
                      <li key={r.name} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
                        <Image
                          src={r.img}
                          alt=""
                          width={40}
                          height={40}
                          className="h-9 w-9 shrink-0 rounded-lg border border-line-soft bg-clay object-contain p-0.5"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                          <span className="block truncate text-xs text-ink-soft">{r.model}</span>
                        </span>
                        <span
                          className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${
                            online ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${online ? "bg-ok" : "bg-warn"}`} />
                          {online ? t.console.online : t.console.setup}
                        </span>
                        <span className="hidden w-24 shrink-0 items-center gap-2 sm:flex">
                          <span className="h-1.5 w-10 overflow-hidden rounded-full bg-line-soft">
                            <span className="block h-full rounded-full bg-brand-deep" style={{ width: `${r.cpu}%` }} />
                          </span>
                          <span className="text-xs tabular-nums text-ink-soft">{r.cpu} %</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
          <figcaption className="mt-3 text-center text-xs text-ink-soft">{t.console.caption}</figcaption>
        </figure>

        {/* Chiffres réels — aucun montant. */}
        {/* Flex et non grille : un volume masqué ne laisse pas de case vide. */}
        <dl className="mx-auto mt-12 flex max-w-5xl flex-wrap gap-px overflow-hidden rounded-2xl border border-line bg-line">
          {chiffres.map((c) => (
            <div key={c.label} className="min-w-0 flex-1 basis-[11rem] bg-paper px-5 py-5">
              <dt className="text-xs font-medium text-ink-soft">{c.label}</dt>
              <dd className="mt-1 font-display text-2xl font-bold tabular-nums text-ink sm:text-3xl">{c.value}</dd>
              <dd className="mt-1 truncate text-xs text-ink-soft">{c.sub}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Bande de compatibilité constructeurs — logos défilants */}
      <VendorMarquee dict={dict} />
    </section>
  );
}
