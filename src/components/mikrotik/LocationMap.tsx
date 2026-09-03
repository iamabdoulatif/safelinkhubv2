"use client";

import { useEffect, useRef } from "react";
import type { Map as LeafletMap, Marker } from "leaflet";
import "leaflet/dist/leaflet.css";
import { SITE_GEO } from "@/lib/site/contact";

/**
 * Carte de pointage : on touche la carte, l'épingle s'y pose ; on la fait
 * glisser, elle suit. C'est le chemin qui manquait quand ni le GPS du
 * téléphone (opérateur au bureau) ni la recherche d'adresse (rue absente
 * d'OpenStreetMap, cas courant à Abidjan) ne donnent le bon point.
 *
 * LEAFLET, CHARGÉ À LA DEMANDE. La bibliothèque touche `window` dès son
 * import : elle est importée DANS l'effet, jamais au niveau du module, sinon
 * le rendu serveur de la page d'enregistrement casse. Comme la carte n'est
 * montée que lorsque l'opérateur la demande, ces ~40 ko ne pèsent sur personne
 * d'autre.
 *
 * ÉPINGLE EN SVG (`divIcon`) et pas l'icône par défaut : celle de Leaflet est
 * un PNG référencé en chemin relatif, que les empaqueteurs cassent — c'est le
 * fameux marqueur invisible. Un SVG en ligne n'a pas ce problème et suit la
 * couleur de la charte.
 *
 * TUILES OpenStreetMap : ni clé ni facturation, attribution affichée comme
 * leur licence l'exige.
 */

const PIN = `
<svg width="30" height="30" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M12 22s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" fill="#10160F" stroke="#D6F344" stroke-width="1.6"/>
  <circle cx="12" cy="11" r="2.6" fill="#D6F344"/>
</svg>`;

export default function LocationMap({
  latitude,
  longitude,
  onPick,
}: {
  latitude: number | null;
  longitude: number | null;
  /** Appelé à chaque déplacement de l'épingle (clic ou glisser). */
  onPick: (latitude: number, longitude: number) => void;
}) {
  const hote = useRef<HTMLDivElement>(null);
  const carte = useRef<LeafletMap | null>(null);
  const epingle = useRef<Marker | null>(null);
  /* L'effet de création ne doit pas se rejouer quand le rappel change
     d'identité à chaque rendu du parent — la carte serait détruite et
     reconstruite à chaque frappe dans un champ. La mise à jour de la référence
     passe par un effet : l'écrire pendant le rendu est interdit. */
  const rappel = useRef(onPick);
  useEffect(() => {
    rappel.current = onPick;
  }, [onPick]);

  useEffect(() => {
    let annule = false;
    const conteneur = hote.current;
    if (!conteneur) return;

    void (async () => {
      const L = (await import("leaflet")).default;
      if (annule || !hote.current) return;

      const depart: [number, number] =
        latitude !== null && longitude !== null
          ? [latitude, longitude]
          : [SITE_GEO.lat, SITE_GEO.lng];

      const map = L.map(conteneur, {
        center: depart,
        // Zoom serré si l'on connaît déjà le point, large sinon : on ne
        // demande pas à quelqu'un de chercher une rue depuis l'échelle du pays.
        zoom: latitude !== null ? 17 : 12,
        // La carte vit DANS un formulaire qui défile : la molette zoomerait
        // au lieu de faire défiler la page, geste qu'on ne veut pas voler.
        scrollWheelZoom: false,
      });
      carte.current = map;

      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(map);

      const icone = L.divIcon({
        html: PIN,
        className: "",
        iconSize: [30, 30],
        iconAnchor: [15, 28],
      });

      const poser = (lat: number, lng: number) => {
        if (!epingle.current) {
          epingle.current = L.marker([lat, lng], { icon: icone, draggable: true })
            .addTo(map)
            .on("dragend", (event) => {
              const { lat: y, lng: x } = (event.target as Marker).getLatLng();
              rappel.current(y, x);
            });
        } else {
          epingle.current.setLatLng([lat, lng]);
        }
      };

      if (latitude !== null && longitude !== null) poser(latitude, longitude);

      map.on("click", (event) => {
        poser(event.latlng.lat, event.latlng.lng);
        rappel.current(event.latlng.lat, event.latlng.lng);
      });

      /* Le conteneur est souvent monté juste après un clic « afficher » :
         Leaflet a alors mesuré une hauteur nulle et n'affiche que des tuiles
         grises tant qu'on ne le rafraîchit pas. */
      setTimeout(() => map.invalidateSize(), 60);
    })();

    return () => {
      annule = true;
      carte.current?.remove();
      carte.current = null;
      epingle.current = null;
    };
    // Création unique : les mises à jour de coordonnées passent par l'effet
    // suivant, qui déplace l'épingle sans reconstruire la carte.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coordonnées changées AILLEURS (bouton « ma position », recherche, saisie
  // manuelle) : l'épingle suit, et la vue se recentre sur elle.
  useEffect(() => {
    const map = carte.current;
    if (!map || latitude === null || longitude === null) return;
    void (async () => {
      const L = (await import("leaflet")).default;
      if (!carte.current) return;
      if (epingle.current) {
        epingle.current.setLatLng([latitude, longitude]);
      } else {
        epingle.current = L.marker([latitude, longitude], {
          icon: L.divIcon({ html: PIN, className: "", iconSize: [30, 30], iconAnchor: [15, 28] }),
          draggable: true,
        })
          .addTo(map)
          .on("dragend", (event) => {
            const { lat, lng } = (event.target as Marker).getLatLng();
            rappel.current(lat, lng);
          });
      }
      /* Ne recentrer QUE si le point sort du cadre. Recentrer à chaque
         déplacement faisait sauter la carte sous le doigt qui vient de poser
         l'épingle, et forcer le zoom annulait celui que l'opérateur venait de
         choisir pour viser une autre zone. */
      if (!map.getBounds().contains([latitude, longitude])) {
        map.setView([latitude, longitude], Math.max(map.getZoom(), 16));
      }
    })();
  }, [latitude, longitude]);

  return (
    <div
      ref={hote}
      // z-0 : les panneaux Leaflet montent jusqu'à z-index 800 et passeraient
      // au-dessus des menus et modales de l'administration.
      className="relative z-0 h-64 w-full overflow-hidden rounded-md border border-line-soft"
    />
  );
}
