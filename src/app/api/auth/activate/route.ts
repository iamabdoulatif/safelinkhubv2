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
import { isLocale } from "@/lib/i18n/config";
import { LOCALE_COOKIE, LOCALE_COOKIE_OPTIONS } from "@/lib/i18n/server";

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
  const locale = String(form?.get("locale") ?? "");
  const prefix = locale === "en" ? "/en" : "";

  if (!token) return seeOther(`${prefix}/auth/activation?error=invalid`);

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
    return seeOther(`${prefix}/auth/activation?error=invalid`);
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
  if (isLocale(locale)) res.cookies.set(LOCALE_COOKIE, locale, LOCALE_COOKIE_OPTIONS);
  return res;
}

// Un GET direct (scanner, préchargement) ne consomme rien : on renvoie
// simplement vers la page d'activation qui affichera le bouton de confirmation.
export function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const prefix = new URL(request.url).pathname.startsWith("/en/") ? "/en" : "";
  return seeOther(
    token ? `${prefix}/auth/activation?token=${encodeURIComponent(token)}` : `${prefix}/auth/activation`,
  );
}
