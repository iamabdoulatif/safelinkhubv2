// Expiration d'un voucher hotspot.
//
// Un voucher n'a de date d'expiration ABSOLUE que lorsqu'une horloge a
// démarré : soit la première connexion (facturation « À la première
// utilisation », le cas par défaut), soit l'achat (« À l'achat »). Tant que
// rien n'a démarré, la seule information certaine est la DURÉE de validité —
// d'où l'ancien affichage « Jamais », qui était trompeur.
//
// computeVoucherExpiry() renvoie donc une date exacte dès qu'elle existe, et
// sinon un libellé de durée (« Valide 1 jour dès la 1ʳᵉ connexion ») plutôt
// que « Jamais ».

export type PackageDuration = {
  durationValue: number;
  durationUnit: string; // "Minutes" | "Hours" | "Days" | "Weeks" | "Months"
  billingStartsOn: string; // "Upon First Use" | "Upon Purchase"
};

const UNIT_MS: Record<string, number> = {
  Minutes: 60_000,
  Hours: 3_600_000,
  Days: 86_400_000,
  Weeks: 7 * 86_400_000,
  // Un mois = 30 jours, cohérent avec le préréglage MikroTik "01-MOIS" (30d).
  Months: 30 * 86_400_000,
};

const UNIT_WORD: Record<string, { one: string; many: string }> = {
  Minutes: { one: "minute", many: "minutes" },
  Hours: { one: "heure", many: "heures" },
  Days: { one: "jour", many: "jours" },
  Weeks: { one: "semaine", many: "semaines" },
  Months: { one: "mois", many: "mois" },
};

export function durationToMs(pkg: PackageDuration): number {
  const step = UNIT_MS[pkg.durationUnit] ?? UNIT_MS.Hours;
  return pkg.durationValue * step;
}

export function addDuration(from: Date, pkg: PackageDuration): Date {
  return new Date(from.getTime() + durationToMs(pkg));
}

/** « 1 jour », « 12 heures », « 3 mois ». */
export function formatDurationHuman(pkg: PackageDuration): string {
  const word = UNIT_WORD[pkg.durationUnit] ?? UNIT_WORD.Hours;
  return `${pkg.durationValue} ${pkg.durationValue === 1 ? word.one : word.many}`;
}

// Mots de durée des noms de profil hotspot (presets + profils personnalisés,
// cf. voucher-profiles.ts buildCustomProfileName : "05-MINS", "01-JOUR",
// "05-JOURS", "01-SEMAINE", "02-SEMAINES", "01-MOIS", "12-HEURES"…).
const PROFILE_WORD_TO_UNIT: Record<string, string> = {
  MIN: "Minutes",
  MINS: "Minutes",
  MINUTE: "Minutes",
  MINUTES: "Minutes",
  H: "Hours",
  HEURE: "Hours",
  HEURES: "Hours",
  JOUR: "Days",
  JOURS: "Days",
  SEMAINE: "Weeks",
  SEMAINES: "Weeks",
  MOIS: "Months",
};

/**
 * Déduit la durée de validité du NOM DE PROFIL hotspot figé sur le voucher
 * (`vouchers.profileName`, ex. "05-JOURS"). Sert de repli quand le forfait
 * d'origine a disparu (packageId passé à NULL après un élagage de l'auto-setup) :
 * le voucher garde son profil, donc sa durée réelle — l'afficher « — » alors que
 * l'info existe était le bug. billingStartsOn = « Upon First Use » car les profils
 * MikHmon démarrent le décompte à la première connexion (on-login).
 */
export function durationFromProfileName(name: string | null): PackageDuration | null {
  if (!name) return null;
  const m = /^(\d+)-([A-Za-zÉÈéè]+)$/.exec(name.trim());
  if (!m) return null;
  const value = Number(m[1]);
  const unit = PROFILE_WORD_TO_UNIT[m[2].toUpperCase()];
  if (!value || !unit) return null;
  return { durationValue: value, durationUnit: unit, billingStartsOn: "Upon First Use" };
}

export type VoucherTiming = {
  expiresAt: Date | null;
  firstLoginAt: Date | null;
  createdAt: Date;
};

export type ExpiryResult =
  // Date d'expiration connue et figée.
  | { kind: "date"; date: Date }
  // Pas encore démarré : on connaît seulement la durée de validité.
  | { kind: "pending"; validity: string }
  // Aucune donnée de forfait exploitable.
  | { kind: "unknown" };

export function computeVoucherExpiry(
  v: VoucherTiming,
  pkg: PackageDuration | null,
): ExpiryResult {
  // 1. Expiration déjà figée en base (voucher consommé / réglé).
  if (v.expiresAt) return { kind: "date", date: v.expiresAt };

  if (!pkg) return { kind: "unknown" };

  // 2. L'horloge a démarré à la première connexion.
  if (v.firstLoginAt) {
    return { kind: "date", date: addDuration(v.firstLoginAt, pkg) };
  }

  // 3. Forfait facturé/activé à l'achat → l'horloge démarre à la création.
  if (pkg.billingStartsOn === "Upon Purchase") {
    return { kind: "date", date: addDuration(v.createdAt, pkg) };
  }

  // 4. « À la première utilisation » et jamais utilisé : pas de date absolue,
  //    mais on affiche la durée au lieu de « Jamais ».
  return { kind: "pending", validity: formatDurationHuman(pkg) };
}
