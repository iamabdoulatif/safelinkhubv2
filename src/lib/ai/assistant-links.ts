/**
 * Rend cliquables les liens que l'assistant cite — et seulement ceux-là.
 *
 * Le modèle écrit du texte : « voyez /vpn pour les tarifs ». Laisser ce texte
 * brut oblige le visiteur à recopier l'adresse ; l'interpréter comme du HTML
 * ferait entrer dans la page ce qu'un modèle a produit, donc ce qu'un visiteur
 * peut lui faire produire. On découpe donc en JETONS, et le composant fabrique
 * des éléments React — jamais de HTML injecté.
 *
 * Seules deux formes deviennent des liens : un chemin interne du site, et une
 * URL https://safelinkhub.io. Une adresse externe reste du texte : l'assistant
 * n'a pas à envoyer qui que ce soit hors du domaine.
 */

export type AssistantToken =
  | { kind: "text"; value: string }
  | { kind: "link"; value: string; href: string };

/* Le chemin interne doit COMMENCER un mot : sans cette garde, « /steal » de
   https://evil.example/steal devenait un lien vers notre propre site, et
   « //evil.example » un lien vers /evil. */
const MOTIF =
  /(https:\/\/(?:www\.)?safelinkhub\.io[^\s<>()"']*|(?<=^|[\s(])\/(?:en\/)?[a-z][a-z0-9/-]*)/gi;

/** Ponctuation de fin de phrase collée au lien — elle n'en fait pas partie. */
function ebarbe(brut: string): { lien: string; reste: string } {
  const nettoye = brut.replace(/[.,;:!?)\]]+$/u, "");
  return { lien: nettoye, reste: brut.slice(nettoye.length) };
}

export function tokenizeAssistantText(texte: string): AssistantToken[] {
  const jetons: AssistantToken[] = [];
  let curseur = 0;

  for (const trouve of texte.matchAll(MOTIF)) {
    const debut = trouve.index ?? 0;
    if (debut > curseur) jetons.push({ kind: "text", value: texte.slice(curseur, debut) });

    const { lien, reste } = ebarbe(trouve[0]);
    if (lien.length > 1) {
      jetons.push({ kind: "link", value: lien, href: lien });
    } else {
      jetons.push({ kind: "text", value: lien });
    }
    if (reste) jetons.push({ kind: "text", value: reste });
    curseur = debut + trouve[0].length;
  }

  if (curseur < texte.length) jetons.push({ kind: "text", value: texte.slice(curseur) });
  return jetons;
}
