export default function SectionHeading({
  index,
  title,
  marker,
  dark = false,
}: {
  index: string;
  title: string;
  /** Mot du titre à surligner au marqueur moutarde */
  marker?: string;
  dark?: boolean;
}) {
  const parts = marker ? title.split(marker) : [title];
  return (
    <div className="mb-10 flex flex-col gap-4 sm:mb-12 sm:flex-row sm:items-end sm:justify-between">
      <h2
        className={`max-w-3xl font-display text-3xl font-bold leading-tight tracking-tight sm:text-4xl md:text-5xl ${
          dark ? "text-paper" : "text-ink"
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
      <span className={`section-index shrink-0 ${dark ? "text-paper" : "text-ink"}`} aria-hidden="true">
        {index}
      </span>
    </div>
  );
}
