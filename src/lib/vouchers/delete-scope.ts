// Module « plain » : type et garde partagés entre l'action serveur et l'UI.
// Ils ne peuvent pas vivre dans actions.ts — un module "use server" n'exporte
// que des fonctions async, et une fonction synchrone y ferait échouer le build.

/**
 * Portée d'une suppression définitive de tickets.
 *
 * "platform"            — la ligne disparaît de SafeLinkHub, le compte hotspot
 *                         RESTE sur le MikroTik et continue de donner accès.
 * "platform_and_router" — le compte hotspot est aussi retiré du routeur.
 *
 * Le défaut de l'interface est "platform" : c'est la seule des deux qui ne
 * touche pas au matériel, donc la seule qu'on puisse proposer sans risque.
 */
export type VoucherDeleteScope = "platform" | "platform_and_router";

export const VOUCHER_DELETE_SCOPES: VoucherDeleteScope[] = ["platform", "platform_and_router"];

export function isVoucherDeleteScope(value: string): value is VoucherDeleteScope {
  return value === "platform" || value === "platform_and_router";
}

export type VoucherDeleteResult = {
  success: true;
  /** Lignes réellement supprimées de la plateforme. */
  deleted: number;
  /** Comptes hotspot retirés des routeurs. */
  removedOnRouter: number;
  /** Tickets volontairement CONSERVÉS faute d'avoir pu nettoyer leur routeur. */
  keptForUnreachableRouter: number;
  /** Reste à traiter au prochain passage (plafond atteint). */
  remaining: number;
  /** Noms des routeurs injoignables, pour le message d'interface. */
  unreachableRouters: string[];
};
