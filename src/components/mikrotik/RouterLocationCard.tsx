"use client";

import { useActionState, useEffect, useState } from "react";
import { MapPin, Pencil } from "lucide-react";
import RouterLocationPicker, { type LocationInitiale } from "./RouterLocationPicker";
import { updateRouterLocation } from "@/lib/mikrotik/actions";
import { routerLocationLabel } from "@/lib/geo/router-location";

/**
 * Localisation d'un routeur DÉJÀ enregistré : on la lit, et on la corrige.
 *
 * Sans ce bloc, la localisation n'existait que pour les routeurs créés après la
 * fonctionnalité — tout le parc déjà en place serait resté sans adresse, à vie.
 * Le formulaire est REPLIÉ par défaut : la fiche routeur sert d'abord à
 * surveiller, pas à saisir une adresse.
 */
export default function RouterLocationCard({
  routerId,
  latitude,
  longitude,
  street,
  neighbourhood,
  commune,
  country,
}: { routerId: string } & LocationInitiale) {
  const [state, formAction, pending] = useActionState(updateRouterLocation, undefined);
  const [ouvert, setOuvert] = useState(false);
  const resultat = state as { success?: boolean; error?: string } | undefined;

  const libelle = routerLocationLabel({
    locationStreet: street,
    locationNeighbourhood: neighbourhood,
    locationCommune: commune,
    locationCountry: country,
  });
  const situe = Boolean(latitude && longitude);

  // L'enregistrement a réussi : la page est revalidée côté serveur, on referme
  // pour revenir à la lecture plutôt que de laisser un formulaire ouvert sur
  // des valeurs déjà enregistrées. Replier est bien un effet du résultat de
  // l'action, il n'a pas d'équivalent au rendu.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (resultat?.success) setOuvert(false);
  }, [resultat]);

  return (
    /* Fermé, c'est une ligne de fiche comme les autres (libellé à gauche,
       valeur à droite). Ouvert, le formulaire prend TOUTE la largeur de la
       ligne : coincé dans la colonne de droite, le champ de recherche tombait
       à une dizaine de caractères. */
    <div className={ouvert ? "py-2" : "flex items-start justify-between gap-3 py-2"}>
      <dt className="shrink-0 text-ink-soft">Localisation</dt>
      <dd className={ouvert ? "mt-1" : "min-w-0 text-right"}>
        {libelle || situe ? (
          <>
            {libelle && <span className="block font-semibold text-ink">{libelle}</span>}
            {situe && (
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-0.5 inline-block font-mono text-xs text-brand-deep hover:underline"
              >
                {Number(latitude).toFixed(5)}, {Number(longitude).toFixed(5)}
              </a>
            )}
          </>
        ) : (
          <span className="text-ink-soft">non renseignée</span>
        )}

        <button
          type="button"
          onClick={() => setOuvert((v) => !v)}
          /* flex et non inline-flex : collé à la suite d'un texte en ligne, le
             bouton se retrouvait soudé à « non renseignée ». */
          className="mt-1 flex min-h-9 w-full items-center justify-end gap-1.5 text-xs font-semibold text-brand-deep hover:underline"
        >
          {libelle || situe ? (
            <>
              <Pencil aria-hidden="true" className="h-3 w-3" />
              {ouvert ? "Annuler" : "Modifier"}
            </>
          ) : (
            <>
              <MapPin aria-hidden="true" className="h-3 w-3" />
              {ouvert ? "Annuler" : "Renseigner la localisation"}
            </>
          )}
        </button>

        {ouvert && (
          <form action={formAction} className="mt-2 text-left">
            <input type="hidden" name="routerId" value={routerId} />
            <RouterLocationPicker
              initial={{ latitude, longitude, street, neighbourhood, commune, country }}
            />
            <button
              type="submit"
              disabled={pending}
              className="mt-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-slate-deep-line disabled:opacity-60"
            >
              {pending ? "Enregistrement…" : "Enregistrer la localisation"}
            </button>
            {resultat?.error && (
              <p className="mt-2 rounded-md bg-err-soft px-3 py-2 text-xs text-err">{resultat.error}</p>
            )}
          </form>
        )}
      </dd>
    </div>
  );
}
