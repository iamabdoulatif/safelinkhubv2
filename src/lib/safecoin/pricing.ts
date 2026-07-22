import { DEFAULT_SC_RATE_FCFA, SC_SCALE } from "./constants";

function assertRate(rate: number) {
  if (!Number.isInteger(rate) || rate <= 0) {
    throw new Error("Le taux Safecoin est invalide.");
  }
}

/** Convertit des FCFA entiers en centièmes de Safecoin, sans flottants. */
export function fcfaToScCents(fcfa: number, rate = DEFAULT_SC_RATE_FCFA) {
  if (!Number.isInteger(fcfa)) throw new Error("Le montant FCFA doit être entier.");
  if (fcfa < 0) throw new Error("Le montant FCFA doit être positif.");
  assertRate(rate);
  return Math.ceil((fcfa * SC_SCALE) / rate);
}

/** Convertit des centièmes de Safecoin en FCFA de référence. */
export function scCentsToFcfa(scCents: number, rate = DEFAULT_SC_RATE_FCFA) {
  if (!Number.isInteger(scCents) || scCents < 0) {
    throw new Error("Le montant SC est invalide.");
  }
  assertRate(rate);
  return Math.round((scCents * rate) / SC_SCALE);
}

export const priceScInCents = fcfaToScCents;

export function formatSc(scCents: number) {
  if (!Number.isInteger(scCents)) throw new Error("Le montant SC est invalide.");
  return `${(scCents / SC_SCALE).toLocaleString("fr-FR", {
    maximumFractionDigits: 2,
  })} SC`;
}
