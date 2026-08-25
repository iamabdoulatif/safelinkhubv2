"use client";

import { useMemo, useRef, useState } from "react";
import {
  Bold,
  Eye,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  Quote,
  Video,
} from "lucide-react";
import ContentBlocks from "./ContentBlocks";
import { outline, readingMinutes, wordCount } from "@/lib/content/markup";

/**
 * Éditeur rédactionnel : un `<textarea>` et une barre d'outils qui écrit la
 * syntaxe autour de la sélection.
 *
 * POURQUOI PAS UN WYSIWYG. Le champ reste un `textarea` nommé, donc le
 * formulaire s'envoie exactement comme avant — aucune action serveur à
 * modifier, aucun contenu à convertir en base, et l'article reste lisible si
 * JavaScript ne se charge pas. La barre d'outils est un CONFORT : tout se tape
 * aussi à la main.
 */

type Outil =
  | { type: "entoure"; avant: string; apres: string }
  | { type: "prefixeLigne"; prefixe: string }
  | { type: "bloc"; gabarit: string; invite: string };

const OUTILS: { cle: string; titre: string; icone: typeof Bold; outil: Outil }[] = [
  { cle: "gras", titre: "Gras (Ctrl+B)", icone: Bold, outil: { type: "entoure", avant: "**", apres: "**" } },
  { cle: "italique", titre: "Italique (Ctrl+I)", icone: Italic, outil: { type: "entoure", avant: "*", apres: "*" } },
  { cle: "h2", titre: "Intertitre H2", icone: Heading2, outil: { type: "prefixeLigne", prefixe: "## " } },
  { cle: "h3", titre: "Sous-titre H3", icone: Heading3, outil: { type: "prefixeLigne", prefixe: "### " } },
  { cle: "liste", titre: "Liste à puces", icone: List, outil: { type: "prefixeLigne", prefixe: "- " } },
  { cle: "citation", titre: "Citation", icone: Quote, outil: { type: "prefixeLigne", prefixe: "> " } },
];

