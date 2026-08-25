/* Rendu du contenu rédactionnel — voir lib/content/markup.ts pour la syntaxe.
 *
 * Extrait de la page article pour que les leçons de formation l'utilisent tel
 * quel : deux copies auraient fini par diverger, et un intertitre aurait cessé
 * de se voir d'un côté sans que personne ne le remarque.
 *
 * Les articles écrits AVANT l'enrichissement de la syntaxe restent rendus à
 * l'identique : un texte sans marqueur donne des paragraphes, « ## » donne
 * toujours un h2. Rien à convertir en base. */
import { parseContent, videoEmbedUrl, type Block, type Inline } from "@/lib/content/markup";

function InlineText({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        if (p.kind === "bold") return <strong key={i} className="font-semibold text-ink">{p.text}</strong>;
        if (p.kind === "italic") return <em key={i}>{p.text}</em>;
        if (p.kind === "link")
          return (
            <a
              key={i}
              href={p.href}
              // Les liens rédactionnels sortent du site : `noreferrer` évite de
              // transmettre l'URL de lecture, `nofollow` de céder du référencement
              // à n'importe quelle source citée.
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-brand-deep underline underline-offset-2 hover:no-underline"
            >
              {p.text}
            </a>
          );
        return <span key={i}>{p.text}</span>;
      })}
    </>
  );
}

/**
 * Lecteur vidéo — cadre 16/9, coins arrondis, ombre basse.
 *
 * `loading="lazy"` : une vidéo au milieu d'un article ne doit pas retarder
 * l'affichage du texte, qui est ce que le lecteur est venu chercher.
 */
function VideoBlock({ block }: { block: Extract<Block, { kind: "video" }> }) {
  const embed = videoEmbedUrl(block.url);

  if (block.provider === "file") {
    return (
      <figure className="mt-8 overflow-hidden rounded-2xl border border-line bg-ink shadow-lg">
        <video controls preload="metadata" className="aspect-video w-full" src={block.url} />
      </figure>
    );
  }

  if (!embed) {
    // Lien non reconnu : on ne fabrique pas un lecteur qui afficherait un
    // cadre vide — on rend le lien, qui au moins fonctionne.
    return (
      <p className="mt-6">
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="text-brand-deep underline"
        >
          Voir la vidéo
        </a>
      </p>
    );
  }

  return (
    <figure className="mt-8 overflow-hidden rounded-2xl border border-line bg-ink shadow-lg">
      <iframe
        src={embed}
        title="Vidéo de l'article"
        loading="lazy"
        allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        className="aspect-video w-full border-0"
      />
    </figure>
  );
}

export default function ContentBlocks({ content }: { content: string }) {
  return (
    <>
      {parseContent(content).map((b, i) => {
        switch (b.kind) {
          case "h2":
            return (
              <h2 key={i} className="mt-10 font-display text-2xl font-bold text-ink">
                <InlineText parts={b.inline} />
              </h2>
            );
          case "h3":
            return (
              <h3 key={i} className="mt-8 font-display text-xl font-bold text-ink">
                <InlineText parts={b.inline} />
              </h3>
            );
          case "quote":
            return (
              <blockquote
                key={i}
                className="mt-6 border-l-4 border-brand bg-clay px-5 py-3 text-lg italic leading-relaxed text-ink"
              >
                <InlineText parts={b.inline} />
              </blockquote>
            );
          case "list":
            return (
              <ul key={i} className="mt-4 list-disc space-y-1.5 pl-6 leading-relaxed text-ink">
                {b.items.map((item, j) => (
                  <li key={j}>
                    <InlineText parts={item} />
                  </li>
                ))}
              </ul>
            );
          case "video":
            return <VideoBlock key={i} block={b} />;
          default:
            return (
              <p key={i} className="mt-4 whitespace-pre-line leading-relaxed text-ink">
                <InlineText parts={b.inline} />
              </p>
            );
        }
      })}
    </>
  );
}
