import YouTubeEmbed from "./YouTubeEmbed";
import type { Dictionary } from "@/lib/i18n/fr";
import { vendors } from "./content";
import { remoteAccessPriceFcfa } from "@/lib/billing/remote-access-gate-config";
import { AUTO_SETUP_FEE_CENTS, VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";
import { DEFAULT_SC_RATE_FCFA } from "@/lib/safecoin/constants";
import { fcfaToScCents, formatSc } from "@/lib/safecoin/pricing";

const fcfa = new Intl.NumberFormat("fr-FR");
const safecoin = (n: number) => formatSc(fcfaToScCents(n, DEFAULT_SC_RATE_FCFA));

/** Identifiant de la vidéo de présentation (https://youtu.be/uR-7Z_AVhvE). */
const DEMO_VIDEO_ID = "uR-7Z_AVhvE";

/*
 * Section démo : aperçu du tableau de bord avec de VRAIS chiffres (prix
 * importés de la config de facturation, jamais saisis en dur) et la vidéo de
 * présentation. L'emplacement vidéo local (demo-3d.mp4, jamais tourné) est
 * remplacé par le lecteur YouTube en façade.
 */
export default function ProductDemo({ dict }: { dict: Dictionary }) {
  const stats = [
    {
      label: dict.demo.remoteAccess,
      value: `dès ${fcfa.format(remoteAccessPriceFcfa("monthly"))} FCFA`,
      sub: `${safecoin(remoteAccessPriceFcfa("monthly"))} · ${dict.demo.remoteAccessSub}`,
    },
    {
      label: dict.demo.autoSetup,
      // Fourchette réelle : hotspot seul (matériel léger) → stack complète
      // Hotspot + MikHmon (cartes compatibles conteneur).
      value: `${fcfa.format(AUTO_SETUP_FEE_CENTS.hotspotOnly)} – ${fcfa.format(AUTO_SETUP_FEE_CENTS.containerCapable)} FCFA`,
      sub: `${safecoin(AUTO_SETUP_FEE_CENTS.hotspotOnly)} – ${safecoin(AUTO_SETUP_FEE_CENTS.containerCapable)} · ${dict.demo.autoSetupSub}`,
    },
    {
      label: dict.demo.trial,
      value: `${VPN_TRIAL_DAYS} jours`,
      sub: dict.demo.trialSub,
    },
  ];

  return (
    <section id="demo" aria-label={dict.demo.aria} className="border-b border-line bg-clay py-16 sm:py-24">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <span className="slate-eyebrow">{dict.demo.eyebrow}</span>
          <h2 className="mt-5 font-display text-3xl font-bold leading-tight tracking-tight text-ink sm:text-4xl md:text-[2.75rem]">
            {dict.demo.titleA}
            <span className="marker">{dict.demo.titleMark}</span>.
          </h2>
          <p className="mt-4 text-base leading-7 text-ink-soft">
            {dict.demo.lead}
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Aperçu du tableau de bord */}
          <div className="reveal reveal-left slate-card slate-card-raised flex flex-col overflow-hidden bg-paper lg:col-span-7">
            <div className="flex items-center gap-2 border-b border-line bg-clay px-4 py-3">
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#F87171]" />
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#FBBF24]" />
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full bg-[#34D399]" />
              <span className="ml-3 truncate font-mono text-xs text-ink-soft">
                safelinkhub.io/admin
              </span>
            </div>

            <div className="grid flex-1 grid-cols-1 sm:grid-cols-3">
              {stats.map((s, i) => (
                <div
                  key={s.label}
                  className={`p-5 ${i > 0 ? "border-t border-line sm:border-l sm:border-t-0" : ""}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
                    {s.label}
                  </p>
                  {/* Pas de nowrap : une valeur longue (fourchette de prix) se
                      replie dans SA carte au lieu de déborder sur la voisine ;
                      les nombres fr-FR restent insécables. */}
                  <p className="mt-2 font-mono text-lg font-bold tabular-nums text-ink">
                    {s.value}
                  </p>
                  <p className="mt-1 text-xs text-ink-soft">{s.sub}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-t border-line bg-clay px-4 py-3">
              <span className="flex items-center gap-2 text-xs font-medium text-ink-soft">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-brand-deep" />
                {dict.demo.vendorsSupported(vendors.length)}
              </span>
              <span className="text-xs font-medium text-ink-soft">{dict.demo.radius}</span>
            </div>
          </div>

          {/* Vidéo de présentation */}
          <figure className="reveal reveal-right lg:col-span-5">
            <div className="slate-card slate-card-raised overflow-hidden bg-paper">
              <YouTubeEmbed
                videoId={DEMO_VIDEO_ID}
                title={dict.demo.videoTitle}
                playLabel={dict.demo.playLabel(dict.demo.videoTitle)}
                hint={dict.demo.playHint}
              />
            </div>
            <figcaption className="mt-3 flex items-baseline justify-between gap-4">
              <span className="text-sm font-semibold text-ink">
                {dict.demo.videoTitle}
              </span>
              <a
                href="https://youtu.be/uR-7Z_AVhvE"
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 text-xs font-semibold text-brand-deep underline-offset-2 hover:underline"
              >
                {dict.demo.openYoutube}
              </a>
            </figcaption>
          </figure>
        </div>
      </div>
    </section>
  );
}
