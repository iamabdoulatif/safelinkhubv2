/**
 * Les deux MikHmon du parc, et à qui chacun s'adresse.
 *
 * Les surnoms « v6 » et « v7 » ne désignent PAS des versions de MikHmon : ils
 * disent la version de RouterOS à laquelle chaque édition répond. C'est le
 * vocabulaire de l'exploitant, qui raisonne en « ce routeur est en 6 » ou
 * « celui-là est en 7 », jamais en numéro de build de MikHmon.
 *
 *   v7 → l'édition SafeLinkHub, sur Docker. Elle tourne SUR le routeur quand
 *        celui-ci sait héberger un conteneur (RouterOS 7, ARM/ARM64), ou sur
 *        le relais pour les cartes qui ne le peuvent pas.
 *   v6 → MikHmon v3 de laksa19, traduit en français ici même. C'est le seul
 *        chemin pour les cartes MIPS restées en RouterOS 6 : elles n'ont ni
 *        conteneur, ni l'API que réclame l'édition SafeLinkHub.
 *
 * La traduction française vit dans deploy/mikhmon-v6/lang/fr.php : MikHmon
 * construit son menu de langues par un `glob('lang/*')`, il suffit donc de
 * déposer le fichier dans l'image.
 */

export type MikhmonEditionId = "v6" | "v7";

export type MikhmonEdition = {
  id: MikhmonEditionId;
  /** Ce que lit l'exploitant. */
  label: string;
  /** Une phrase : à quel routeur cette édition s'adresse. */
  audience: string;
  /** D'où vient le logiciel — la question revient à chaque audit. */
  origine: string;
  /** Plage de RouterOS couverte. Dite en toutes lettres : c'est le critère de
      choix de l'exploitant, et « v6 »/« v7 » seuls prêtent à confusion avec
      une version de MikHmon. */
  routerOs: string;
  /** Image Docker servie par le relais. */
  image: string;
};

export const MIKHMON_EDITIONS: Record<MikhmonEditionId, MikhmonEdition> = {
  v7: {
    id: "v7",
    label: "MikHmon v7",
    routerOs: "RouterOS 7.0 à 7.24.1",
    audience: "Cartes compatibles Container — MikHmon tourne sur le routeur lui-même.",
    origine: "Édition SafeLinkHub (MIKHMON by SafeLink Africa), sur Docker.",
    image: "latif225/mikhmon-sf-v1:latest",
  },
  v6: {
    id: "v6",
    label: "MikHmon v6",
    routerOs: "RouterOS 6.x",
    audience: "Cartes MIPS restées en 6.x (RB951, hEX, wAP…) — ni Container, ni API récente.",
    origine: "MikHmon v3 de laksa19, traduit en français par SafeLinkHub.",
    /* NOTRE registre, jamais un nom Docker Hub nu : le déploiement fait un
       `docker image prune -af`, donc l'image doit pouvoir être re-tirée — et
       un nom non qualifié irait la chercher chez un tiers. Publiée par le job
       `mikhmon-v6` de .github/workflows/deploy.yml. */
    image: "ghcr.io/iamabdoulatif/mikhmon-v6:v3.20-fr",
  },
};

/**
 * L'édition qui convient à un routeur.
 *
 * `supportsContainers` vient du catalogue ou de la détection : `null` signifie
 * « pas encore mesuré », et on ne tranche pas à la place de la mesure — un
 * routeur mal classé recevrait le mauvais MikHmon, donc aucun.
 */
export function editionForRouter(supportsContainers: boolean | null | undefined): MikhmonEdition | null {
  if (supportsContainers === true) return MIKHMON_EDITIONS.v7;
  if (supportsContainers === false) return MIKHMON_EDITIONS.v6;
  return null;
}

/** Lit une édition venue du formulaire ou de la base, sans jamais faire confiance à la chaîne. */
export function parseEdition(raw: string | null | undefined): MikhmonEditionId {
  /* Repli sur v7 et non sur v6 : c'est l'édition des instances créées avant
     que le choix existe, et celle que le parc fait tourner aujourd'hui. Une
     valeur inconnue ne doit pas changer le MikHmon de quelqu'un. */
  return raw === "v6" ? "v6" : "v7";
}
