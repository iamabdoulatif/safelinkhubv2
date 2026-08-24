/**
 * Transfert d'un MikroTik vers une AUTRE organisation.
 *
 * CE QUI SUIT LE ROUTEUR : la ligne `routers`, ses forfaits, ses passerelles
 * de configuration (bridges, redirections, MikHmon, groupes de roaming) et son
 * verrou de numéro de série.
 *
 * CE QUI RESTE : tout l'historique commercial — ventes encaissées, commandes du
 * portail, tickets déjà vendus, autorisations payées. Le chiffre d'affaires
 * appartient à l'organisation qui l'a gagné ; le faire suivre changerait
 * rétroactivement les comptes des DEUX organisations et rendrait faux tout
 * rapport déjà édité.
 *
 * Les règles vivent ici en fonctions PURES : la décision se teste sans base ni
 * routeur, l'exécution ne fait que les appliquer.
 */

export type TransferVerdict = { ok: true } | { ok: false; error: string };

/**
 * Numéro de série sous forme comparable : majuscules, sans espaces ni tirets.
 * Les étiquettes MikroTik se lisent souvent par groupes (« 7C1A 0B2E … ») et
 * se recopient avec des séparateurs qui n'appartiennent pas au numéro.
 */
export function normalizeSerial(serial: string): string {
  return serial.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Confronte le numéro RELEVÉ SUR L'APPAREIL à celui que le SaaS a enregistré
 * au premier passage en ligne.
 *
 * `known` à null = le routeur n'a jamais livré son numéro (carte hors
 * RouterBOARD, ou jamais synchronisée) : on accepte la déclaration plutôt que
 * de bloquer un transfert légitime, exactement comme `reserveRouterSerial`
 * autorise sans verrou quand le SN est illisible.
 */
export function guardDeclaredSerial(params: {
  declared: string;
  known: string | null;
}): TransferVerdict {
  const declare = normalizeSerial(params.declared);
  if (declare.length < 4) {
    return {
      ok: false,
      error: "Numéro de série manquant ou trop court — il est inscrit sous le boîtier du MikroTik.",
    };
  }
  if (!params.known) return { ok: true };
  if (normalizeSerial(params.known) !== declare) {
    return {
      ok: false,
      error:
        "Le numéro de série saisi ne correspond pas à celui de ce routeur. Vérifiez l'étiquette sous le boîtier, ou choisissez le bon routeur dans la liste.",
    };
  }
  return { ok: true };
}

export type TransferContext = {
  routerOrgId: string;
  /** Organisation qui demande — doit posséder le routeur. */
  requesterOrgId: string;
  /** Organisation d'arrivée, résolue depuis l'e-mail. Null = introuvable. */
  targetOrgId: string | null;
  /** Une demande est déjà ouverte pour ce routeur. */
  dejaEnAttente: boolean;
};

export function guardTransferRequest(ctx: TransferContext): TransferVerdict {
  if (ctx.routerOrgId !== ctx.requesterOrgId) {
    return { ok: false, error: "Ce routeur n'appartient pas à votre compte." };
  }
  if (ctx.dejaEnAttente) {
    return { ok: false, error: "Une demande de transfert est déjà en attente pour ce routeur." };
  }
  return { ok: true };
}

/** Vérifications faites au moment de la DÉCISION, pas de la demande : le compte
 *  cible peut être créé — ou le routeur revendu — entre les deux. */
export function guardTransferApproval(ctx: {
  routerOrgId: string;
  fromOrgId: string;
  targetOrgId: string | null;
  status: string;
}): TransferVerdict {
  if (ctx.status !== "pending") {
    return { ok: false, error: "Cette demande a déjà été tranchée." };
  }
  if (!ctx.targetOrgId) {
    return {
      ok: false,
      error:
        "Aucun compte SafeLinkHub ne porte cette adresse. La personne doit créer son compte avant le transfert.",
    };
  }
  if (ctx.targetOrgId === ctx.fromOrgId) {
    return { ok: false, error: "Le compte d'arrivée est déjà propriétaire du routeur." };
  }
  if (ctx.routerOrgId !== ctx.fromOrgId) {
    return {
      ok: false,
      error: "Le routeur a changé de propriétaire depuis la demande — elle n'est plus valable.",
    };
  }
  return { ok: true };
}

/**
 * Ce que l'opérateur doit refaire après un transfert accepté.
 *
 * Le tunnel et le compte API restent ceux de l'ancien propriétaire : le
 * routeur continue de fonctionner, mais il faut le ré-adopter pour que le
 * nouveau compte le pilote. Le dire ici plutôt que de laisser deviner.
 */
export const ETAPES_APRES_TRANSFERT = [
  "Le routeur reste en ligne : rien n'est coupé au moment du transfert.",
  "Le nouveau compte doit recoller la commande d'installation SafeLinkHub pour reprendre le tunnel et le compte API à son nom.",
  "L'historique de ventes, les commandes du portail et les tickets déjà vendus restent sur l'ancien compte.",
] as const;
