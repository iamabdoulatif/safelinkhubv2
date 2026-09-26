import { ArrowRight } from "lucide-react";
import VendorMarquee from "./VendorMarquee";
import ScrollFilm from "./ScrollFilm";
import { type PlatformStats } from "@/lib/landing/platform-stats";
import type { Dictionary } from "@/lib/i18n/fr";
import { type Locale, localeHref } from "@/lib/i18n/config";
import { VPN_TRIAL_DAYS } from "@/lib/billing/auto-setup-pricing";

const nf = new Intl.NumberFormat("fr-FR");

/** Film du hero (public/landing/control-room) : séquence d'images pour le
 *  scroll desktop, vidéo maître pour le mobile, affiche pour le reste. */
const FILM = {
  frameCount: 144,
  framePath: "/landing/control-room/frames/{i}.webp",
  poster: "/landing/control-room/poster.jpg",
  videoMp4: "/landing/control-room/film.mp4",
  videoWebm: "/landing/control-room/film.webm",
  videoMp4Small: "/landing/control-room/film-720.mp4",
  videoWebmSmall: "/landing/control-room/film-720.webm",
};

/* Hero « Control Room » : un MikroTik hAP ax³ filmé, qui s'allume, montre ses
 * ports puis devient le nœud d'un réseau multi-sites — au rythme du scroll.
 *
 * LES CHIFFRES SONT RÉELS. Les cartes du hero ont affiché pendant plusieurs
 * jours des montants de maquette alors que la base comptait presque zéro. La
 * bande de chiffres ne porte AUCUN montant : deux volumes mesurés (routeurs
 * supervisés, sessions en cours), masqués si la base n'a pas répondu, et deux
 * faits produit (essai, opérateurs mobile money). Voir platform-stats.ts.
 *
 * Le film est généré à partir de la photo officielle du hAP ax³ : aucun port,
 * écran ou texte inventé. Le texte vit ici, dans le HTML, jamais dans l'image. */
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
    <div className="bg-[#080A0E]">
      <ScrollFilm {...FILM} stages={[...t.film]} scrollLabel={t.scroll}>
        <p className="font-mono text-xs uppercase tracking-[0.3em] text-[#A5F32E]">{t.eyebrow}</p>
        <h1 className="mt-5 text-balance text-5xl font-semibold leading-[1.02] tracking-tight sm:text-7xl">
          {t.titleA}
          <span className="block text-white/60">{t.titleMark}</span>
        </h1>
        <p className="mt-6 max-w-md text-pretty text-lg leading-relaxed text-white/70">{t.lead}</p>

        {/* Capture e-mail — l'inscription se termine sur /auth/register, qui
            pré-remplit le champ à partir du paramètre d'URL. */}
        <form
          action={localeHref("/auth/register", locale)}
          method="get"
          className="mt-8 flex w-full max-w-md flex-col gap-2 sm:flex-row"
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
            className="min-h-12 min-w-0 flex-1 rounded-full border border-white/15 bg-white/5 px-5 text-sm text-white placeholder:text-white/40 focus:border-[#A5F32E] focus:outline-none"
          />
          <button
            type="submit"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-white px-6 text-sm font-semibold text-[#080A0E] transition-colors hover:bg-[#A5F32E]"
          >
            {t.submit}
            <ArrowRight aria-hidden="true" className="h-4 w-4" />
          </button>
        </form>
        <p className="mt-3 text-xs text-white/45">
          {/* Un SEUL nœud texte : ce Next avale l'espace entre {expr} et le
              texte adjacent au rendu serveur. */}
          {t.microcopy(VPN_TRIAL_DAYS)}
        </p>
      </ScrollFilm>

      {/* Chiffres réels — aucun montant. Flex et non grille : un volume
          masqué ne laisse pas de case vide. */}
      <div className="border-t border-white/10">
        <dl className="mx-auto flex max-w-6xl flex-wrap gap-px bg-white/10">
          {chiffres.map((c) => (
            <div key={c.label} className="min-w-0 flex-1 basis-[11rem] bg-[#080A0E] px-6 py-6">
              <dt className="text-xs text-white/50">{c.label}</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-white sm:text-3xl">{c.value}</dd>
              <dd className="mt-1 line-clamp-2 text-xs text-white/40 sm:truncate">{c.sub}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Bande de compatibilité constructeurs — logos défilants */}
      <VendorMarquee dict={dict} />
    </div>
  );
}
