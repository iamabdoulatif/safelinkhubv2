import { bearerMatches } from "@/lib/auth/bearer";

/**
 * Contrat service-à-service avec SafeLink Auto-Pilot (même VPS, réseau Docker
 * partagé) : secret AUTOPILOT_INTERNAL_TOKEN ET appel direct (aucun en-tête de
 * proxy). Une requête venue d'Internet passe par Traefik, qui pose
 * x-forwarded-for : elle est refusée même avec le bon secret.
 */
export function autopilotCallAllowed(request: Request): boolean {
  if (request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")) return false;
  return bearerMatches(request, process.env.AUTOPILOT_INTERNAL_TOKEN);
}

export const notFound = () => new Response("Not found", { status: 404 });
