"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { decisionReprise } from "@/lib/ui/chunk-recovery";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const chemin = usePathname() ?? "/admin";

  /* RECHARGEMENT AUTOMATIQUE sur fragment manquant.
   *
   * Après un déploiement, un onglet resté ouvert réclame des fragments dont le
   * nom a changé. L'erreur qui en résulte parle de connexion, ce qui envoie
   * l'exploitant chercher au mauvais endroit. Un rechargement suffit.
   *
   * `reset()` ne suffirait PAS : il refait le rendu avec le même bundle
   * périmé, donc la même erreur. Il faut redemander le document au serveur.
   *
   * Une seule tentative par chemin et par session — au-delà, l'erreur n'est
   * plus un onglet périmé, et recharger en boucle masquerait la vraie cause
   * derrière une page qui clignote. */
  useEffect(() => {
    let dejaTente = false;
    try {
      dejaTente = sessionStorage.getItem(`slh:rechargement-fragment:${chemin}`) === "1";
    } catch {
      // Navigation privée, stockage refusé : sans mémoire, on ne peut pas
      // garantir l'unicité de la tentative — on s'abstient plutôt que risquer
      // la boucle.
      return;
    }
    const decision = decisionReprise(error, chemin, dejaTente);
    if (!decision.recharger) return;
    try {
      sessionStorage.setItem(decision.cle, "1");
    } catch {
      return;
    }
    window.location.reload();
  }, [error, chemin]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-err bg-paper p-8 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-err-soft">
          <AlertTriangle aria-hidden="true" className="h-6 w-6 text-err" />
        </div>

        <h1 className="mt-4 text-base font-semibold text-ink">
          Impossible de charger cette page
        </h1>
        <p className="mt-2 text-sm text-ink-soft">
          Une erreur s&apos;est produite lors du chargement. Vérifiez votre connexion
          puis réessayez.
        </p>

        {error.digest && (
          <p className="mt-3 rounded-md bg-clay px-3 py-1.5 font-mono text-xs text-ink-soft">
            {error.digest}
          </p>
        )}

        <div className="mt-6 flex justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white hover:bg-slate-deep-line"
          >
            <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
            Réessayer
          </button>
          <Link
            href="/admin"
            className="rounded-full border border-line-soft px-4 py-2 text-sm font-semibold text-ink hover:bg-clay"
          >
            Tableau de bord
          </Link>
        </div>
      </div>
    </div>
  );
}
