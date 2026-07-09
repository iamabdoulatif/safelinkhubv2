// Correspondance forfait SaaS → profil hotspot RouterOS. Les profils installés
// sur le routeur (voir voucher-profiles.ts / provisionHotspotStack) ont des
// durées FIXES : 5 min, 1 j, 5 j, 1 sem, 2 sem, 1 mois. La durée réelle d'un
// voucher = celle du profil (sa logique d'expiration est dans son on-login).
// On exige donc une correspondance EXACTE avec la durée du forfait : pas de
// "au plus proche" qui donnerait un ticket d'une durée différente de ce que le
// client a payé. Module "plain" (pas de "use server") — importable partout.

import { VOUCHER_PROFILES } from "./voucher-profiles";

const CODE_UNIT_MINUTES: Record<string, number> = { m: 1, h: 60, d: 1440, w: 10080 };

/** Convertit un durationCode de profil ("5m", "1d", "30d"…) en minutes. */
function profileCodeMinutes(code: string): number | null {
  const match = /^(\d+)([mhdw])$/.exec(code.trim());
  if (!match) return null;
  return Number(match[1]) * CODE_UNIT_MINUTES[match[2]];
}

const PKG_UNIT_MINUTES: Record<string, number> = {
  minute: 1,
  minutes: 1,
  min: 1,
  mins: 1,
  hour: 60,
  hours: 60,
  day: 1440,
  days: 1440,
  week: 10080,
  weeks: 10080,
  month: 43200, // 30 jours, pour coller au profil "01-MOIS"
  months: 43200,
};

/** Durée d'un forfait (valeur + unité) en minutes, ou null si unité inconnue. */
function packageDurationMinutes(value: number, unit: string): number | null {
  const per = PKG_UNIT_MINUTES[unit.trim().toLowerCase()];
  if (!per || !Number.isFinite(value) || value <= 0) return null;
  return value * per;
}

/**
 * Nom du profil hotspot RouterOS correspondant EXACTEMENT à la durée du
 * forfait, ou null s'il n'y a pas de correspondance (le forfait doit alors être
 * ajusté à une durée supportée).
 */
export function packageProfileName(durationValue: number, durationUnit: string): string | null {
  const minutes = packageDurationMinutes(durationValue, durationUnit);
  if (minutes === null) return null;
  for (const profile of VOUCHER_PROFILES) {
    if (profileCodeMinutes(profile.durationCode) === minutes) return profile.name;
  }
  return null;
}

/** Libellé lisible des durées supportées (pour les messages d'erreur). */
export const SUPPORTED_PROFILE_DURATIONS = VOUCHER_PROFILES.map((p) => p.label).join(", ");
