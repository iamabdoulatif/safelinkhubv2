// Constantes et helpers PURS des passes d'accès temporaire — sans aucun import
// serveur, pour être consommables depuis les Client Components (le driver pg de
// getDb() ne doit jamais entrer dans un bundle navigateur).

export const TEMPORARY_ACCESS_DURATIONS = {
  hour_1: { label: "1 heure", milliseconds: 60 * 60 * 1000 },
  hour_2: { label: "2 heures", milliseconds: 2 * 60 * 60 * 1000 },
  day_7: { label: "7 jours", milliseconds: 7 * 24 * 60 * 60 * 1000 },
  day_10: { label: "10 jours", milliseconds: 10 * 24 * 60 * 60 * 1000 },
} as const;

export type TemporaryAccessDuration = keyof typeof TEMPORARY_ACCESS_DURATIONS;
export type TemporaryAccessReason = "promo" | "referral" | "reward" | "support" | "operations" | "other";
export type TemporaryAccessStatus = "scheduled" | "active" | "expired" | "revoked";

export function isTemporaryAccessDuration(value: string): value is TemporaryAccessDuration {
  return value in TEMPORARY_ACCESS_DURATIONS;
}

export function isTemporaryAccessReason(value: string): value is TemporaryAccessReason {
  return ["promo", "referral", "reward", "support", "operations", "other"].includes(value);
}

export function expiresAtFor(duration: TemporaryAccessDuration, startsAt = new Date()) {
  return new Date(startsAt.getTime() + TEMPORARY_ACCESS_DURATIONS[duration].milliseconds);
}

export function isGrantUsable(
  grant: { status: string; startsAt: Date; expiresAt: Date },
  now = new Date(),
) {
  return (
    (grant.status === "active" || grant.status === "scheduled") &&
    now.getTime() >= grant.startsAt.getTime() &&
    now.getTime() < grant.expiresAt.getTime()
  );
}

export function grantCovers(
  grant: { routerId: string | null; services: string[] },
  routerId: string,
  service: string,
) {
  const routerMatches = grant.routerId === null || grant.routerId === routerId;
  const serviceMatches = grant.services.length === 0 || grant.services.includes(service);
  return routerMatches && serviceMatches;
}
