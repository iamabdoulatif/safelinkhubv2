/* Rendu de contenu rédactionnel — paragraphes séparés par une ligne vide, et
 * « ## » pour un intertitre.
 *
 * Extrait de la page article pour que les leçons de formation l'utilisent tel
 * quel : deux copies auraient fini par diverger, et un intertitre aurait cessé
 * de se voir d'un côté sans que personne ne le remarque. */
export default function ContentBlocks({ content }: { content: string }) {
  return (
    <>
      {content.split(/\n{2,}/).map((block, i) =>
        block.startsWith("## ") ? (
          <h2 key={i} className="mt-8 font-display text-2xl font-bold text-ink">
            {block.slice(3)}
          </h2>
        ) : (
          <p key={i} className="mt-4 whitespace-pre-line leading-relaxed text-ink">
            {block}
          </p>
        ),
      )}
    </>
  );
}
