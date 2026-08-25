"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bold,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  Quote,
  Type,
  Video,
} from "lucide-react";
import { blocksToHtml, serializeNodes, type SimpleNode } from "@/lib/content/html-markup";
import { outline, readingMinutes, wordCount } from "@/lib/content/markup";

/**
 * Éditeur WYSIWYG — on tape dans du texte déjà mis en forme.
 *
 * CE QUI PART EN BASE reste la syntaxe de markup.ts : la zone éditable est
 * sérialisée à chaque frappe vers un `<input type="hidden">`. Le formulaire, les
 * actions serveur, le rendu public et les articles déjà écrits ne changent pas.
 * Voir html-markup.ts pour le pourquoi.
 *
 * `document.execCommand` est officiellement déprécié mais reste la seule
 * commande d'édition implémentée partout ; le réécrire à la main sur des Range
 * demanderait dix fois ce code pour le même résultat. Si un navigateur venait à
 * la retirer, le champ caché continuerait de porter le texte : on perdrait les
 * boutons, pas le contenu.
 */

/** DOM réel → forme minimale que sait sérialiser html-markup. */
function toSimple(node: Node): SimpleNode {
  if (node.nodeType === Node.TEXT_NODE) return { tag: "#text", text: node.textContent ?? "" };
  const el = node as HTMLElement;
  const attrs: Record<string, string> = {};
  const href = el.getAttribute?.("href");
  if (href) attrs.href = href;
  const video = el.getAttribute?.("data-video");
  if (video) attrs["data-video"] = video;
  return {
    tag: el.tagName.toLowerCase(),
    attrs,
    children: Array.from(el.childNodes).map(toSimple),
  };
}

type Bouton = {
  cle: string;
  titre: string;
  icone: typeof Bold;
  /** Commande d'édition, ou action sur mesure. */
  commande?: string;
  bloc?: string;
};

const BOUTONS: Bouton[] = [
  { cle: "bold", titre: "Gras (Ctrl+B)", icone: Bold, commande: "bold" },
  { cle: "italic", titre: "Italique (Ctrl+I)", icone: Italic, commande: "italic" },
  { cle: "p", titre: "Paragraphe", icone: Type, bloc: "P" },
  { cle: "h2", titre: "Intertitre H2", icone: Heading2, bloc: "H2" },
  { cle: "h3", titre: "Sous-titre H3", icone: Heading3, bloc: "H3" },
  { cle: "ul", titre: "Liste à puces", icone: List, commande: "insertUnorderedList" },
  { cle: "quote", titre: "Citation", icone: Quote, bloc: "BLOCKQUOTE" },
];

