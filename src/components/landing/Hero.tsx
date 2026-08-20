import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { vendors } from "./content";

/* Hero Slate : titre centré avec un mot au surligneur, capture e-mail, et
 * cartes de statistiques flottantes de part et d'autre.
 *
 * Les cartes sont STATIQUES — la scène isométrique animée (IsoRouterScene,
 * sept animations CSS en boucle) a été retirée avec le reste des animations
 * de la landing. Elles sont masquées sous xl : superposées au titre sur un
 * écran étroit, elles le rendraient illisible. */

const bars = [34, 52, 41, 68, 57, 79, 62, 88, 71, 94];

function MiniChart() {
  return (
    <div aria-hidden="true" className="flex h-16 items-end gap-1">
      {bars.map((h, i) => (
        <span
          key={i}
          className={`w-2 rounded-sm ${i === bars.length - 1 ? "bg-slate-deep" : "bg-brand"}`}
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}

function FloatCard({
  label,
  value,
  sub,
  children,
  className = "",
}: {
  label: string;
  value?: string;
  sub?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`slate-card slate-card-raised w-56 bg-paper p-4 ${className}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">{label}</p>
      {value ? (
        <p className="mt-1.5 font-mono text-xl font-bold tabular-nums text-ink">{value}</p>
      ) : null}
      {children}
      {sub ? <p className="mt-1.5 text-xs text-ink-soft">{sub}</p> : null}
    </div>
  );
}

export default function Hero() {
  return (
    <section aria-label="Présentation" className="relative overflow-hidden border-b border-line bg-paper">
      <div className="mx-auto max-w-6xl px-4 pb-16 pt-14 sm:px-6 sm:pb-20 sm:pt-20">
        {/* Cartes flottantes — décoratives, hors du flux, jamais lues */}
        <div aria-hidden="true" className="pointer-events-none hidden xl:block">
          <FloatCard
            label="Revenus 30 jours"
            className="absolute left-2 top-28 2xl:left-16"
          >
            <MiniChart />
            <p className="mt-2 font-mono text-base font-bold tabular-nums text-ink">18 742 000 FCFA</p>
          </FloatCard>
          <FloatCard
            label="Uptime du parc"
            value="99,2 %"
            sub="11 routeurs en ligne sur 14"
            className="absolute bottom-16 left-6 2xl:left-24"
          />
          <FloatCard
            label="Sessions actives"
            value="1 842"
            sub="pic à 2 106 vers 20 h"
            className="absolute right-2 top-28 2xl:right-16"
          />
          <FloatCard
            label="Encaissé aujourd'hui"
            value="486 500"
            sub="Orange Money · Wave · MTN · Moov"
            className="absolute bottom-16 right-6 2xl:right-24"
          />
        </div>

        {/* Bloc central */}
        <div className="relative mx-auto max-w-3xl text-center">
          <span className="slate-eyebrow">Facturation hotspot · Automatisation FAI</span>

          <h1 className="mt-6 font-display text-[2.25rem] font-bold leading-[1.06] tracking-tight text-ink sm:text-5xl md:text-6xl">
            Votre réseau. Vos revenus.{" "}
            <span className="marker">Automatisés.</span>
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
            Plan gratuit · Aucune carte bancaire requise
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
      </div>

      {/* Bande de compatibilité constructeurs */}
      <div className="border-t border-line bg-clay">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Compatible avec
          </p>
          {vendors.map((v) => (
            <span key={v} translate="no" className="text-sm font-medium text-ink">
              {v}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
