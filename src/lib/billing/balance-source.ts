// Module "plain" (pas de "use server") : règle PURE, importable par les server
// actions, la garde de provisionHotspotStack et les tests.

/**
 * Choisit la source de débit d'un service payant vendu à la fois en FCFA et en
 * Safecoins : le PORTEFEUILLE FCFA d'abord, les Safecoins seulement s'il ne
 * couvre pas le montant.
 *
 * Pourquoi le portefeuille d'abord : c'est de l'argent déjà converti, sans
 * frais de service, alors que le coût Safecoin ajoute les frais du barème
 * (`safecoin_fee_rules` + `safecoin_settings`). Épuiser le moins cher en
 * premier est ce que l'utilisateur attend, et c'est la règle qu'appliquait déjà
 * le paiement de l'accès distant.
 *
 * Cette fonction existe pour que les TROIS chemins payants du produit —
 * paywall accès distant, paywall auto-setup, et le débit d'exécution de
 * l'auto-setup quand rien n'a été payé d'avance — ne puissent pas diverger.
 * Ils ont divergé : le débit d'exécution testait la seule EXISTENCE d'un compte
 * Safecoin et ignorait alors complètement le portefeuille, bloquant une org qui
 * avait pourtant de quoi payer en FCFA.
 *
 * Renvoie `null` quand aucun des deux soldes ne suffit.
 */
export function pickBalanceSource(input: {
  /** Solde du portefeuille, en FCFA. */
  walletFcfa: number;
  /** Prix du service, en FCFA. */
  amountFcfa: number;
  /** Solde Safecoin, en centimes de SC. */
  safecoinScCents: number;
  /** Coût du service en centimes de SC, frais de service inclus. */
  requiredScCents: number;
  /**
   * Faux quand l'org n'a pas de compte Safecoin : les Safecoins ne sont alors
   * pas une source possible, quel que soit le solde passé (0).
   */
  safecoinAvailable?: boolean;
}): "wallet" | "safecoin" | null {
  const { walletFcfa, amountFcfa, safecoinScCents, requiredScCents } = input;
  const safecoinAvailable = input.safecoinAvailable ?? true;
  if (walletFcfa >= amountFcfa) return "wallet";
  if (safecoinAvailable && safecoinScCents >= requiredScCents) return "safecoin";
  return null;
}
