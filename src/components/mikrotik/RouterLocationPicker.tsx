"use client";

import { useCallback, useState } from "react";
import dynamic from "next/dynamic";
import { Crosshair, ExternalLink, Loader2, MapPin, Search } from "lucide-react";
import type { GeoPlace } from "@/lib/geo/geocode";
/* Chargé seulement quand l'opérateur ouvre la carte : Leaflet et sa feuille de
   style ne pèsent pas sur la page d'enregistrement de tous les autres.
   `ssr: false` parce que Leaflet touche `window` dès son import. */
const LocationMap = dynamic(() => import("./LocationMap"), {
  ssr: false,
  loading: () => <div className="h-64 w-full animate-pulse rounded-md bg-clay" />,
});

/**
 * Où se trouve la zone, saisi à l'enregistrement du routeur.
 *
 * TROIS CHEMINS, parce qu'aucun ne marche partout :
 *   1. « Ma position » — le chemin normal : le technicien est SUR SITE au
 *      moment de l'installation, son téléphone connaît la position au mètre.
 *      Plus juste que n'importe quel pointage sur une carte.
 *   2. Recherche d'adresse — pour enregistrer une zone depuis le bureau.
 *   3. Coordonnées à la main — le repli qui marche toujours : on colle ce que
 *      Google Maps affiche. Sans lui, un géocodeur muet bloquerait la saisie.
 *
 * Les quatre lignes d'adresse restent MODIFIABLES après remplissage
 * automatique : le géocodage inverse se trompe régulièrement sur les rues
 * d'Abidjan, et l'opérateur sait mieux. La coordonnée, elle, ne bouge pas
 * quand il corrige le texte.
 *
 * La carte n'est chargée qu'à la demande (même façade que MapEmbed côté
 * public) : sinon chaque ouverture du formulaire enverrait la position du
 * routeur à Google avant que l'opérateur ait rien demandé.
 *
 *   4. Pointage sur la carte — quand ni le GPS (opérateur au bureau) ni la
 *      recherche (rue absente d'OpenStreetMap, courant à Abidjan) ne donnent
 *      le bon point : on touche la carte, l'épingle s'y pose, elle se fait
 *      glisser au mètre près.
 */

const inputClass =
  "w-full rounded-md border border-line-soft px-3 py-2 text-sm placeholder:text-ink-soft focus:border-line-soft focus:outline-none";
const labelClass = "mb-1 block text-xs font-medium text-ink-soft";

type Adresse = {
  street: string;
  neighbourhood: string;
  commune: string;
  country: string;
};

export type LocationInitiale = {
  latitude?: string | null;
  longitude?: string | null;
  street?: string | null;
  neighbourhood?: string | null;
  commune?: string | null;
  country?: string | null;
};

