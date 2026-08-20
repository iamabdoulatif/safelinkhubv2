import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Check, Plus } from "lucide-react";

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

const provisioning = [
  "Hotspot, PPPoE et profils de forfaits créés en une passe",
  "Portail captif installé et relié à vos tarifs",
  "Expiration et coupure automatiques à échéance",
  "Tunnel de supervision monté sans ouvrir de port",
];

const operators = [
  {
    name: "Orange Money",
    detail:
      "Encaissement direct depuis le portail captif. Le forfait s'active dès la confirmation de l'opérateur, sans intervention.",
  },
  {
    name: "MTN MoMo",
    detail:
      "Même parcours, même réconciliation. Chaque transaction est rapprochée du voucher qu'elle a payé.",
  },
  {
    name: "Wave",
    detail:
      "Les frais réduits de Wave se répercutent sur votre marge : le montant net est celui qui remonte au tableau de bord.",
  },
  {
    name: "Moov Money",
    detail:
      "Couverture complète des quatre opérateurs ivoiriens, sans agrégateur intermédiaire à rémunérer.",
  },
];

/** Bloc 1 — texte à gauche, aperçu de provisionnement à droite. */
export function FeatureProvisioning() {
  return (
    <section aria-label="Provisionnement automatique" className="border-b border-line bg-paper py-16 sm:py-24">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 sm:px-6 lg:grid-cols-12 lg:gap-14">
        <div className="reveal reveal-left lg:col-span-6">
          <span className="slate-eyebrow">Provisionnement</span>
          <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            <span className="marker">Provisionnez</span> sans y penser.
          </h2>
          <p className="mt-4 text-base leading-7 text-ink-soft">
            Chaque client acheté est créé, limité, facturé puis expiré tout seul.
            Vous ne touchez plus à Winbox pour vendre une journée d&apos;internet.
          </p>
          <ul role="list" className="mt-7 space-y-3">
            {provisioning.map((item) => (
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
          <Link href="/auth/register" className="inline-flex items-center justify-center gap-2 slate-btn slate-btn-dark mt-8 px-6 py-3 text-sm">
            Connecter un routeur
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
                Installation en cours
              </p>
              <p className="mt-1 font-mono text-sm font-bold text-ink">HSPT-NAMOIN · hAP ax³</p>
            </div>
            <ol className="divide-y divide-line">
              {[
                ["Connexion à l'API RouterOS", "0,8 s"],
                ["Serveur hotspot + pool DHCP", "1,2 s"],
                ["6 profils de forfaits posés", "2,4 s"],
                ["Portail captif installé", "3,1 s"],
                ["Tunnel de supervision monté", "4,0 s"],
              ].map(([step, time]) => (
                <li key={step} className="flex items-center gap-3 px-5 py-3">
                  <span
                    aria-hidden="true"
                    className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand text-slate-deep"
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                  </span>
                  <span className="flex-1 text-sm text-ink">{step}</span>
                  <span className="font-mono text-xs tabular-nums text-ink-soft">{time}</span>
                </li>
              ))}
            </ol>
            <div className="flex items-center justify-between bg-clay px-5 py-3">
              <span className="text-sm font-semibold text-ink">Routeur prêt à vendre</span>
              <span className="font-mono text-xs font-bold tabular-nums text-brand-deep">4,0 s</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Bloc 2 — visuel à gauche, accordéon des opérateurs à droite. */
export function FeatureMobileMoney() {
  return (
    <section aria-label="Encaissement mobile money" className="border-b border-line bg-clay py-16 sm:py-24">
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
                Aperçu de la console
              </span>
              <span className="rounded-full bg-paper px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-ink-soft">
                Exemple
              </span>
            </div>
            <div className="flex items-baseline justify-between border-b border-line px-5 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                Encaissé aujourd&apos;hui
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
              Réconciliation automatique&nbsp;: chaque paiement est rattaché au forfait qu&apos;il ouvre.
            </p>
          </div>
        </div>

        <div className="reveal reveal-right lg:col-span-6 lg:order-2">
          <span className="slate-eyebrow">Paiements</span>
          <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl">
            Les quatre opérateurs, <span className="marker">un seul flux</span>.
          </h2>
          <p className="mt-4 text-base leading-7 text-ink-soft">
            Vos clients paient avec ce qu&apos;ils ont déjà dans la poche. Vous ne
            gérez qu&apos;un seul journal de recettes.
          </p>
          {/* Accordéon natif : <details> ne demande aucun JavaScript et reste
              ouvrable au clavier — cohérent avec une landing sans animations. */}
          <div className="mt-7 divide-y divide-line border-y border-line">
            {operators.map((o) => (
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
