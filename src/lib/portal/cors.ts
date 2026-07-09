// En-têtes CORS pour les endpoints PUBLICS du portail captif : la page login
// est servie par le ROUTEUR (origine différente de safelinkhub.io), donc ses
// appels fetch (OTP, initiate, status) sont cross-origin. Aucune session /
// cookie n'est utilisée → `*` est sans risque ici. Module partagé.

export const PORTAL_CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** JSON + en-têtes CORS. */
export function corsJson(body: unknown, init?: { status?: number }): Response {
  return Response.json(body, { status: init?.status ?? 200, headers: PORTAL_CORS_HEADERS });
}

/** Réponse au préflight OPTIONS. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: PORTAL_CORS_HEADERS });
}
