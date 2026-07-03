import { getSession } from "@/lib/auth/session";

/**
 * État de session minimal pour les composants client des pages publiques
 * (LandingNav) : le cookie étant httpOnly, ils ne peuvent pas le lire
 * eux-mêmes, et lire cookies() dans les pages rendrait statiques (/,
 * /blog, /contact) dynamiques. On n'expose volontairement que le strict
 * nécessaire — pas d'email ni d'identifiants.
 */
export async function GET() {
  const session = await getSession();
  return Response.json(
    { authenticated: Boolean(session) },
    { headers: { "cache-control": "no-store" } },
  );
}
