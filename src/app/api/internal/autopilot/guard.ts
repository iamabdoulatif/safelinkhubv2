import { bearerMatches } from "@/lib/auth/bearer";

/**
 * Contrat service-à-service avec SafeLink Auto-Pilot (même VPS, réseau Docker
 * partagé) : secret AUTOPILOT_INTERNAL_TOKEN ET appel direct. Une requête
 * venue d'Internet passe par Traefik, qui pose x-real-ip et x-forwarded-server :
 * elle est refusée même avec le bon secret. (x-forwarded-for ne sert à rien
 * ici : Next.js le pose lui-même sur chaque requête, appels internes compris.)
 */
export function autopilotCallAllowed(request: Request): boolean {
  if (request.headers.get("x-real-ip") || request.headers.get("x-forwarded-server")) return false;
  return bearerMatches(request, process.env.AUTOPILOT_INTERNAL_TOKEN);
}

export const notFound = () => new Response("Not found", { status: 404 });
