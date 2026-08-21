"use client";

import { useState } from "react";
import { MapPin, ExternalLink } from "lucide-react";
import type { Dictionary } from "@/lib/i18n/fr";

/* Carte Google en « façade », comme le lecteur vidéo (YouTubeEmbed).
 *
 * Une iframe Google Maps posée directement dans la page contacte les serveurs
 * de Google — et dépose ses cookies — au CHARGEMENT, pour tout visiteur, qu'il
 * regarde la carte ou non. Sur un site qui n'émet aujourd'hui aucune requête
 * tierce avant interaction, ce serait le seul point qui rompt la règle.
 *
 * L'adresse est du VRAI TEXTE, pas seulement un point sur une image : elle
 * reste lisible sans JavaScript, dans un lecteur d'écran, et indexable. Le lien
 * « Ouvrir dans Google Maps » fonctionne lui aussi sans que rien ne s'exécute.
 */

const LAT = 5.3453013;
const LNG = -4.03603;
const ADRESSE = "330 Rue Nicolas Amenin, Attécoubé";
const VILLE = "Abidjan, Côte d'Ivoire";

/** Forme historique et sans clé d'API. Google redirige vers /maps/embed. */
const embedUrl = (locale: "fr" | "en") =>
  `https://maps.google.com/maps?q=${LAT},${LNG}&z=17&hl=${locale}&output=embed`;
/* Forme documentée par Google (« Maps URLs »), stable et sans clé. On ne passe
   PAS par un place_id : celui de l'URL d'origine est encodé en hexadécimal
   (0xfc1eafbca2653ed:…), pas au format ChIJ… attendu ici, et le convertir de
   tête reviendrait à inventer un identifiant. Les coordonnées, elles, viennent
   directement de l'URL fournie. */
const ITINERAIRE = `https://www.google.com/maps/dir/?api=1&destination=${LAT},${LNG}`;

const defaultCopy: Dictionary["contact"]["map"] = {
  findUs: "Nous trouver",
  directions: "Itinéraire",
  title: "Carte",
  show: "Afficher la carte",
  privacy: "La carte est chargée depuis Google. Rien n'est envoyé tant que vous ne l'ouvrez pas.",
};

export default function MapEmbed({
  locale = "fr",
  t = defaultCopy,
}: {
  locale?: "fr" | "en";
  t?: Dictionary["contact"]["map"];
}) {
  const [ouverte, setOuverte] = useState(false);

  return (
    <div className="slate-card overflow-hidden bg-paper">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
        <div className="flex gap-3">
          <span
            aria-hidden="true"
            className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-slate-deep"
          >
            <MapPin className="h-4 w-4" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold text-ink">{t.findUs}</h2>
            <address className="mt-1 text-sm not-italic leading-relaxed text-ink-soft">
              {ADRESSE}
              <br />
              {VILLE}
            </address>
          </div>
        </div>
        <a
          href={ITINERAIRE}
          target="_blank"
          rel="noopener noreferrer"
          className="slate-btn slate-btn-ghost inline-flex shrink-0 items-center justify-center gap-2 px-5 py-2.5 text-sm"
        >
          {t.directions}
          <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
        </a>
      </div>

      {ouverte ? (
        <iframe
          title={`${t.title} — ${ADRESSE}, ${VILLE}`}
          src={embedUrl(locale)}
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          className="h-72 w-full border-0 sm:h-80"
        />
      ) : (
        <button
          type="button"
          onClick={() => setOuverte(true)}
          className="group relative flex h-72 w-full items-center justify-center overflow-hidden bg-clay focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset sm:h-80"
        >
          {/* Trame de plan dessinée localement — aucune tuile téléchargée. */}
          <span
            aria-hidden="true"
            className="absolute inset-0 opacity-60"
            style={{
              backgroundImage:
                "linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px)",
              backgroundSize: "38px 38px",
            }}
          />
          <span className="relative flex flex-col items-center gap-3 px-6 text-center">
            {/* Le halo est porté par la pastille elle-même. En élément absolu
                centré sur le bloc, il débordait sur le libellé en dessous. */}
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-slate-deep text-white ring-8 ring-brand/30 group-hover:bg-[#0C2415]">
              <MapPin className="h-5 w-5" />
            </span>
            <span className="text-sm font-semibold text-ink">{t.show}</span>
            <span className="max-w-xs text-xs leading-5 text-ink-soft">
              {t.privacy}
            </span>
          </span>
        </button>
      )}
    </div>
  );
}
