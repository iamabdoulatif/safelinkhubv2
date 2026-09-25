import { issueToken, requireMobileSession } from "@/lib/mobile/http";

/**
 * POST /api/mobile/v1/auth/refresh  (Bearer)
 * Échange un jeton encore valide contre un neuf : l'app le rappelle au
 * démarrage pour qu'un utilisateur actif ne soit jamais déconnecté.
 */
export async function POST() {
  const auth = await requireMobileSession();
  if ("response" in auth) return auth.response;
  return Response.json(await issueToken(auth.session));
}
