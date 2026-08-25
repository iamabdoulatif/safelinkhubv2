/**
 * Analyse rédactionnelle d'un article — fonctions PURES, testables sans écran.
 *
 * L'esprit : compter ce qui est vérifiable et le dire, jamais promettre un
 * classement. Chaque contrôle rend un verdict et une phrase qui explique quoi
 * faire ; un voyant rouge sans consigne n'apprend rien à qui rédige.
 */
import { countOccurrences, outline, plainText, wordCount } from "./markup";

export type CheckState = "ok" | "warn" | "err";
export type Check = { id: string; state: CheckState; label: string; hint: string };

export type SeoInput = {
  title: string;
  slug: string;
  excerpt: string;
  content: string;
  keyword: string;
  coverImageUrl?: string;
};

/** Longueurs conseillées — ce que Google affiche avant de tronquer. */
export const TITLE_MIN = 30;
export const TITLE_MAX = 65;
export const EXCERPT_MIN = 70;
export const EXCERPT_MAX = 160;
/** En dessous, un article se positionne rarement : trop peu de matière. */
export const WORDS_MIN = 300;

/** Densité du mot-clé, en pourcentage des mots du texte. */
export function keywordDensity(content: string, keyword: string): number {
  const mots = wordCount(content);
  if (!mots || !keyword.trim()) return 0;
  return (countOccurrences(plainText(content), keyword) / mots) * 100;
}

export type SeoReport = {
  checks: Check[];
  /** 0-100 — part des contrôles réussis, les avertissements comptant à moitié. */
  score: number;
  words: number;
  density: number;
  occurrences: number;
};

export function analyseSeo(input: SeoInput): SeoReport {
  const checks: Check[] = [];
  const kw = input.keyword.trim();
  const texte = plainText(input.content);
  const mots = wordCount(input.content);
  const plan = outline(input.content);
  const occurrences = kw ? countOccurrences(texte, kw) : 0;
  const densite = keywordDensity(input.content, kw);

  const add = (id: string, state: CheckState, label: string, hint: string) =>
    checks.push({ id, state, label, hint });

  /* ── Le mot-clé ─────────────────────────────────────────────────────── */
  if (!kw) {
    add("keyword", "warn", "Aucun mot-clé principal", "Indiquez l'expression que vos lecteurs taperont dans Google.");
  } else {
    add(
      "keyword-title",
      countOccurrences(input.title, kw) > 0 ? "ok" : "err",
      "Mot-clé dans le titre",
      "Le titre est ce que Google affiche en premier : le mot-clé doit y être.",
    );
    add(
      "keyword-slug",
      countOccurrences(input.slug.replace(/-/g, " "), kw) > 0 ? "ok" : "warn",
      "Mot-clé dans l'adresse (slug)",
      "Une adresse qui contient le mot-clé se lit et se partage mieux.",
    );
    add(
      "keyword-excerpt",
      countOccurrences(input.excerpt, kw) > 0 ? "ok" : "warn",
      "Mot-clé dans l'extrait",
      "L'extrait sert de description dans les résultats de recherche.",
    );
    add(
      "keyword-first",
      countOccurrences(texte.slice(0, 200), kw) > 0 ? "ok" : "warn",
      "Mot-clé dans les premières lignes",
      "Annoncez le sujet dès le premier paragraphe, pas au milieu de l'article.",
    );
    add(
      "keyword-heading",
      plan.some((h) => countOccurrences(h.text, kw) > 0) ? "ok" : "warn",
      "Mot-clé dans un intertitre",
      "Au moins un H2 ou H3 devrait reprendre le sujet.",
    );

    /* La densité : trop peu, le sujet n'est pas traité ; trop, le texte devient
       illisible et ressemble à du remplissage. */
    const densiteEtat: CheckState = densite === 0 ? "err" : densite < 0.5 ? "warn" : densite > 3 ? "warn" : "ok";
    add(
      "density",
      densiteEtat,
      `Densité du mot-clé : ${densite.toFixed(1)} % (${occurrences} occurrence${occurrences > 1 ? "s" : ""})`,
      densite > 3
        ? "Trop répété — le texte devient pénible à lire."
        : "Visez entre 0,5 % et 3 %, sans forcer la formulation.",
    );
  }

  /* ── La forme ───────────────────────────────────────────────────────── */
  const lt = input.title.trim().length;
  add(
    "title-length",
    lt === 0 ? "err" : lt < TITLE_MIN ? "warn" : lt > TITLE_MAX ? "warn" : "ok",
    `Longueur du titre : ${lt} caractères`,
    `Entre ${TITLE_MIN} et ${TITLE_MAX} caractères — au-delà, Google le coupe.`,
  );

  const le = input.excerpt.trim().length;
  add(
    "excerpt-length",
    le === 0 ? "warn" : le < EXCERPT_MIN ? "warn" : le > EXCERPT_MAX ? "warn" : "ok",
    `Longueur de l'extrait : ${le} caractères`,
    `Entre ${EXCERPT_MIN} et ${EXCERPT_MAX} caractères.`,
  );

  add(
    "words",
    mots >= WORDS_MIN ? "ok" : mots > 0 ? "warn" : "err",
    `${mots} mot${mots > 1 ? "s" : ""}`,
    `Au moins ${WORDS_MIN} mots pour traiter un sujet sérieusement.`,
  );

  add(
    "structure",
    plan.length >= 2 ? "ok" : plan.length === 1 ? "warn" : "warn",
    `${plan.length} intertitre${plan.length > 1 ? "s" : ""}`,
    "Découpez avec des H2 : un mur de texte se lit mal et se référence mal.",
  );

  /* Un H3 avant tout H2 casse la hiérarchie — un lecteur d'écran annonce un
     sous-niveau qui n'a pas de niveau parent. */
  const premierH3AvantH2 = plan.findIndex((h) => h.level === 3);
  const premierH2 = plan.findIndex((h) => h.level === 2);
  if (plan.length > 0) {
    add(
      "hierarchy",
      premierH3AvantH2 !== -1 && (premierH2 === -1 || premierH3AvantH2 < premierH2) ? "warn" : "ok",
      "Hiérarchie des titres",
      "Un H3 doit venir APRÈS un H2 — c'est un sous-niveau, pas un titre isolé.",
    );
  }

  add(
    "cover",
    input.coverImageUrl?.trim() ? "ok" : "warn",
    "Image de couverture",
    "Elle sert aussi d'aperçu quand l'article est partagé.",
  );

  const points = checks.reduce((n, c) => n + (c.state === "ok" ? 1 : c.state === "warn" ? 0.5 : 0), 0);
  const score = checks.length ? Math.round((points / checks.length) * 100) : 0;

  return { checks, score, words: mots, density: densite, occurrences };
}
