// Correspondance forfait SaaS → profil hotspot RouterOS. Le nom du profil est
// DÉRIVÉ de la durée via la MÊME convention que l'auto-setup
// (buildCustomProfileName) — ex. "3 Days" → "03-JOURS" — et non plus limité aux
// 6 presets. Le profil correspondant est créé à la demande sur le routeur s'il
// manque (voir voucher-profile-provision.ts, appelé par fulfill.ts). Module
// "plain" (pas de "use server") — importable partout.

import {
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
 * Nom du profil hotspot RouterOS pour la durée du forfait, ou null si l'unité
 * est inconnue. Le profil peut ne pas encore exister sur le routeur : l'appelant
 * le crée à la demande (ensureVoucherProfileOnRouter).
 */
export function packageProfileName(durationValue: number, durationUnit: string): string | null {
  const unit = unitOf(durationUnit);
  if (!unit || !Number.isFinite(durationValue) || durationValue <= 0) return null;
  return buildCustomProfileName(durationValue, unit);
}

/** Définition COMPLÈTE du profil (on-login + planificateur), pour le créer sur le routeur si absent. */
export function voucherProfileForPackage(
  durationValue: number,
  durationUnit: string,
  priceCents: number,
): VoucherProfile | null {
  const unit = unitOf(durationUnit);
  if (!unit || !Number.isFinite(durationValue) || durationValue <= 0) return null;
  return buildVoucherProfile({
    name: buildCustomProfileName(durationValue, unit),
    label: buildCustomProfileLabel(durationValue, unit),
    durationCode: buildCustomDurationCode(durationValue, unit),
    price: priceCents,
  });
}

/** Libellé lisible des durées des 6 presets fournis (messages d'aide). */
export const SUPPORTED_PROFILE_DURATIONS = VOUCHER_PROFILES.map((p) => p.label).join(", ");
