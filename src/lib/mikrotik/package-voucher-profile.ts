// Correspondance forfait SaaS → profil hotspot RouterOS. Le nom du profil est
// DÉRIVÉ de la durée via la MÊME convention que l'auto-setup
// (buildCustomProfileName) — ex. "3 Days" → "03-JOURS" — et non plus limité aux
// 6 presets. Le profil correspondant est créé à la demande sur le routeur s'il
// manque (voir voucher-profile-provision.ts, appelé par fulfill.ts). Module
// "plain" (pas de "use server") — importable partout.

import {
  buildUnlimitedProfile,
  UNLIMITED_PROFILE_NAME,
  buildCustomProfileName,
  buildCustomProfileLabel,
  buildCustomDurationCode,
  buildVoucherProfile,
  VOUCHER_PROFILES,
  type DurationUnit,
  type VoucherProfile,
} from "./voucher-profiles";

// Unité de forfait (DB : "Days"/"Weeks"/…) → unité de profil. Tolère la casse,
// le singulier/pluriel et quelques variantes courantes.
const UNIT_MAP: Record<string, DurationUnit> = {
  minute: "m",
  minutes: "m",
  min: "m",
  mins: "m",
  hour: "h",
  hours: "h",
  day: "d",
  days: "d",
  week: "w",
  weeks: "w",
  month: "mo",
  months: "mo",
};

function unitOf(durationUnit: string): DurationUnit | null {
  return UNIT_MAP[durationUnit.trim().toLowerCase()] ?? null;
}

/**
 * « Illimité » n'est pas une unité de durée : c'est l'absence d'échéance. On le
 * reconnaît donc à part, avant toute conversion, et on tolère les graphies
 * courantes (avec ou sans accent, français ou anglais).
 */
const UNLIMITED_UNITS = new Set(["unlimited", "illimite", "illimité", "infini", "none"]);

export function isUnlimitedUnit(durationUnit: string): boolean {
  return UNLIMITED_UNITS.has(durationUnit.trim().toLowerCase());
}

/**
 * Nom du profil hotspot RouterOS pour la durée du forfait, ou null si l'unité
 * est inconnue. Le profil peut ne pas encore exister sur le routeur : l'appelant
 * le crée à la demande (ensureVoucherProfileOnRouter).
 */
export function packageProfileName(durationValue: number, durationUnit: string): string | null {
  if (isUnlimitedUnit(durationUnit)) return UNLIMITED_PROFILE_NAME;
  const unit = unitOf(durationUnit);
  if (!unit || !Number.isFinite(durationValue) || durationValue <= 0) return null;
  return buildCustomProfileName(durationValue, unit);
}

/** Définition COMPLÈTE du profil (on-login + planificateur), pour le créer sur le routeur si absent. */
export function voucherProfileForPackage(
  durationValue: number,
  durationUnit: string,
  priceCents: number,
  options?: {
    /** Different roaming groups may share a router while charging different prices. */
    name?: string;
    uploadMbps?: number;
    downloadMbps?: number;
  },
): VoucherProfile | null {
  if (isUnlimitedUnit(durationUnit)) {
    return buildUnlimitedProfile({
      name: options?.name,
      uploadMbps: options?.uploadMbps,
      downloadMbps: options?.downloadMbps,
    });
  }
  const unit = unitOf(durationUnit);
  if (!unit || !Number.isFinite(durationValue) || durationValue <= 0) return null;
  return buildVoucherProfile({
    name: options?.name ?? buildCustomProfileName(durationValue, unit),
    label: buildCustomProfileLabel(durationValue, unit),
    durationCode: buildCustomDurationCode(durationValue, unit),
    price: priceCents,
    uploadMbps: options?.uploadMbps,
    downloadMbps: options?.downloadMbps,
  });
}

/** Libellé lisible des durées des 6 presets fournis (messages d'aide). */
export const SUPPORTED_PROFILE_DURATIONS = VOUCHER_PROFILES.map((p) => p.label).join(", ");