export default function RouterLocationPicker({ initial }: { initial?: LocationInitiale }) {
  // Une localisation déjà posée revient telle quelle : on corrige un quartier
  // mal deviné sans avoir à tout resaisir.
  const [latitude, setLatitude] = useState(initial?.latitude ?? "");
  const [longitude, setLongitude] = useState(initial?.longitude ?? "");
  const [adresse, setAdresse] = useState<Adresse>({
    street: initial?.street ?? "",
    neighbourhood: initial?.neighbourhood ?? "",
    commune: initial?.commune ?? "",
    country: initial?.country ?? "",
  });
  const [recherche, setRecherche] = useState("");
  const [resultats, setResultats] = useState<GeoPlace[]>([]);
  const [occupe, setOccupe] = useState<"" | "position" | "recherche">("");
  const [note, setNote] = useState("");
  const [carteOuverte, setCarteOuverte] = useState(Boolean(initial?.latitude));
  const latitudeNombre = Number(latitude);
  const longitudeNombre = Number(longitude);
  const point =
    latitude !== "" && longitude !== "" && Number.isFinite(latitudeNombre) && Number.isFinite(longitudeNombre)
      ? { latitude: latitudeNombre, longitude: longitudeNombre }
      : null;

  const situe = latitude !== "" && longitude !== "";

  function appliquer(place: GeoPlace) {
    setLatitude(place.latitude.toFixed(6));
    setLongitude(place.longitude.toFixed(6));
    setAdresse({
      street: place.street,
      neighbourhood: place.neighbourhood,
      commune: place.commune,
      country: place.country,
    });
    setResultats([]);
    // On garde la carte ouverte : après une recherche, le premier réflexe est
    // de vérifier que le point est au bon endroit — et de le corriger.
  }

  async function interroger(params: string): Promise<GeoPlace[]> {
    const reponse = await fetch(`/api/admin/geo?${params}`);
    if (!reponse.ok) throw new Error("indisponible");
    const data = (await reponse.json()) as { places?: GeoPlace[]; error?: string };
    if (data.error) throw new Error(data.error);
    return data.places ?? [];
  }

  function maPosition() {
    if (!("geolocation" in navigator)) {
      setNote("Cet appareil ne partage pas sa position. Saisissez les coordonnées à la main.");
      return;
    }
    setOccupe("position");
    setNote("");
    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        // La coordonnée est acquise : on la pose AVANT le géocodage inverse,
        // qui n'est qu'un confort. Un service muet ne doit pas faire perdre
        // une position que le téléphone vient de donner.
        setLatitude(coords.latitude.toFixed(6));
        setLongitude(coords.longitude.toFixed(6));
        try {
          const places = await interroger(`lat=${coords.latitude}&lon=${coords.longitude}`);
          if (places[0]) appliquer(places[0]);
          else setNote("Position enregistrée. Aucune adresse trouvée : complétez les champs.");
        } catch {
          setNote("Position enregistrée. Adresse non retrouvée : complétez les champs.");
        } finally {
          setOccupe("");
        }
      },
      (erreur) => {
        setOccupe("");
        setNote(
          erreur.code === erreur.PERMISSION_DENIED
            ? "Position refusée par le navigateur. Cherchez l'adresse ou saisissez les coordonnées."
            : "Position indisponible. Cherchez l'adresse ou saisissez les coordonnées.",
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  }

  /* Épingle déplacée : la coordonnée fait foi immédiatement, l'adresse suit si
     le géocodeur répond. Mémorisé (useCallback) pour ne pas remonter une
     nouvelle fonction à chaque frappe dans un champ voisin. */
  const poserEpingle = useCallback((lat: number, lng: number) => {
    setLatitude(lat.toFixed(6));
    setLongitude(lng.toFixed(6));
    setNote("");
    void (async () => {
      try {
        const reponse = await fetch(`/api/admin/geo?lat=${lat}&lon=${lng}`);
        if (!reponse.ok) return;
        const data = (await reponse.json()) as { places?: GeoPlace[] };
        const place = data.places?.[0];
        if (!place) return;
        setAdresse({
          street: place.street,
          neighbourhood: place.neighbourhood,
          commune: place.commune,
          country: place.country,
        });
      } catch {
        /* Adresse non retrouvée : le point, lui, est déjà posé. */
      }
    })();
  }, []);

  async function chercher() {
    if (recherche.trim().length < 3) return;
    setOccupe("recherche");
    setNote("");
    try {
      const places = await interroger(`q=${encodeURIComponent(recherche)}`);
      setResultats(places);
      if (places.length === 0) setNote("Aucun résultat. Essayez « quartier, commune » ou les coordonnées.");
    } catch {
      setNote("Service de carte indisponible. Saisissez l'adresse et les coordonnées à la main.");
    } finally {
      setOccupe("");
    }
  }

  /* Les deux coordonnées restent côte à côte (six chiffres tiennent partout),
     mais une rue de trente caractères dans 160 px de téléphone ne se relit
     pas : les quatre lignes d'adresse prennent toute la largeur sous sm. */
  const champ = (cle: keyof Adresse, libelle: string, exemple: string) => (
    <div className="col-span-2 sm:col-span-1">
      <label className={labelClass}>{libelle}</label>
      <input
        name={
          cle === "street"
            ? "locationStreet"
            : cle === "neighbourhood"
              ? "locationNeighbourhood"
              : cle === "commune"
                ? "locationCommune"
                : "locationCountry"
        }
        value={adresse[cle]}
        onChange={(e) => setAdresse((a) => ({ ...a, [cle]: e.target.value }))}
        placeholder={exemple}
        className={inputClass}
      />
    </div>
  );

  return (
    <div className="rounded-md border border-line-soft bg-clay/30 p-3">
      <div className="flex items-start gap-2">
        <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-brand-deep" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-ink">Localisation de la zone</p>
          <p className="mt-0.5 text-xs text-ink-soft">
            Facultatif, mais c&apos;est ce qui permet d&apos;envoyer un technicien à la bonne
            adresse et de situer la zone sur la carte du parc.
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={maPosition}
          disabled={occupe !== ""}
          /* Pleine largeur sous sm : sur la même ligne que la recherche, le
             champ de saisie tombait à 30 px de large sur un téléphone. */
          className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md bg-ink px-3 py-2 text-xs font-semibold text-white hover:bg-slate-deep-line disabled:opacity-60 sm:w-auto sm:justify-start"
        >
          {occupe === "position" ? (
            <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Crosshair aria-hidden="true" className="h-3.5 w-3.5" />
          )}
          Utiliser ma position
        </button>
        <div className="flex w-full min-w-0 gap-2 sm:flex-1">
          <input
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            onKeyDown={(e) => {
              // Entrée cherche l'adresse ; elle ne doit SURTOUT pas envoyer le
              // formulaire d'installation qui entoure ce bloc.
              if (e.key === "Enter") {
                e.preventDefault();
                void chercher();
              }
            }}
            placeholder="Adresse ou lieu — « angré cocody »"
            className={`${inputClass} min-w-0 flex-1`}
          />
          <button
            type="button"
            onClick={() => void chercher()}
            disabled={occupe !== "" || recherche.trim().length < 3}
            className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-md border border-line-soft bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-clay disabled:opacity-60"
          >
            {occupe === "recherche" ? (
              <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search aria-hidden="true" className="h-3.5 w-3.5" />
            )}
            Chercher
          </button>
        </div>
      </div>

      {resultats.length > 0 && (
        <ul role="list" className="mt-2 divide-y divide-line-soft rounded-md border border-line-soft bg-paper">
          {resultats.map((place) => (
            <li key={`${place.latitude},${place.longitude}`}>
              <button
                type="button"
                onClick={() => appliquer(place)}
                className="block w-full px-3 py-2 text-left text-xs leading-5 text-ink hover:bg-clay"
              >
                {place.label || `${place.latitude}, ${place.longitude}`}
              </button>
            </li>
          ))}
        </ul>
      )}

      {note && <p className="mt-2 text-xs text-warn">{note}</p>}

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <label className={labelClass}>Latitude</label>
          <input
            name="latitude"
            value={latitude}
            onChange={(e) => setLatitude(e.target.value)}
            inputMode="decimal"
            placeholder="5.345301"
            className={`${inputClass} font-mono`}
          />
        </div>
        <div>
          <label className={labelClass}>Longitude</label>
          <input
            name="longitude"
            value={longitude}
            onChange={(e) => setLongitude(e.target.value)}
            inputMode="decimal"
            placeholder="-4.036030"
            className={`${inputClass} font-mono`}
          />
        </div>
        {champ("street", "Rue", "330 Rue Nicolas Amenin")}
        {champ("neighbourhood", "Quartier", "Attécoubé")}
        {champ("commune", "Commune", "Abidjan")}
        {champ("country", "Pays", "Côte d'Ivoire")}
      </div>

      <div className="mt-3">
        {carteOuverte ? (
          <>
            <LocationMap
              latitude={point?.latitude ?? null}
              longitude={point?.longitude ?? null}
              onPick={poserEpingle}
            />
            <p className="mt-1.5 text-xs text-ink-soft">
              Touchez la carte pour poser l&apos;épingle, ou faites-la glisser. L&apos;adresse se
              met à jour toute seule ; corrigez-la si elle se trompe.
            </p>
          </>
        ) : (
          /* La carte n'est montée qu'à la demande : elle charge Leaflet et des
             tuiles OpenStreetMap, inutiles pour qui enregistre un routeur sans
             renseigner sa position. */
          <button
            type="button"
            onClick={() => setCarteOuverte(true)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-line-soft bg-paper px-3 py-2 text-xs font-semibold text-ink hover:bg-clay"
          >
            <MapPin aria-hidden="true" className="h-3.5 w-3.5" />
            {situe ? "Vérifier sur la carte" : "Placer sur la carte"}
          </button>
        )}
        {situe && (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-brand-deep hover:underline"
          >
            Ouvrir dans Google Maps
            <ExternalLink aria-hidden="true" className="h-3 w-3" />
          </a>
        )}
      </div>
    </div>
  );
}
