// Brand name must never be machine-translated
//
// Le symbole est INLINÉ, pas servi via <img src="/brand/…">. Trois raisons :
// le tracé suit currentColor (le même fichier marche sur le blanc de la nav,
// le vert profond du pied de page et le papier de /admin), il n'y a pas de
// requête supplémentaire ni de logo qui apparaît en retard, et la géométrie
// reste la même que public/brand/safelinkhub-mark.svg — toute retouche doit
// être reportée dans les deux.
//
// Le surligneur .marker a disparu du wordmark : il lisait --brand, dont la
// valeur change selon la peau (lime en Slate, moutarde en Bitume). Le logo
// changeait donc de couleur entre la landing et l'admin. L'accent est
// désormais le nœud d'arrivée du symbole, en lime fixe.
export default function Logo({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 ${dark ? "text-paper" : "text-ink"}`}
    >
      <svg
        viewBox="0 0 32 32"
        aria-hidden="true"
        focusable="false"
        className="h-7 w-7 shrink-0 sm:h-8 sm:w-8"
      >
        <path
          d="M26 7H12v9h8v9H6"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect x="2.4" y="21.4" width="7.2" height="7.2" rx="2.1" fill="currentColor" />
        {/* Sur un fond lime, poser --slh-accent: currentColor sur un parent :
            sans quoi le nœud d'arrivée se fond dans l'aplat. */}
        <rect
          x="22.4"
          y="3.4"
          width="7.2"
          height="7.2"
          rx="2.1"
          fill="var(--slh-accent, #D6F344)"
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
