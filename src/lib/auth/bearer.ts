import { timingSafeEqual } from "node:crypto";

/**
 * Compare en temps constant le header `Authorization: Bearer <secret>` au secret
 * attendu. Les contrats service-à-service (CRON_SECRET, N8N_INTERNAL_TOKEN) se
 * comparaient avec `===`, qui court-circuite au premier octet divergent — le
 * reste du code authentifie déjà par `timingSafeEqual` (roaming) ou par lookup
 * du hash en base (install-token, agent-link). On aligne ces derniers points.
 *
 * `secret` absent → false (jamais « autorisé » faute de secret configuré).
 */
export function bearerMatches(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;
  const got = Buffer.from(request.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  // timingSafeEqual exige des longueurs égales ; la comparer d'abord ne fuit
  // que la longueur du secret (fixe et non secrète), pas son contenu.
  return got.length === want.length && timingSafeEqual(got, want);
}
