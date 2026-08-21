"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CloudCog, ExternalLink, Loader2 } from "lucide-react";
import { enablePortForward } from "@/lib/mikrotik/port-forward";

/* Dernier maillon du parcours d'installation, pour les cartes SANS conteneur.
 *
 * L'assistant s'arrêtait à l'auto-setup : l'opérateur devait ensuite deviner
 * qu'il fallait aller sur un AUTRE écran activer « MikHmon (vouchers) » pour
 * obtenir le lien. Sur un RB951 c'est pourtant l'aboutissement attendu du
 * parcours — on l'amène donc ici.
 *
 * On passe par la MÊME action que l'écran Accès distant, pas par un chemin
 * dérobé : l'accès MikHmon est un service facturé et sous autorisation.
 * Rapprocher la porte ne veut pas dire la contourner — si la garde réclame une
 * autorisation, on renvoie vers l'écran qui sait la traiter plutôt que de
 * dupliquer son paywall ici. */
export default function MikhmonCloudOutcome({ routerId }: { routerId: string }) {
  const [pending, startTransition] = useTransition();
  const [domaine, setDomaine] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [autorisation, setAutorisation] = useState(false);

  function creer() {
    setErreur(null);
    setAutorisation(false);
    startTransition(async () => {
      const res = await enablePortForward(routerId, "mikhmon", "monthly");
      if (res && "needsAuthorization" in res && res.needsAuthorization) {
        setAutorisation(true);
        return;
      }
      if (res && "error" in res && res.error) {
        setErreur(res.error);
        return;
      }
      if (res && "cloudDomain" in res && res.cloudDomain) {
        setDomaine(res.cloudDomain);
        return;
      }
      setErreur(
        "L'accès a été activé mais aucun domaine dédié n'a été renvoyé — vérifiez la station MikHmon Online.",
      );
    });
  }

  return (
    <div className="mt-4 rounded-md border border-brand-deep bg-brand/10 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <CloudCog className="h-4 w-4 text-brand-deep" />
        Cette carte ne peut pas héberger MikHmon
      </p>
      <p className="mt-1 text-xs leading-5 text-ink-soft">
        RouterOS Container lui est inaccessible : rien ne sera posé sur le routeur. Son MikHmon
        tourne sur le relais SafeLinkHub et répond sur son propre sous-domaine HTTPS, à travers le
        tunnel déjà monté.
      </p>

      {domaine ? (
        <p className="mt-3">
          <span className="block text-[11px] text-ink-soft">Domaine dédié</span>
          <a
            href={`https://${domaine}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 break-all font-mono text-sm font-medium text-ok hover:underline"
          >
            https://{domaine}
            <ExternalLink className="h-3.5 w-3.5 shrink-0" />
          </a>
        </p>
      ) : (
        <button
          type="button"
          onClick={creer}
          disabled={pending}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-ink px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
        >
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {pending ? "Création de l'instance…" : "Créer l'accès MikHmon Online"}
        </button>
      )}

      {autorisation && (
        <p className="mt-3 text-xs leading-5 text-warn">
          Cet accès demande une autorisation ou un règlement. Ouvrez{" "}
          <Link href="/admin/remote-access" className="font-semibold underline">
            Accès distant
          </Link>{" "}
          pour le finaliser — le lien apparaîtra ensuite dans la station MikHmon Online.
        </p>
      )}
      {erreur && <p className="mt-3 text-xs text-err">{erreur}</p>}
    </div>
  );
}
