/**
 * Reprise après un fragment JavaScript manquant.
 *
 * LE PROBLÈME. Next découpe l'application en fragments dont le nom porte une
 * empreinte du contenu. À chaque déploiement, ces noms changent et les anciens
 * disparaissent du serveur. Un onglet resté ouvert garde en mémoire les anciens
 * noms : la première navigation réclame un fragment qui n'existe plus, et
 * l'application affiche « Impossible de charger cette page — vérifiez votre
 * connexion », alors que la connexion n'y est pour rien.
 *
 * LE REMÈDE, ET SA LIMITE. Recharger la page suffit : le navigateur redemande
 * le document, obtient les nouveaux noms, et repart. Mais un rechargement
 * déclenché sans discernement sur une erreur d'une AUTRE nature boucle
 * indéfiniment — la page échoue, recharge, échoue à nouveau. D'où deux gardes :
 * on ne recharge que sur une erreur de fragment reconnue, et une seule fois par
 * chemin et par session.
 */

/** Clé de mémorisation d'une tentative, propre à un chemin. */
export function cleTentative(chemin: string): string {
  return `slh:rechargement-fragment:${chemin}`;
}

/**
 * Cette erreur vient-elle d'un fragment manquant ?
 *
 * Reconnue sur PLUSIEURS formes : les navigateurs et les versions de Next ne
 * la nomment pas pareil — `ChunkLoadError` porté par `name` chez les uns, un
 * simple message « Loading chunk 42 failed » chez les autres. Ne tester que le
 * nom laisserait passer la moitié des cas.
 */
export function estErreurDeFragment(erreur: unknown): boolean {
  if (!erreur || typeof erreur !== "object") return false;
  const e = erreur as { name?: unknown; message?: unknown };
  if (typeof e.name === "string" && e.name === "ChunkLoadError") return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /ChunkLoadError|Loading chunk .* failed|Failed to load chunk|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

export type DecisionReprise =
  | { recharger: true; cle: string }
  | { recharger: false; motif: "autre-erreur" | "deja-tente" };

/**
 * Faut-il recharger ?
 *
 * `dejaTente` vient de la mémoire de session. Une erreur de fragment qui
 * persiste APRÈS un rechargement n'est plus un onglet périmé : insister
 * masquerait le vrai problème derrière une page qui clignote.
 */
export function decisionReprise(erreur: unknown, chemin: string, dejaTente: boolean): DecisionReprise {
  if (!estErreurDeFragment(erreur)) return { recharger: false, motif: "autre-erreur" };
  if (dejaTente) return { recharger: false, motif: "deja-tente" };
  return { recharger: true, cle: cleTentative(chemin) };
}
