/* En-tête de section, motif Slate : petite pilule d'étiquette, gros titre à
 * un mot surligné, sous-titre optionnel.
 *
 * Remplace l'ancien SectionHeading (motif Bitume : titre à gauche, index
 * encadré à droite), supprimé — plus aucune page ne l'utilisait une fois la
 * landing refondue. */
export default function SectionIntro({
  eyebrow,
  title,
  marker,
  lead,
  align = "center",
  dark = false,
}: {
  eyebrow: string;
  title: string;
  /** Mot du titre à passer au surligneur lime */
  marker?: string;
  lead?: string;
  align?: "center" | "left";
  dark?: boolean;
}) {
  const parts = marker ? title.split(marker) : [title];
  const centered = align === "center";
  return (
    <div className={centered ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}>
      <span
        className={`slate-eyebrow ${dark ? "border-slate-deep-line bg-transparent text-slate-deep-soft" : ""}`}
      >
        {eyebrow}
      </span>
      <h2
        className={`mt-5 font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-[2.75rem] ${
          dark ? "text-white" : "text-ink"
        }`}
      >
        {marker ? (
          <>
            {parts[0]}
            <span className="marker">{marker}</span>
            {parts[1]}
          </>
        ) : (
          title
        )}
      </h2>
      {lead ? (
        <p
          className={`mt-4 text-base leading-7 ${dark ? "text-slate-deep-soft" : "text-ink-soft"}`}
        >
          {lead}
        </p>
      ) : null}
    </div>
  );
}
