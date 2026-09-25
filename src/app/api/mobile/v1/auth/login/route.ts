import { verifyCredentials } from "@/lib/auth/password-login";
import { signMfaPendingToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/auth/client-ip";
import { apiError, issueToken, readJson } from "@/lib/mobile/http";

/**
 * POST /api/mobile/v1/auth/login  { email, password }
 * 200 → { token, tokenType, expiresIn, user }
 * 200 → { mfaRequired: true, mfaToken } : envoyer le code à /auth/mfa
 */
export async function POST(request: Request) {
  const body = await readJson<{ email?: string; password?: string }>(request);
  const result = await verifyCredentials(String(body?.email ?? ""), String(body?.password ?? ""), await getClientIp());

  switch (result.kind) {
    case "missing":
      return apiError(400, "missing_credentials", "E-mail et mot de passe requis.");
    case "rate-limited":
      return apiError(429, "rate_limited", "Trop de tentatives, réessayez plus tard.", {
        retryAfterSeconds: result.retryAfterSeconds,
      });
    case "invalid":
      return apiError(401, "invalid_credentials", "E-mail ou mot de passe incorrect.");
    case "inactive":
      return apiError(403, "account_inactive", "Compte non activé : ouvrez le lien reçu par e-mail.");
    case "mfa":
      // Jeton d'audience « mfa » : il ne vaut PAS une session (verifySessionToken le refuse).
      return Response.json({
        mfaRequired: true,
        mfaToken: await signMfaPendingToken({ ...result.user, callback: "/admin" }),
      });
    case "ok":
      return Response.json(await issueToken(result.user));
  }
}
