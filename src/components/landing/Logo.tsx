"use client";

// Brand name must never be machine-translated
//
// Le symbole est INLINÉ, pas servi via <img src="/brand/…">. Raisons : le signe
// suit currentColor (le même composant marche sur le blanc de la nav, le vert
// profond du pied de page et le papier de /admin), il n'y a pas de requête
// supplémentaire ni de logo qui apparaît en retard, et la géométrie reste la
// même que public/brand/safelinkhub-mark.svg — toute retouche doit être
// reportée dans les deux.
//
// Hub Badge : une pastille-hub en currentColor avec le S routé CREUSÉ via un
// mask (vrai trou), d'où l'adaptabilité — disque encre sur fond clair, blanc
// sur fond sombre, et le S laisse voir le fond dans les deux cas. Le port
// d'arrivée est l'accent lime fixe (slh-accent). useId donne au mask un id
// unique : le logo est rendu plusieurs fois par page (nav, pied, /admin).
import { useId } from "react";

export default function Logo({ dark = false }: { dark?: boolean }) {
  const maskId = useId();
  return (
    <span
      className={`inline-flex items-center gap-2 ${dark ? "text-paper" : "text-[#12301D]"}`}
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
      >
        <mask id={maskId}>
          <circle cx="16" cy="16" r="14.5" fill="#fff" />
          <path
            d="M24 8 H13 V16 H19 V23.2 H7.8"
            fill="none"
            stroke="#000"
            strokeWidth="3.3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </mask>
        <circle cx="16" cy="16" r="14.5" fill="currentColor" mask={`url(#${maskId})`} />
        {/* Sur un fond lime, poser --slh-accent: currentColor sur un parent :
            sans quoi le port d'arrivée se fond dans l'aplat. */}
        <rect
          x="23"
          y="3"
          width="6"
          height="6"
          rx="1.6"
          fill="var(--slh-accent, #D6F344)"
          stroke="currentColor"
          strokeWidth="0.7"
        />
      </svg>
      {/* Sous ~338 px la barre de navigation déborde : le groupe de droite
          (« Commencer » + burger) fait 162 px, le logo complet 144 px, et il
          ne reste que 288 px utiles à 320 px. Le wordmark seul tenait pile,
          le symbole ajoute 36 px. On replie donc sur le symbole seul en
          dessous de 360 px — c'est précisément le cas d'usage pour lequel il
          est dessiné. Au-delà (360, 375, 414…) le lockup complet s'affiche.

          sr-only et NON hidden : le SVG est aria-hidden, et le logo du pied de
          page n'est enveloppé dans aucun lien porteur d'aria-label. Avec
          `hidden`, la marque disparaîtrait purement de l'arbre d'accessibilité
          sur petit écran. sr-only la sort du flux (la nav cesse de déborder)
          tout en la laissant lisible aux lecteurs d'écran. */}
      <span
        translate="no"
        className="font-display text-lg font-extrabold tracking-tight max-[359px]:sr-only sm:text-xl"
      >
        SafeLinkHub
      </span>
    </span>
  );
}
