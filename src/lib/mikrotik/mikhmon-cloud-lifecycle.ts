/**
 * Cycle de vie d'une instance MikHmon cloud : activer, désactiver, renommer,
 * supprimer.
 *
 * Les décisions vivent ici, en fonctions PURES, parce qu'elles sont
 * irréversibles côté relais : une suppression détruit un conteneur, un
 * renommage en détruit un pour en recréer un autre. Ce qui décide « faut-il
 * recréer ? » doit se tester sans conteneur ni base.
 */
import { normalizeCustomSlug, cloudMikhmonDomain } from "./mikhmon-cloud-domain";

/** Ce que la base sait d'une instance, réduit à ce dont les règles ont besoin. */
export type EtatInstance = {
  domain: string;
  status: string; // active | stopped | failed
  edition: string;
};

export type ActionInstance = "activer" | "desactiver" | "supprimer";

/** Ce que l'écran a le droit de proposer, selon l'état courant. */
export function actionsPossibles(etat: EtatInstance | null): ActionInstance[] {
  if (!etat) return [];
  /* « Supprimer » reste offert dans TOUS les états, y compris `failed` : c'est
     précisément l'instance cassée qu'on veut pouvoir retirer. Sans cela, une
     provision à moitié faite resterait à l'écran sans aucun moyen de la
     nettoyer autrement qu'en base. */
  return etat.status === "active"
    ? ["desactiver", "supprimer"]
    : ["activer", "supprimer"];
}

export type VerdictRenommage =
  | { ok: false; erreur: string }
  | { ok: true; slug: string; domaine: string; recreer: boolean };

/**
 * Décide ce qu'un changement d'adresse implique.
 *
 * RECRÉER LE CONTENEUR N'EST PAS UN DÉTAIL : la règle `Host(...)` de Traefik
 * est gravée dans les ÉTIQUETTES Docker, et Docker ne sait pas modifier les
 * étiquettes d'un conteneur existant. Renommer sans recréer laisserait donc
 * l'ancienne adresse servir le tableau pendant que la nouvelle renverrait 404
 * — l'exploitant verrait le nouveau nom à l'écran et une page morte au clic.
 */
export function verdictRenommage(
  etat: EtatInstance,
  slugBrut: string | null | undefined,
  baseDomain: string,
): VerdictRenommage {
  const verdict = normalizeCustomSlug(slugBrut);
  if (!verdict.ok) return { ok: false, erreur: verdict.erreur };

  const domaine = cloudMikhmonDomain(verdict.slug, baseDomain);
  if (domaine === etat.domain) {
    // Reposer la même adresse ne doit RIEN détruire : sans ce court-circuit,
    // un clic sur « Enregistrer » sans rien changer couperait le tableau le
    // temps d'une recréation, pour un résultat identique.
    return { ok: true, slug: verdict.slug, domaine, recreer: false };
  }
  return { ok: true, slug: verdict.slug, domaine, recreer: true };
}

/**
 * L'édition à reposer quand on recrée un conteneur.
 *
 * TOUJOURS celle en place, jamais un défaut : un renommage change l'adresse,
 * pas le logiciel. Repartir sur le défaut ferait passer un tableau v6 en v7 au
 * détour d'un changement de nom, avec une autre interface et des sessions
 * illisibles.
 */
export function editionAReposer(etat: EtatInstance): "v6" | "v7" {
  return etat.edition === "v6" ? "v6" : "v7";
}
