/**
 * Squelette de la fiche routeur : même silhouette que la page (en-tête +
 * actions, quatre cartes, onglets, deux colonnes), pour que l'arrivée du
 * contenu ne déplace rien et qu'un clic sur un routeur réponde tout de suite.
 */
export default function Loading() {
  return (
    <>
      <p className="sr-only" role="status">
        Chargement de la fiche routeur…
      </p>
      <div aria-hidden="true" className="animate-pulse">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded bg-clay" />
            <div>
              <div className="h-8 w-56 rounded bg-clay" />
              <div className="mt-2 h-4 w-32 rounded bg-clay" />
              <div className="mt-3 flex gap-2">
                <div className="h-5 w-20 rounded bg-clay" />
                <div className="h-5 w-20 rounded bg-clay" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-9 w-28 rounded-full bg-clay" />
            ))}
          </div>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-line bg-paper p-4">
              <div className="h-3 w-24 rounded bg-clay" />
              <div className="mt-3 h-7 w-16 rounded bg-clay" />
              <div className="mt-2 h-3 w-32 rounded bg-clay" />
            </div>
          ))}
        </div>
        <div className="mt-8 flex gap-2 border-b border-line pb-px">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-9 w-32 rounded-t bg-clay" />
          ))}
        </div>
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="h-64 rounded-xl border border-line bg-paper" />
          <div className="h-64 rounded-xl border border-line bg-paper" />
        </div>
      </div>
    </>
  );
}