export default function WysiwygEditor({
  name,
  defaultValue = "",
  id,
  placeholder = "Rédigez votre article…",
  onChangeValue,
}: {
  name: string;
  defaultValue?: string;
  id?: string;
  placeholder?: string;
  onChangeValue?: (value: string) => void;
}) {
  const zone = useRef<HTMLDivElement>(null);
  const [valeur, setValeur] = useState(defaultValue);
  const [actifs, setActifs] = useState<Record<string, boolean>>({});

  /* Le HTML de départ n'est posé QU'UNE FOIS. Le réinjecter à chaque rendu
     replacerait le curseur au début à chaque lettre tapée. */
  const htmlInitial = useMemo(() => blocksToHtml(defaultValue), [defaultValue]);
  useEffect(() => {
    if (zone.current && !zone.current.innerHTML) zone.current.innerHTML = htmlInitial;
  }, [htmlInitial]);

  const relire = useCallback(() => {
    const el = zone.current;
    if (!el) return;
    const texte = serializeNodes(Array.from(el.childNodes).map(toSimple));
    setValeur(texte);
    onChangeValue?.(texte);
  }, [onChangeValue]);

  /** État des boutons selon l'endroit où se trouve le curseur. */
  const rafraichirEtats = useCallback(() => {
    if (typeof document === "undefined") return;
    const etat: Record<string, boolean> = {};
    for (const b of BOUTONS) {
      if (b.commande) {
        try {
          etat[b.cle] = document.queryCommandState(b.commande);
        } catch {
          etat[b.cle] = false;
        }
      }
    }
    const sel = window.getSelection();
    let n: Node | null = sel?.anchorNode ?? null;
    while (n && n !== zone.current) {
      const tag = (n as HTMLElement).tagName;
      if (tag) {
        if (tag === "H2") etat.h2 = true;
        if (tag === "H3") etat.h3 = true;
        if (tag === "BLOCKQUOTE") etat.quote = true;
      }
      n = n.parentNode;
    }
    setActifs(etat);
  }, []);

  function executer(b: Bouton) {
    const el = zone.current;
    if (!el) return;
    el.focus();
    if (b.commande) {
      document.execCommand(b.commande);
    } else if (b.bloc) {
      // Reposer le MÊME bloc revient à le retirer : le bouton fait aussi
      // l'inverse, comme partout ailleurs dans le produit.
      const dejaPose = actifs[b.cle];
      document.execCommand("formatBlock", false, dejaPose ? "P" : b.bloc);
    }
    relire();
    rafraichirEtats();
  }

  function insererLien() {
    const el = zone.current;
    if (!el) return;
    const url = window.prompt("Adresse du lien", "https://");
    if (!url) return;
    if (!/^https?:\/\//.test(url)) {
      window.alert("Le lien doit commencer par http:// ou https://");
      return;
    }
    el.focus();
    document.execCommand("createLink", false, url);
    relire();
  }

  function insererVideo() {
    const el = zone.current;
    if (!el) return;
    const url = window.prompt("Lien de la vidéo (YouTube, Vimeo, .mp4)", "https://");
    if (!url) return;
    /* On repasse par le texte plutôt que d'injecter le lecteur à la main : la
       même fonction construit le bloc à l'ouverture et ici, donc les deux
       chemins ne peuvent pas diverger. */
    const nouveau = `${serializeNodes(Array.from(el.childNodes).map(toSimple))}\n\n!video ${url}`.trim();
    el.innerHTML = blocksToHtml(nouveau);
    setValeur(nouveau);
    onChangeValue?.(nouveau);
  }

  const plan = outline(valeur);
  const mots = wordCount(valeur);
  const classeBouton = (actif: boolean) =>
    `inline-flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
      actif ? "bg-brand text-slate-deep" : "text-ink-soft hover:bg-clay hover:text-ink"
    }`;

  return (
    <div className="rounded-xl border border-line bg-paper">
      {/* Le champ réellement envoyé : la zone éditable n'a pas de `name`. */}
      <input type="hidden" name={name} value={valeur} readOnly />

      <div className="flex flex-wrap items-center gap-1 border-b border-line-soft px-2 py-1.5">
        {BOUTONS.map((b) => (
          <button
            key={b.cle}
            type="button"
            title={b.titre}
            aria-label={b.titre}
            aria-pressed={!!actifs[b.cle]}
            // `onMouseDown` et non `onClick` : un clic ordinaire retire d'abord
            // le focus de la zone, donc la sélection, et la commande s'applique
            // dans le vide.
            onMouseDown={(e) => {
              e.preventDefault();
              executer(b);
            }}
            className={classeBouton(!!actifs[b.cle])}
          >
            <b.icone className="h-4 w-4" />
          </button>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-line-soft" />
        <button
          type="button"
          title="Insérer un lien"
          aria-label="Insérer un lien"
          onMouseDown={(e) => { e.preventDefault(); insererLien(); }}
          className={classeBouton(false)}
        >
          <Link2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Insérer une vidéo"
          aria-label="Insérer une vidéo"
          onMouseDown={(e) => { e.preventDefault(); insererVideo(); }}
          className={classeBouton(false)}
        >
          <Video className="h-4 w-4" />
        </button>

        <span className="ml-auto text-xs tabular-nums text-ink-soft">
          {mots} mot{mots > 1 ? "s" : ""} · {readingMinutes(valeur)} min
        </span>
      </div>

      <div
        ref={zone}
        id={id}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Contenu de l'article"
        data-placeholder={placeholder}
        onInput={relire}
        onBlur={relire}
        onKeyUp={rafraichirEtats}
        onMouseUp={rafraichirEtats}
        onPaste={(e) => {
          /* Collage en TEXTE BRUT : sans cela, un copier-coller depuis Word ou
             une page web injecte ses propres balises et styles, que la
             sérialisation jetterait en silence — l'auteur verrait sa mise en
             forme disparaître à l'enregistrement. */
          e.preventDefault();
          const texte = e.clipboardData.getData("text/plain");
          document.execCommand("insertText", false, texte);
        }}
        className="prose-editor min-h-[22rem] px-5 py-4 text-[15px] leading-relaxed text-ink outline-none"
      />

      {plan.length > 0 && (
        <div className="border-t border-line-soft px-5 py-2.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-soft">
            Plan de l&apos;article
          </p>
          <ol className="mt-1.5 space-y-0.5 text-xs text-ink-soft" role="list">
            {plan.map((h, i) => (
              <li key={i} className={h.level === 3 ? "pl-4" : undefined}>
                <span className="font-mono text-[10px] text-brand-deep">H{h.level}</span>{" "}
                {h.text || <span className="italic">(vide)</span>}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
