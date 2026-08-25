/**
 * La syntaxe rédactionnelle de SafeLinkHub — un sous-ensemble de Markdown,
 * volontairement minuscule.
 *
 * POURQUOI PAS UN ÉDITEUR WYSIWYG. Le contenu déjà en base est du texte brut
 * avec « ## » pour les intertitres (voir ContentBlocks). Passer au HTML riche
 * obligerait à convertir l'existant, à assainir le HTML reçu, et à embarquer
 * une bibliothèque d'édition. On ÉTEND la syntaxe en place : les articles
 * anciens restent lisibles tels quels, et la barre d'outils ne fait qu'écrire
 * ces mêmes caractères autour de la sélection.
 *
 * PAS DE H1 DANS LE CONTENU. Le titre de l'article EST le H1 de la page ; un
 * second H1 dans le corps dégrade le référencement au lieu de l'aider. La
 * hiérarchie commence donc à H2.
 *
 *   ## Intertitre              → h2
 *   ### Sous-intertitre        → h3
 *   > Citation                 → blockquote
 *   - élément                  → liste à puces
 *   !video https://…           → lecteur vidéo
 *   **gras**  *italique*  [texte](https://…)
 *
 * Tout est PUR ici : le rendu et l'éditeur lisent la même vérité, et les
 * règles se testent sans navigateur.
 */

export type Inline =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | { kind: "link"; text: string; href: string };

export type Block =
  | { kind: "h2"; inline: Inline[] }
  | { kind: "h3"; inline: Inline[] }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "list"; items: Inline[][] }
  | { kind: "video"; url: string; provider: VideoProvider }
  | { kind: "paragraph"; inline: Inline[] };

export type VideoProvider = "youtube" | "vimeo" | "file" | "unknown";

/* ── Vidéo ──────────────────────────────────────────────────────────────── */

/** Identifiant YouTube, quelle que soit la forme du lien collé. */
export function youtubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/,
  );
  return m ? m[1] : null;
}

export function vimeoId(url: string): string | null {
  const m = url.match(/vimeo\.com\/(?:video\/)?(\d{6,})/);
  return m ? m[1] : null;
}

export function videoProvider(url: string): VideoProvider {
  if (youtubeId(url)) return "youtube";
  if (vimeoId(url)) return "vimeo";
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return "file";
  return "unknown";
}

/**
 * URL d'intégration, sans cookies quand la plateforme le permet.
 *
 * `youtube-nocookie` et `dnt=1` évitent de déposer un traceur chez un lecteur
 * qui n'a fait que lire un article — le portail public n'a pas de bandeau de
 * consentement à opposer.
 */
export function videoEmbedUrl(url: string): string | null {
  const yt = youtubeId(url);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt}`;
  const vi = vimeoId(url);
  if (vi) return `https://player.vimeo.com/video/${vi}?dnt=1`;
  return null;
}

/* ── Inline ─────────────────────────────────────────────────────────────── */

/* Un seul balayage, marqueurs par ordre d'apparition : découper en plusieurs
   passes ferait qu'un « ** » à l'intérieur d'un lien serait interprété deux
   fois. */
const MOTIF_INLINE = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of source.matchAll(MOTIF_INLINE)) {
    if (m.index! > last) out.push({ kind: "text", text: source.slice(last, m.index) });
    if (m[1] !== undefined) out.push({ kind: "link", text: m[1], href: m[2] });
    else if (m[3] !== undefined) out.push({ kind: "bold", text: m[3] });
    else out.push({ kind: "italic", text: m[4] });
    last = m.index! + m[0].length;
  }
  if (last < source.length) out.push({ kind: "text", text: source.slice(last) });
  return out.length ? out : [{ kind: "text", text: source }];
}

/* ── Blocs ──────────────────────────────────────────────────────────────── */

export function parseContent(content: string): Block[] {
  const blocks: Block[] = [];
  for (const brut of content.split(/\n{2,}/)) {
    const bloc = brut.trim();
    if (!bloc) continue;

    if (bloc.startsWith("### ")) {
      blocks.push({ kind: "h3", inline: parseInline(bloc.slice(4)) });
    } else if (bloc.startsWith("## ")) {
      blocks.push({ kind: "h2", inline: parseInline(bloc.slice(3)) });
    } else if (bloc.startsWith("!video ")) {
      const url = bloc.slice(7).trim();
      blocks.push({ kind: "video", url, provider: videoProvider(url) });
    } else if (bloc.startsWith("> ")) {
      // Une citation sur plusieurs lignes reste UNE citation.
      const texte = bloc
        .split("\n")
        .map((l) => l.replace(/^>\s?/, ""))
        .join(" ");
      blocks.push({ kind: "quote", inline: parseInline(texte) });
    } else if (/^[-*] /.test(bloc)) {
      const items = bloc
        .split("\n")
        .filter((l) => /^[-*] /.test(l))
        .map((l) => parseInline(l.slice(2)));
      blocks.push({ kind: "list", items });
    } else {
      blocks.push({ kind: "paragraph", inline: parseInline(bloc) });
    }
  }
  return blocks;
}

/* ── Mesures rédactionnelles ────────────────────────────────────────────── */

/** Texte nu, sans marqueurs — la base de tout comptage honnête. */
export function plainText(content: string): string {
  return parseContent(content)
    .flatMap((b) =>
      b.kind === "video" ? [] : b.kind === "list" ? b.items.flat() : b.inline,
    )
    .map((i) => i.text)
    .join(" ");
}

export function wordCount(content: string): number {
  const t = plainText(content).trim();
  return t ? t.split(/\s+/).length : 0;
}

/** Temps de lecture en minutes, 200 mots/minute, jamais moins d'une minute. */
export function readingMinutes(content: string): number {
  return Math.max(1, Math.round(wordCount(content) / 200));
}

export type Outline = { level: 2 | 3; text: string }[];

/** Plan de l'article — sert à voir sa structure sans relire le texte. */
export function outline(content: string): Outline {
  return parseContent(content)
    .filter((b): b is Extract<Block, { kind: "h2" | "h3" }> => b.kind === "h2" || b.kind === "h3")
    .map((b) => ({
      level: b.kind === "h2" ? (2 as const) : (3 as const),
      text: b.inline.map((i) => i.text).join(""),
    }));
}

/** Occurrences d'une expression, insensible à la casse et aux accents. */
export function countOccurrences(haystack: string, needle: string): number {
  const norme = (s: string) =>
    s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const n = norme(needle).trim();
  if (!n) return 0;
  const h = norme(haystack);
  let total = 0;
  let i = h.indexOf(n);
  while (i !== -1) {
    total++;
    i = h.indexOf(n, i + n.length);
  }
  return total;
}
