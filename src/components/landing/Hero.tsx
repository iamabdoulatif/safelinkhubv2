import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import VendorMarquee from "./VendorMarquee";
import { type PlatformStats } from "@/lib/landing/platform-stats";
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
 * La scène reste CSS-only : sous xl elle revient dans le flux après le CTA,
 * ce qui évite tout recouvrement du message commercial. */

function OrbitMetric({
  label,
  value,
  sub,
  countTo,
  className,
}: {
  label: string;
  value?: string;
  sub: string;
  /** Cible du compteur. Absent = le chiffre s'affiche tel quel. */
  countTo?: number;
  className: string;
}) {
  return (
    <div className={`hero-orbit-metric ${className}`}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-soft">{label}</dt>
      {value ? (
        <dd
          className={`mt-1 font-mono text-xl font-bold tabular-nums text-ink${countTo ? " countup" : ""}`}
          {...(countTo ? { "data-countup": String(countTo) } : {})}
        >
          {value}
        </dd>
      ) : null}
      <p className="mt-1 text-xs leading-5 text-ink-soft">{sub}</p>
    </div>
  );
}

function OrbitScene({ stats }: { stats: PlatformStats }) {
  return (
    <div className="hero-orbit-scene">
      <div aria-hidden="true" className="hero-orbit-grid" />
      <div className="hero-orbit-router">
        <div aria-hidden="true" className="hero-orbit-router-shadow" />
        <Image
          src="/mikrotik/chato.webp"
          alt="Routeur MikroTik Chateau Pro géré dans SafeLinkHub"
          width={1200}
          height={1200}
          preload
          sizes="(min-width: 1280px) 34rem, (min-width: 640px) 30rem, 92vw"
          className="hero-orbit-image"
        />
      </div>

      <dl className="hero-orbit-metrics">
        <OrbitMetric
          label="Routeurs supervisés"
          value={stats.routers > 0 ? nf.format(stats.routers) : undefined}
          countTo={stats.routers > 0 ? stats.routers : undefined}
          sub="parc total sur la plateforme"
          className="hero-orbit-metric-routers"
        />
        <OrbitMetric
          label="Sessions en cours"
          value={stats.sessions > 0 ? nf.format(stats.sessions) : undefined}
          countTo={stats.sessions > 0 ? stats.sessions : undefined}
          sub="sur les routeurs joignables"
          className="hero-orbit-metric-sessions"
        />
        <OrbitMetric
          label="Essai offert"
          value={`${VPN_TRIAL_DAYS} jours`}
          sub="accès distant, sans carte bancaire"
          className="hero-orbit-metric-trial"
        />
        <OrbitMetric
          label="Mobile money"
          value={String(stats.mobileMoney.length)}
          sub={stats.mobileMoney.join(" · ")}
          className="hero-orbit-metric-money"
        />
      </dl>
    </div>
  );
}

export default function Hero({ stats }: { stats: PlatformStats }) {
  return (
    <section aria-label="Présentation" className="relative overflow-hidden border-b border-line bg-paper">
      <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        {/* Bloc central */}
        <div className="hero-seq relative z-10 mx-auto max-w-3xl text-center">
          <span className="slate-eyebrow">Facturation hotspot · Automatisation FAI</span>

          <h1 className="mt-6 font-display text-[2.25rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl md:text-6xl">
            Votre réseau. Vos revenus.{" "}
            <span className="marker marker-sweep">Automatisés.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-ink-soft sm:text-lg">
            La plateforme d&apos;automatisation Hotspot et FAI la plus avancée&nbsp;:
            facturation mobile money, provisionnement MikroTik et surveillance
            temps réel, depuis un seul tableau de bord.
          </p>

          {/* Capture e-mail — l'inscription se termine sur /auth/register, qui
              pré-remplit le champ à partir du paramètre d'URL. */}
          <form
            action="/auth/register"
            method="get"
            className="mx-auto mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row"
          >
            <label htmlFor="hero-email" className="sr-only">
              Adresse e-mail professionnelle
            </label>
            <input
              id="hero-email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="vous@votre-reseau.ci"
              className="min-w-0 flex-1 rounded-full border border-line bg-paper px-5 py-3 text-sm text-ink placeholder:text-ink-soft focus:border-slate-deep focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <button type="submit" className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-primary px-6 py-3 text-sm">
              Démarrer gratuitement
              <ArrowRight aria-hidden="true" className="h-4 w-4" />
            </button>
          </form>

          <p className="mt-3 text-xs text-ink-soft">
            {/* Un SEUL nœud texte : ce Next avale l'espace entre {expr} et le
                texte adjacent au rendu serveur. Même contournement qu'ailleurs. */}
            {`Plan gratuit · ${VPN_TRIAL_DAYS} jours d'accès distant offerts · sans carte bancaire`}
          </p>

          <div className="mt-6 flex justify-center">
            <Link
              href="#demo"
              className="text-sm font-semibold text-brand-deep underline-offset-4 hover:underline"
            >
              Voir le tableau de bord en 60 secondes
            </Link>
          </div>
        </div>

        <OrbitScene stats={stats} />
      </div>

      {/* Bande de compatibilité constructeurs — logos défilants */}
      <VendorMarquee />

    </section>
  );
}
