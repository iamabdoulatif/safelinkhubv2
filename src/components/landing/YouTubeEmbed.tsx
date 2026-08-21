"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/* Lecteur YouTube en « façade » : tant que le visiteur n'a pas cliqué, AUCUNE
 * requête ne part vers Google — ni le script du lecteur (~1 Mo), ni même la
 * miniature depuis i.ytimg.com, qui suffirait à signaler la visite.
 *
 * L'affiche est donc dessinée localement plutôt que téléchargée. Au clic,
 * l'iframe est montée sur youtube-nocookie.com avec autoplay : le visiteur
 * n'a qu'un seul clic à faire, comme sur un lecteur natif.
 *
 * Effet de bord voulu : cette page ne dépose aucun cookie tiers au chargement. */
export default function YouTubeEmbed({
  videoId,
  title,
  playLabel,
  hint,
}: {
  videoId: string;
  title: string;
  /** Libellés fournis par l'appelant : ce composant ne connaît pas la langue. */
  playLabel: string;
  hint: string;
}) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <iframe
        className="aspect-video h-full w-full"
        src={`https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1&hl=fr`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setPlaying(true)}
      aria-label={playLabel}
      className="group relative flex aspect-video w-full items-center justify-center overflow-hidden bg-slate-deep focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
    >
      {/* Affiche dessinée localement — aucune ressource distante */}
      <span
        aria-hidden="true"
        className="absolute inset-0 opacity-30"
        style={{
          backgroundImage:
            "radial-gradient(circle at 1px 1px, rgba(255,255,255,0.35) 1px, transparent 0)",
          backgroundSize: "22px 22px",
        }}
      />
      <span className="relative flex flex-col items-center gap-3">
        <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand text-slate-deep group-hover:bg-white">
          <Play aria-hidden="true" className="ml-0.5 h-7 w-7 fill-current" />
        </span>
        <span className="max-w-xs px-4 text-center text-sm font-semibold text-white">
          {title}
        </span>
        <span className="max-w-xs px-4 text-center text-xs leading-5 text-slate-deep-soft">
          {hint}
        </span>
      </span>
      <span className="absolute bottom-3 right-4 text-[11px] font-medium uppercase tracking-wider text-slate-deep-soft">
        YouTube
      </span>
    </button>
  );
}
