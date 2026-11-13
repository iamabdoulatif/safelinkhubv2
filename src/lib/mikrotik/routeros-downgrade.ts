// Rétrograder RouterOS (ex. 7.25 → 7.8) : logique PURE, sans client ni I/O, pour
// être testable et réutilisée par l'action asynchrone (downgrade-job-actions.ts).
//
// Mécanisme RouterOS : on dépose le .npk COMBINÉ de la version cible dans la
// racine du routeur (`/tool fetch` depuis download.mikrotik.com, le routeur
// télécharge par son WAN), puis `/system package downgrade` redémarre et
// installe la version plus ANCIENNE. Un retour sous 7.0 (vers la 6.x) n'est PAS
// possible ainsi — il exige un netinstall hors-ligne — donc on le refuse.

export const ROUTEROS_DOWNLOAD_BASE = "https://download.mikrotik.com/routeros";

// Suffixes d'architecture des paquets MikroTik ; correspond à
// /system/resource architecture-name. On refuse une archi inconnue plutôt que
// de fabriquer une URL qui téléchargerait un paquet pour une autre puce.
const KNOWN_ARCH = new Set(["arm", "arm64", "mipsbe", "mmips", "smips", "tile", "x86", "ppc"]);

/** "7.25", "7.8.1", "7.19.6 (stable)" → [maj, min, patch] ; null si illisible. */
export function parseRosVersion(v: string | null | undefined): [number, number, number] | null {
  const m = String(v ?? "").trim().match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return null;
  return [Number(m[1]), Number(m[2] ?? 0), Number(m[3] ?? 0)];
}

/** -1 / 0 / 1 — compare numériquement (7.8 < 7.24, pas en texte). */
export function compareRosVersion(a: [number, number, number], b: [number, number, number]): number {
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

export function isKnownArch(arch: string): boolean {
  return KNOWN_ARCH.has(arch);
}

export function npkFileName(version: string, arch: string): string {
  return `routeros-${version}-${arch}.npk`;
}

export function npkUrl(version: string, arch: string): string {
  return `${ROUTEROS_DOWNLOAD_BASE}/${version}/${npkFileName(version, arch)}`;
}

export type DowngradeValidation =
  | { ok: true; version: string }
  | { ok: false; error: string };

/**
 * Valide la version cible saisie, connaissant la version actuelle du routeur.
 * - doit être lisible et rester en 7.x (pas de saut 7→6 par cette voie) ;
 * - doit être STRICTEMENT inférieure à l'actuelle (sinon ce n'est pas un recul).
 * Renvoie la version normalisée (`7.8`, `7.8.1`) à utiliser dans l'URL du .npk.
 */
export function validateDowngradeTarget(target: string, currentVersion: string | null): DowngradeValidation {
  const t = parseRosVersion(target);
  if (!t) return { ok: false, error: "Version cible invalide (attendu : 7.8 ou 7.8.1)." };
  if (t[0] !== 7) {
    return {
      ok: false,
      error:
        "Seul un retour en RouterOS 7.x est pris en charge. Descendre en 6.x impose un netinstall hors-ligne (Winbox + Netinstall), impossible à distance.",
    };
  }
  const current = parseRosVersion(currentVersion);
  if (current && compareRosVersion(t, current) >= 0) {
    return {
      ok: false,
      error: `La version cible (${target}) doit être inférieure à la version actuelle (${currentVersion}).`,
    };
  }
  const normalized = String(target).trim().match(/^\d+(?:\.\d+){0,2}/)?.[0];
  if (!normalized) return { ok: false, error: "Version cible invalide (attendu : 7.8 ou 7.8.1)." };
  return { ok: true, version: normalized };
}
