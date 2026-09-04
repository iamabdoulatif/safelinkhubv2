/**
 * Squelette du parc, pendant que le serveur compose la page.
 *
 * L'écran ne montrait RIEN au changement de page : la vue précédente restait
 * figée quelques centaines de millisecondes, ce qu'on lit comme un clic perdu
 * — et on reclique. Le squelette reprend la forme réelle de l'écran (bande
 * d'état, puis cartes), pour que l'arrivée du contenu ne déplace rien.
 */
export default function Loading() {
  return (
    <>
      {/* L'annonce vit HORS du bloc décoratif : à l'intérieur, elle héritait
          de son aria-hidden et aucun lecteur d'écran ne la lisait. */}
      <p className="sr-only" role="status">
        Chargement du parc…
      </p>

      <div aria-hidden="true" className="animate-pulse space-y-5">
        <div className="h-5 w-48 rounded bg-clay" />

        <div className="slate-card grid grid-cols-3 divide-x divide-line bg-paper">
          {[0, 1, 2].map((i) => (
            <div key={i} className="px-4 py-4">
              <div className="h-3 w-16 rounded bg-clay" />
              <div className="mt-2 h-7 w-10 rounded bg-clay" />
            </div>
          ))}
        </div>

        <div className="h-11 w-full rounded-full bg-clay" />

        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="slate-card bg-paper p-4">
              <div className="h-3 w-20 rounded bg-clay" />
              <div className="mt-2 h-4 w-40 rounded bg-clay" />
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-line-soft pt-3">
                <div className="h-8 rounded bg-clay" />
                <div className="h-8 rounded bg-clay" />
                <div className="h-8 rounded bg-clay" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
