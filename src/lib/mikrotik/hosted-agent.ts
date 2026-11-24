import { isTunnelMethod, tunnelLabel } from "./tunnel-methods";

/**
 * L'agent hébergé s'appuie sur le relais/VPN déjà établi par SafeLinkHub.
 * Un routeur direct reste volontairement hors de ce parcours : il nécessite
 * l'agent local ou une liaison tunnel explicite.
 */
export function hostedAgentEligible(router: {
  connectionMethod: string | null | undefined;
  status: string | null | undefined;
}): boolean {
  return router.status === "online" && isTunnelMethod(router.connectionMethod);
}

export function hostedAgentTransportLabel(method: string | null | undefined): string {
  return tunnelLabel(method);
}
