import { NextRequest, NextResponse } from "next/server";
import { and, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hashToken } from "@/lib/auth/tokens";
import {
  createSessionToken,
  SESSION_COOKIE_NAME,
  sessionCookieOptions,
} from "@/lib/auth/session";

/**
 * Activation du compte via un FORMULAIRE HTML classique (pas un Server Action).
 *
 * Pourquoi une Route Handler et pas l'action serveur `activateAccount` : l'URL
 * `/api/auth/activate` est STABLE d'un build à l'autre, alors qu'un Server
 * Action porte un identifiant lié au build. Un lien d'email ouvert autour d'un
 * redéploiement (fréquents ici) — ou cliqué avant l'hydratation JS — envoyait
 * un identifiant d'action périmé et échouait à la 1ʳᵉ tentative ; un renvoi
 * rechargeait une page fraîche et « réparait » le problème. Ce POST HTML pur
 * fonctionne même sans JS et quel que soit le build de la page.
 *
 * ⚠️ Redirections RELATIVES obligatoires : dans le conteneur, `request.url`
 * vaut `http://0.0.0.0:3000` (adresse d'écoute interne, derrière Traefik), donc
 * une URL absolue dérivée de request.url renvoie le navigateur vers
 * `https://0.0.0.0:3000/...` → ERR_FAILED. Un `Location` relatif est résolu par
 * le navigateur contre l'URL PUBLIQUE (safelinkhub.io).
 */
function seeOther(location: string): NextResponse {
  return new NextResponse(null, { status: 303, headers: { Location: location } });
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const token = String(form?.get("token") ?? "").trim();

  if (!token) return seeOther("/auth/activation?error=invalid");

  const db = getDb();
  const [user] = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.activationTokenHash, hashToken(token)),
        gt(users.activationTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!user) {
    // Token invalide OU déjà consommé (compte peut-être déjà activé, p. ex. un
    // scanner de lien) → page qui propose renvoi + connexion.
    return seeOther("/auth/activation?error=invalid");
  }

  await db
    .update(users)
    .set({
      emailVerified: true,
      activationTokenHash: null,
      activationTokenExpiresAt: null,
    })
    .where(eq(users.id, user.id));

  const jwt = await createSessionToken({
    userId: user.id,
    orgId: user.orgId,
    email: user.email,
    name: user.name,
    role: user.role,
  });

  const res = seeOther("/admin");
  res.cookies.set(SESSION_COOKIE_NAME, jwt, sessionCookieOptions());
  return res;
}

// Un GET direct (scanner, préchargement) ne consomme rien : on renvoie
// simplement vers la page d'activation qui affichera le bouton de confirmation.
export function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  return seeOther(
    token ? `/auth/activation?token=${encodeURIComponent(token)}` : "/auth/activation",
  );
}