export default function RichTextEditor({
  name,
  defaultValue = "",
  rows = 18,
  id,
  placeholder,
  onChangeValue,
}: {
  name: string;
  defaultValue?: string;
  rows?: number;
  id?: string;
  placeholder?: string;
  /** Remonte le texte au parent — sert au panneau SEO. */
  onChangeValue?: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [valeur, setValeur] = useState(defaultValue);
  const [apercu, setApercu] = useState(false);

  const plan = useMemo(() => outline(valeur), [valeur]);
  const mots = useMemo(() => wordCount(valeur), [valeur]);

  function poser(nouveau: string, selDebut: number, selFin: number) {
    setValeur(nouveau);
    onChangeValue?.(nouveau);
    // Le curseur doit rester là où l'auteur écrivait, sinon chaque clic sur la
    // barre le renvoie à la fin du texte.
    requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(selDebut, selFin);
    });
  }

  function appliquer(outil: Outil) {
    const el = ref.current;
    if (!el) return;
    const debut = el.selectionStart;
    const fin = el.selectionEnd;
    const texte = el.value;
    const selection = texte.slice(debut, fin);

    if (outil.type === "entoure") {
      const { avant, apres } = outil;
      // Déjà entouré → on retire, pour que le bouton fasse aussi l'inverse.
      const dejaPose =
        texte.slice(debut - avant.length, debut) === avant &&
        texte.slice(fin, fin + apres.length) === apres;
      if (dejaPose) {
        const nouveau =
          texte.slice(0, debut - avant.length) + selection + texte.slice(fin + apres.length);
        poser(nouveau, debut - avant.length, fin - avant.length);
        return;
      }
      const corps = selection || "texte";
      const nouveau = texte.slice(0, debut) + avant + corps + apres + texte.slice(fin);
      poser(nouveau, debut + avant.length, debut + avant.length + corps.length);
      return;
    }

    if (outil.type === "prefixeLigne") {
      // On remonte au début de la ligne : préfixer au milieu d'une phrase
      // produirait « du te## xte ».
      const debutLigne = texte.lastIndexOf("\n", debut - 1) + 1;
      const ligne = texte.slice(debutLigne, fin === debut ? texte.indexOf("\n", debut) === -1 ? texte.length : texte.indexOf("\n", debut) : fin);
      const dejaPose = ligne.startsWith(outil.prefixe);
      const nouveau = dejaPose
        ? texte.slice(0, debutLigne) + texte.slice(debutLigne + outil.prefixe.length)
        : texte.slice(0, debutLigne) + outil.prefixe + texte.slice(debutLigne);
      const decalage = dejaPose ? -outil.prefixe.length : outil.prefixe.length;
      poser(nouveau, debut + decalage, fin + decalage);
      return;
    }

    const url = window.prompt(outil.invite, "https://");
    if (!url) return;
    const corps = outil.gabarit.replace("{url}", url).replace("{texte}", selection || "texte du lien");
    const separateur = debut > 0 && texte[debut - 1] !== "\n" ? "\n\n" : "";
    const nouveau = texte.slice(0, debut) + separateur + corps + texte.slice(fin);
    poser(nouveau, debut + separateur.length + corps.length, debut + separateur.length + corps.length);
  }

  const boutonClasse =
    "inline-flex h-8 w-8 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-clay hover:text-ink focus-visible:bg-clay focus-visible:text-ink";

  return (
    <div className="rounded-xl border border-line bg-paper">
      {/* ── Barre d'outils ─────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-1 border-b border-line-soft px-2 py-1.5">
        {OUTILS.map(({ cle, titre, icone: Icone, outil }) => (
          <button
            key={cle}
            type="button"
            title={titre}
            aria-label={titre}
            onClick={() => appliquer(outil)}
            className={boutonClasse}
          >
            <Icone className="h-4 w-4" />
          </button>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-line-soft" />
        <button
          type="button"
          title="Insérer un lien"
          aria-label="Insérer un lien"
          onClick={() => appliquer({ type: "bloc", gabarit: "[{texte}]({url})", invite: "Adresse du lien" })}
          className={boutonClasse}
        >
          <Link2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          title="Insérer une vidéo (YouTube, Vimeo ou fichier)"
          aria-label="Insérer une vidéo"
          onClick={() =>
            appliquer({ type: "bloc", gabarit: "!video {url}", invite: "Lien de la vidéo (YouTube, Vimeo, .mp4)" })
          }
          className={boutonClasse}
        >
          <Video className="h-4 w-4" />
        </button>

        <span className="ml-auto flex items-center gap-3">
          <span className="text-xs tabular-nums text-ink-soft">
            {mots} mot{mots > 1 ? "s" : ""} · {readingMinutes(valeur)} min
          </span>
          <button
            type="button"
            onClick={() => setApercu((v) => !v)}
            aria-pressed={apercu}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-semibold transition-colors ${
              apercu ? "bg-brand text-slate-deep" : "text-ink-soft hover:bg-clay hover:text-ink"
            }`}
          >
            <Eye className="h-3.5 w-3.5" />
            Aperçu
          </button>
        </span>
      </div>

      {/* ── Saisie ou aperçu ───────────────────────────────────────── */}
      {apercu ? (
        <div className="min-h-[20rem] px-4 py-3">
          {valeur.trim() ? (
            <ContentBlocks content={valeur} />
          ) : (
            <p className="text-sm text-ink-soft">Rien à prévisualiser pour l&apos;instant.</p>
          )}
        </div>
      ) : (
        <textarea
          ref={ref}
          id={id}
          name={name}
          required
          rows={rows}
          value={valeur}
          placeholder={placeholder}
          onChange={(e) => {
            setValeur(e.target.value);
            onChangeValue?.(e.target.value);
          }}
          onKeyDown={(e) => {
            // Les raccourcis attendus par tout rédacteur.
            if (!(e.metaKey || e.ctrlKey)) return;
            const k = e.key.toLowerCase();
            if (k === "b") { e.preventDefault(); appliquer({ type: "entoure", avant: "**", apres: "**" }); }
            if (k === "i") { e.preventDefault(); appliquer({ type: "entoure", avant: "*", apres: "*" }); }
          }}
          className="w-full resize-y bg-transparent px-4 py-3 text-sm leading-relaxed text-ink outline-none"
        />
      )}

      {/* ── Plan de l'article ──────────────────────────────────────── */}
      {plan.length > 0 && (
        <div className="border-t border-line-soft px-4 py-2.5">
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
