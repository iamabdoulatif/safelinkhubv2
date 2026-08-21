import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";

/* Les deux sections alternées de Slate : texte + visuel, puis visuel + texte.
 * Regroupées dans un seul fichier parce qu'elles partagent la même grille et
 * ne servent qu'ici — deux composants exportés, un seul endroit à ouvrir.
 *
 * PHOTOS : Slate pose une photo par section, avec une carte de données qui la
 * chevauche. Même dispositif ici. Les images viennent de Pexels (licence
 * commerciale libre, sans attribution obligatoire) et sont AUTO-HÉBERGÉES dans
 * public/landing/photos — pas de hotlink vers leur CDN, qui imposerait d'ouvrir
 * images.remotePatterns et casserait le jour où l'URL change.
 *
 * `alt=""` est délibéré : ces photos illustrent, elles n'informent pas. Les
 * annoncer à un lecteur d'écran ajouterait du bruit avant le texte qui, lui,
 * porte le contenu. */

/** Bloc 1 — texte à gauche, aperçu de provisionnement à droite. */
/** Durées de l'aperçu d'installation. Nombres et non chaînes : le séparateur
 *  décimal change de langue (0,8 s en français, 0.8 s en anglais). */
const STEP_SECONDS = [0.8, 1.2, 2.4, 3.1, 4.0];

export function FeatureProvisioning({ dict, locale }: { dict: Dictionary; locale: Locale }) {
  const secondes = new Intl.NumberFormat(locale, { minimumFractionDigits: 1 });
  return (
    <section aria-label={dict.provisioning.aria} className="border-b border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-14">
        <div className="reveal reveal-left lg:col-span-6">
          <span className="slate-eyebrow">{dict.provisioning.eyebrow}</span>
          <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            <span className="marker">{dict.provisioning.titleMark}</span>
            {dict.provisioning.titleRest}
          </h2>
          <p className="mt-4 text-base leading-7 text-ink-soft">
            {dict.provisioning.lead}
          </p>
          <ul role="list" className="mt-7 space-y-3">
            {dict.provisioning.points.map((item) => (
              <li key={item} className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-slate-deep"
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="text-sm leading-6 text-ink">{item}</span>
              </li>
            ))}
          </ul>
          <Link href={localeHref("/auth/register", locale)} className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-dark mt-8 px-6 py-3 text-sm">
            {dict.provisioning.cta}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </Link>
        </div>

        <div className="reveal reveal-right lg:col-span-6">
          <div className="overflow-hidden rounded-2xl">
            <Image
              src="/landing/photos/technicien-carte.jpg"
              alt=""
              width={1400}
              height={1050}
              sizes="(min-width: 1024px) 33rem, 100vw"
              className="h-56 w-full object-cover sm:h-64"
            />
          </div>
          <div className="slate-card slate-card-raised relative mx-4 -mt-10 overflow-hidden bg-paper">
            <div className="border-b border-line px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                {dict.provisioning.cardTitle}
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-ink">HSPT-NAMOIN · hAP ax³</p>
            </div>
            <ol className="divide-y divide-line">
              {dict.provisioning.steps.map((step, i) => (
                <li key={step} className="flex items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-slate-deep"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="flex-1 text-sm text-ink">{step}</span>
                  <span className="font-mono text-xs tabular-nums text-ink-soft">{`${secondes.format(STEP_SECONDS[i])} s`}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between bg-clay px-5 py-3">
              <span className="text-sm font-semibold text-ink">{dict.provisioning.done}</span>
              <span className="font-mono text-xs font-bold tabular-nums text-brand-deep">{`${secondes.format(STEP_SECONDS[STEP_SECONDS.length - 1])} s`}</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Bloc 2 — visuel à gauche, accordéon des opérateurs à droite. */
export function FeatureMobileMoney({ dict }: { dict: Dictionary }) {
  return (
    <section aria-label={dict.payments.aria} className="border-b border-line bg-clay py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-14">
        <div className="reveal reveal-left lg:col-span-6 lg:order-1">
          <div className="overflow-hidden rounded-2xl">
            <Image
              src="/landing/photos/antennes-toit.jpg"
              alt=""
              width={1400}
              height={2489}
              sizes="(min-width: 1024px) 33rem, 100vw"
              className="h-44 w-full object-cover object-center sm:h-52"
            />
          </div>
          <div className="slate-card slate-card-raised relative mx-4 -mt-10 overflow-hidden bg-paper">
            {/* APERÇU D'INTERFACE, pas un chiffre de plateforme. La distinction
                compte : les mêmes montants affichés en cartes flottantes dans le
                hero laissaient croire à des recettes réelles — ils ont été
                retirés. Ici ils illustrent une console, et l'étiquette le dit
                pour qu'aucun visiteur n'ait à le deviner. */}
            <div className="flex items-center justify-between gap-3 border-b border-line bg-clay px-5 py-2.5">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                {dict.payments.preview}
              </span>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                {dict.payments.example}
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                {dict.payments.collectedToday}
              </p>
              <p className="font-mono text-xl font-bold tabular-nums text-ink">486 500 FCFA</p>
            </div>
            <ul role="list" className="divide-y divide-line">
              {[
                ["Orange Money", "+225 07 48 22 91", "2 500"],
                ["Wave", "+225 01 03 77 40", "700"],
                ["MTN MoMo", "+225 05 91 66 18", "5 000"],
                ["Moov Money", "+225 01 55 09 73", "200"],
              ].map(([op, phone, amount]) => (
                <li key={phone} className="flex items-center gap-3 px-5 py-3.5">
                  <span className="flex-1">
                    <span className="block text-sm font-semibold text-ink">{op}</span>
                    <span className="block font-mono text-xs text-ink-soft">{phone}</span>
                  </span>
                  <span className="font-mono text-sm font-bold tabular-nums text-ink">
                    {amount}
                    <span className="ml-1 text-[11px] font-medium text-ink-soft">FCFA</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="bg-clay px-5 py-3 text-xs text-ink-soft">
              {dict.payments.reconciled}
            </p>
          </div>
        </div>

        <div className="reveal reveal-right lg:col-span-6 lg:order-2">
          <span className="slate-eyebrow">{dict.payments.eyebrow}</span>
          <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            {dict.payments.titleA}
            <span className="marker">{dict.payments.titleMark}</span>.
          </h2>
          <p className="mt-4 text-base leading-7 text-ink-soft">
            {dict.payments.lead}
          </p>
          {/* Accordéon natif : <details> ne demande aucun JavaScript et reste
              ouvrable au clavier — cohérent avec une landing sans animations. */}
          <div className="mt-7 divide-y divide-line border-y border-line">
            {dict.payments.operators.map((o) => (
              <details key={o.name} className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-sm font-semibold text-ink">
                  {o.name}
                  <Plus
                    aria-hidden="true"
                    className="h-4 w-4 shrink-0 text-ink-soft group-open:rotate-45"
                  />
                </summary>
                <p className="pb-4 text-sm leading-6 text-ink-soft">{o.detail}</p>
              </details>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
