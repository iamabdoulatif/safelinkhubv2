import Link from "next/link";
import IsoRouterScene from "./IsoRouterScene";
import { vendors } from "./content";

export default function Hero() {
  return (
    <section aria-label="Présentation" className="border-b-2 border-line bg-paper">
      <div className="mx-auto grid max-w-6xl grid-cols-1 items-center gap-10 px-4 pb-14 pt-12 sm:px-6 lg:grid-cols-12 lg:gap-6 lg:pt-20">
        {/* Titre massif, aligné à gauche */}
        <div className="lg:col-span-7">
          <p className="font-mono text-xs font-medium uppercase tracking-widest text-ink-soft">
            Facturation hotspot · Automatisation FAI
          </p>
          <h1 className="mt-5 font-display text-[2rem] font-extrabold leading-[1.08] tracking-tight text-ink sm:text-5xl sm:leading-[1.05] md:text-6xl xl:text-7xl">
            Votre réseau.
            <br />
            Vos revenus.
            <br />
            <span className="marker">Automatisés.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-ink-soft">
            SafeLinkHub est la plateforme d&apos;automatisation Hotspot et FAI la plus
            avancée : facturation mobile money, provisionnement MikroTik et
            surveillance temps réel, depuis un seul tableau de bord.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/auth/register"
              className="border-2 border-line bg-brand px-7 py-3.5 text-center text-base font-bold text-[#1C1917] hover:bg-ink hover:text-paper"
            >
              Démarrer gratuitement
            </Link>
            <a
              href="#demo"
              className="border-2 border-line px-7 py-3.5 text-center text-base font-bold text-ink hover:bg-clay"
            >
              Voir la démo
            </a>
          </div>
          <p className="mt-4 font-mono text-xs text-ink-soft">
            Plan gratuit · Aucune carte bancaire requise
          </p>
        </div>

        {/* Scène isométrique animée */}
        <div className="lg:col-span-5 lg:flex lg:justify-end lg:pt-20 xl:-mr-24 xl:pt-16">
          <IsoRouterScene className="mx-auto w-full max-w-md lg:mx-0 lg:max-w-[25rem] xl:max-w-[31rem]" />
        </div>
      </div>

      {/* Bande de compatibilité constructeurs */}
      <div className="border-t-2 border-line bg-clay">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-4 sm:px-6">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
            Compatible avec
          </p>
          {vendors.map((v) => (
            <span
              key={v}
              translate="no"
              className="font-mono text-xs font-medium text-ink"
            >
              {v}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
