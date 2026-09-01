/**
 * Comment se règle l'activation d'un accès distant — MikHmon Online compris.
 *
 * Trois voies, toutes déjà en place dans le produit :
 *   1. Safecoin — débité si l'organisation a un compte SC, avec contrôle du
 *      solde et ANNULATION de l'accès si le débit ne passe pas ;
 *   2. portefeuille FCFA — pour les organisations d'avant Safecoin ;
 *   3. GeniusPay — le paiement en ligne du modal, ou une autorisation accordée
 *      par le superadmin depuis /admin/authorizations.
 *
 * CE QUI MANQUAIT. La voie 2 écrivait la ligne de débit SANS REGARDER LE
 * SOLDE : un portefeuille vide, ou déjà négatif, laissait l'accès s'ouvrir
 * quand même. La voie Safecoin, elle, annule proprement — deux comportements
 * opposés pour un même geste, selon l'ancienneté de l'organisation.
 *
 * La décision vit ici, en fonction PURE : c'est de l'argent, et elle doit se
 * vérifier sans base ni routeur.
 */

export type VerdictDebit =
  | { ok: true }
  | { ok: false; motif: "solde_insuffisant"; manqueCents: number };

/**
 * Le portefeuille peut-il couvrir ce montant ?
 *
 * Un solde EXACTEMENT égal au prix passe : refuser le dernier franc n'aurait
 * aucun sens pour l'exploitant qui vient de recharger au centime près.
 */
export function verdictDebitWallet(soldeCents: number, prixCents: number): VerdictDebit {
  if (soldeCents >= prixCents) return { ok: true };
  return {
    ok: false,
    motif: "solde_insuffisant",
    /* Ce qu'il manque, pas le prix : c'est le montant que l'exploitant doit
       recharger, et un solde négatif doit l'augmenter d'autant. */
    manqueCents: prixCents - soldeCents,
  };
}

/** Ce que lit l'exploitant quand le solde ne suffit pas. */
export function messageSoldeInsuffisant(manqueCents: number): string {
  const manque = manqueCents.toLocaleString("fr-FR");
  return (
    `Solde du portefeuille insuffisant : il manque ${manque} FCFA. ` +
    `Rechargez le portefeuille, ou payez cette activation en ligne.`
  );
}
