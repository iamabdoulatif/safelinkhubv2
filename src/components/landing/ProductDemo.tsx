import SectionHeading from "./SectionHeading";
import { vendors } from "./content";
import { remoteAccessPriceFcfa } from "@/lib/billing/remote-access-gate-config";
import { AUTO_SETUP_FEE_CENTS, VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";
import { fcfaToScCents, formatSc } from "@/lib/safecoin/pricing";

const fcfa = new Intl.NumberFormat("fr-FR");
const safecoin = (n: number) => formatSc(fcfaToScCents(n, DEFAULT_SC_RATE_FCFA));

/*
 * Section démo : aperçu produit avec de VRAIS chiffres (prix réels importés de
 * la config de facturation), pas de données inventées. Emplacement vidéo pour
 * un futur rendu 3D (public/landing/demo-3d.mp4).
 */
export default function ProductDemo() {
  const stats = [
    {
      label: "Accès distant",
      value: `dès ${fcfa.format(remoteAccessPriceFcfa("monthly"))} FCFA`,
      sub: `${safecoin(remoteAccessPriceFcfa("monthly"))} · par service / mois`,
    },
    {
      label: "Auto-setup routeur",
      // Fourchette réelle : hotspot seul (matériel léger) → stack complète
      // Hotspot + MikHmon (cartes compatibles conteneur).
      value: `${fcfa.format(AUTO_SETUP_FEE_CENTS.hotspotOnly)} – ${fcfa.format(AUTO_SETUP_FEE_CENTS.containerCapable)} FCFA`,
      sub: `${safecoin(AUTO_SETUP_FEE_CENTS.hotspotOnly)} – ${safecoin(AUTO_SETUP_FEE_CENTS.containerCapable)} · selon le matériel`,
    },
    {
      label: "Essai offert",
      value: `${VPN_TRIAL_DAYS} jours`,
      sub: "accès distant gratuit dès la création du compte",
    },
  ];

  return (
    <section id="demo" aria-label="Démonstration produit" className="border-b-2 border-line bg-clay py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <SectionHeading index="02" title="Le tableau de bord qui pilote tout." marker="tout" />

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
          {/* Aperçu dashboard encadré */}
          <div className="frame-double bg-paper lg:col-span-7">
            {/* Barre de navigateur */}
            <div className="flex items-center gap-2 border-b-2 border-line bg-ink px-4 py-3">
              <span aria-hidden="true" className="h-2.5 w-2.5 bg-err" />
              <span aria-hidden="true" className="h-2.5 w-2.5 bg-brand" />
              <span aria-hidden="true" className="h-2.5 w-2.5 bg-ok" />
              <span className="ml-3 truncate font-mono text-xs text-clay">
                safelinkhub.io/admin
              </span>
            </div>
            {/* Chiffres réels */}
            <div className="grid grid-cols-1 sm:grid-cols-3">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`p-5 ${i > 0 ? "border-t-2 border-line sm:border-l-2 sm:border-t-0" : ""}`}
                >
                  <p className="font-mono text-[11px] font-semibold uppercase tracking-widest text-ink-soft">
                    {s.label}
                  </p>
                  {/* Pas de nowrap : une valeur longue (fourchette de prix)
                      se replie dans SA carte au lieu de déborder sur la
                      voisine ; les nombres fr-FR restent insécables. */}
                  <p className="mt-2 font-mono text-lg font-bold tabular-nums text-ink sm:text-xl">
                    {s.value}
                  </p>
                  <p className="mt-1 font-mono text-xs font-medium text-ink-soft">{s.sub}</p>
                </div>
              ))}
            </div>
            {/* Barre de statut — faits produit réels */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t-2 border-line bg-ink px-4 py-2.5">
              <span className="flex items-center gap-1.5 font-mono text-xs text-clay">
                <span aria-hidden="true" className="iso-led h-1.5 w-1.5 bg-brand" />
                {vendors.length} constructeurs pris en charge
              </span>
              <span className="font-mono text-xs text-clay">Noyau RADIUS cloud inclus</span>
            </div>
          </div>

          {/* Emplacement vidéo 3D */}
          <figure className="lg:col-span-5">
            <div className="border-2 border-line bg-ink">
              <video
                className="aspect-video w-full object-cover"
                controls
                preload="none"
                poster="/landing/demo-poster.svg"
              >
                <source src="/landing/demo-3d.mp4" type="video/mp4" />
                Votre navigateur ne prend pas en charge la vidéo.
              </video>
            </div>
            <figcaption className="mt-3 flex items-baseline justify-between gap-4">
              <span className="text-sm font-semibold text-ink">
                SafeLinkHub × MikroTik en 60 secondes
              </span>
              <span className="font-mono text-[11px] uppercase tracking-widest text-ink-soft">
                Vidéo
              </span>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
