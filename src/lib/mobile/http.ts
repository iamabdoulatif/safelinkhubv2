import { can, type Capability } from "@/lib/auth/roles";
import { createSessionToken, getSession, type SessionPayload } from "@/lib/auth/session";

/**
 * Socle de l'API mobile (/api/mobile/v1) — pour une future app React Native.
 *
 * Authentification : le MÊME jeton de session que le site, envoyé en
 * « Authorization: Bearer <jeton> » (getSession l'accepte). Les droits sont
 * donc strictement ceux du compte sur le web : organisation, rôle, capacités.
 *
 * Erreurs : toujours { error: { code, message } } avec le bon statut HTTP —
 * l'app peut brancher sur `code` sans analyser de texte.
 */

/** Durée de vie du jeton, en secondes (identique au cookie web). */
export const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>) {
  return Response.json({ error: { code, message, ...extra } }, { status });
}

export async function issueToken(user: SessionPayload) {
  return {
    token: await createSessionToken(user),
    tokenType: "Bearer" as const,
    expiresIn: TOKEN_TTL_SECONDS,
    user: { id: user.userId, orgId: user.orgId, email: user.email, name: user.name, role: user.role },
  };
}

/** Session de l'appelant, ou la réponse d'erreur à renvoyer telle quelle. */
export async function requireMobileSession(
  capability?: Capability,
): Promise<{ session: SessionPayload } | { response: Response }> {
  const session = await getSession();
  if (!session) {
    return { response: apiError(401, "unauthorized", "Jeton absent, invalide ou expiré.") };
  }
  if (capability && !can(session.role, capability)) {
    return { response: apiError(403, "forbidden", "Votre rôle ne permet pas cette action.") };
  }
  return { session };
}

/** Corps JSON, ou null s'il est absent ou mal formé. */
export async function readJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
