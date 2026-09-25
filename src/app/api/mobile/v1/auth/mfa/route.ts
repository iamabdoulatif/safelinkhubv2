import { verifySecondFactor } from "@/lib/auth/password-login";
import { verifyMfaPendingToken } from "@/lib/auth/session";
import { getClientIp } from "@/lib/auth/client-ip";
import { apiError, issueToken, readJson } from "@/lib/mobile/http";

/**
 * POST /api/mobile/v1/auth/mfa  { mfaToken, code }
 * `code` = code TOTP à 6 chiffres ou code de secours.
 * 200 → { token, tokenType, expiresIn, user }
 */
export async function POST(request: Request) {
  const body = await readJson<{ mfaToken?: string; code?: string }>(request);
  const pending = body?.mfaToken ? await verifyMfaPendingToken(body.mfaToken) : null;
  if (!pending) return apiError(401, "mfa_expired", "Étape de connexion expirée, recommencez.");
  const code = String(body?.code ?? "").trim();
  if (!code) return apiError(400, "code_required", "Code requis.");

  const check = await verifySecondFactor(pending, code, await getClientIp());
  if (!check.ok) {
    if (check.reason === "rate-limited") {
      return apiError(429, "rate_limited", "Trop de tentatives, réessayez plus tard.", {
        retryAfterSeconds: check.retryAfterSeconds,
      });
    }
    return check.reason === "config"
      ? apiError(409, "mfa_config", "Configuration MFA invalide.")
      : apiError(401, "invalid_code", "Code incorrect.");
  }

  const { userId, orgId, email, name, role } = pending;
  return Response.json(await issueToken({ userId, orgId, email, name, role }));
}
