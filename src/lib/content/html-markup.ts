/**
 * Pont entre le DOM éditable et la syntaxe stockée.
 *
 * L'éditeur est un vrai WYSIWYG : on tape dans du texte mis en forme. Mais ce
 * qui part en base reste la syntaxe de markup.ts.
 *
 * POURQUOI NE PAS STOCKER DU HTML. Trois raisons, dans l'ordre d'importance :
 *   1. il faudrait ASSAINIR à l'affichage — un `dangerouslySetInnerHTML` sur du
 *      contenu saisi est une surface d'attaque qu'on n'a pas aujourd'hui ;
 *   2. tous les articles déjà en base devraient être convertis ;
 *   3. le rendu public (ContentBlocks) devrait être réécrit.
 * En sérialisant vers la même syntaxe, l'éditeur change de peau sans que rien
 * d'autre ne bouge.
 *
 * Les deux sens vivent ici, en fonctions PURES sur une forme de nœud minimale :
 * la conversion se teste sans navigateur, là où un test sur DOM réel demanderait
 * un environnement complet pour vérifier une correspondance de chaînes.
 */
import { parseContent, videoEmbedUrl, type Block, type Inline } from "./markup";

/** Ce dont la sérialisation a besoin d'un nœud — rien de plus. */
export type SimpleNode = {
  /** "#text" pour un nœud de texte, sinon le nom de balise en minuscules. */
  tag: string;
  text?: string;
  attrs?: Record<string, string>;
  children?: SimpleNode[];
};

/* ── DOM → syntaxe ──────────────────────────────────────────────────────── */

/** Marqueurs d'un nœud en ligne. Rend le texte déjà entouré. */
function inlineToMarkup(node: SimpleNode): string {
  if (node.tag === "#text") return node.text ?? "";
  if (node.tag === "br") return "\n";

  const dedans = (node.children ?? []).map(inlineToMarkup).join("");

  switch (node.tag) {
    case "strong":
    case "b":
      // Un marqueur autour d'une chaîne vide produirait « **** » : on s'abstient.
      return dedans.trim() ? `**${dedans}**` : dedans;
    case "em":
    case "i":
      return dedans.trim() ? `*${dedans}*` : dedans;
    case "a": {
      const href = node.attrs?.href ?? "";
      // Seul http(s) devient un lien : le reste retombe en texte, comme le
      // parseur qui refuse déjà `javascript:`.
      return /^https?:\/\//.test(href) && dedans ? `[${dedans}](${href})` : dedans;
    }
    default:
      return dedans;
  }
}

/** Un bloc du DOM éditable → une ou plusieurs lignes de syntaxe. */
function blockToMarkup(node: SimpleNode): string | null {
  const inline = () => (node.children ?? []).map(inlineToMarkup).join("").trim();

  switch (node.tag) {
    case "h2":
      return inline() ? `## ${inline()}` : null;
    case "h3":
      return inline() ? `### ${inline()}` : null;
    case "blockquote":
      return inline() ? `> ${inline()}` : null;
    case "ul":
    case "ol": {
      const items = (node.children ?? [])
        .filter((c) => c.tag === "li")
        .map((li) => (li.children ?? []).map(inlineToMarkup).join("").trim())
        .filter(Boolean)
        .map((t) => `- ${t}`);
      return items.length ? items.join("\n") : null;
    }
    case "figure": {
      // Le lecteur vidéo porte l'URL d'origine : elle seule permet de
      // reconstruire la ligne, l'URL d'intégration n'étant pas réversible.
      const url = node.attrs?.["data-video"];
      return url ? `!video ${url}` : null;
    }
    case "#text":
      return node.text?.trim() ? node.text.trim() : null;
    default:
      return inline() || null;
  }
}

/** Le contenu éditable, tel qu'il partira en base. */
export function serializeNodes(nodes: SimpleNode[]): string {
  return nodes
    .map(blockToMarkup)
    .filter((l): l is string => l !== null)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/* ── Syntaxe → DOM ──────────────────────────────────────────────────────── */

/** Échappement pour insertion dans du HTML — jamais de balise venue du texte. */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function inlineToHtml(parts: Inline[]): string {
  return parts
    .map((p) => {
      const t = escapeHtml(p.text);
      if (p.kind === "bold") return `<strong>${t}</strong>`;
      if (p.kind === "italic") return `<em>${t}</em>`;
      if (p.kind === "link") return `<a href="${escapeHtml(p.href)}">${t}</a>`;
      return t;
    })
    .join("");
}

/** Le HTML posé DANS la zone éditable — pas celui du site public. */
export function blocksToHtml(content: string): string {
  const html = parseContent(content)
    .map((b: Block) => {
      switch (b.kind) {
        case "h2":
          return `<h2>${inlineToHtml(b.inline)}</h2>`;
        case "h3":
          return `<h3>${inlineToHtml(b.inline)}</h3>`;
        case "quote":
          return `<blockquote>${inlineToHtml(b.inline)}</blockquote>`;
        case "list":
          return `<ul>${b.items.map((i) => `<li>${inlineToHtml(i)}</li>`).join("")}</ul>`;
        case "video": {
          const embed = videoEmbedUrl(b.url);
          /* `contenteditable="false"` : le lecteur se déplace et se supprime
             comme un bloc, mais on n'écrit pas DEDANS. Sans cela, le curseur
             se perd dans l'iframe et la vidéo devient impossible à retirer. */
          const dedans = embed
            ? `<iframe src="${escapeHtml(embed)}" loading="lazy" allowfullscreen></iframe>`
            : `<span class="editor-video-fallback">${escapeHtml(b.url)}</span>`;
          return `<figure contenteditable="false" data-video="${escapeHtml(b.url)}">${dedans}</figure>`;
        }
        default:
          return `<p>${inlineToHtml(b.inline)}</p>`;
      }
    })
    .join("");
  // Une zone éditable vide n'accepte pas la frappe sur certains navigateurs :
  // il lui faut au moins un bloc.
  return html || "<p><br></p>";
}
