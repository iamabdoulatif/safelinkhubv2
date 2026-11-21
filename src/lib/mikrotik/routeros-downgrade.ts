// Rétrograder RouterOS (ex. 7.25 → 7.8, ou 7.25 → 6.49) : logique PURE, sans
// client ni I/O, pour être testable et réutilisée par l'action asynchrone
// (downgrade-job-actions.ts).
//
// Mécanisme RouterOS : on dépose le .npk COMBINÉ de la version cible dans la
// racine du routeur (`/tool fetch` depuis download.mikrotik.com, le routeur
// télécharge par son WAN), puis `/system package downgrade` redémarre et
// installe la version plus ANCIENNE. Même mécanisme pour un retour en 6.x — à
// DEUX conditions que ce module ne peut pas vérifier seul (elles le sont dans
// le job, qui lit l'appareil) :
//   1. le matériel doit descendre aussi bas : RouterOS refuse d'installer en
//      dessous du plancher `minimum-version` / `factory-software` du routeur
//      (une carte livrée en 7.x n'a souvent aucune 6.x où revenir) ;
//   2. le nom du .npk n'est pas rangé pareil selon la branche (voir npkFileName).
// Sous la 6.0, plus de .npk en ligne : ça impose un netinstall hors-ligne, refusé.

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
  // Piège réel : MikroTik range le nom à l'envers entre les deux branches.
  //   v7 : routeros-<version>-<arch>.npk   (ex. routeros-7.8-arm64.npk)
  //   v6 : routeros-<arch>-<version>.npk   (ex. routeros-mipsbe-6.49.18.npk)
  // Se tromper = une URL en 404, donc un téléchargement avorté (rattrapé à
  // l'étape « verify » du job), jamais un paquet installé de travers.
  const p = parseRosVersion(version);
  return p && p[0] <= 6
    ? `routeros-${arch}-${version}.npk`
    : `routeros-${version}-${arch}.npk`;
}

export function npkUrl(version: string, arch: string): string {
  return `${ROUTEROS_DOWNLOAD_BASE}/${version}/${npkFileName(version, arch)}`;
}

export type DowngradeValidation =
  | { ok: true; version: string; crossMajor: boolean }
  | { ok: false; error: string };

/**
 * Valide la version cible saisie, connaissant la version actuelle du routeur.
 * - doit être lisible et rester en 6.x ou 7.x (sous la 6.0 = netinstall) ;
 * - doit être STRICTEMENT inférieure à l'actuelle (sinon ce n'est pas un recul).
 * Renvoie la version normalisée (`7.8`, `6.49.18`) pour l'URL du .npk, et
 * `crossMajor` (7→6) pour que l'appelant avertisse : franchir la majeure peut
 * corrompre la configuration (incompatible entre branches).
 *
 * Ce que ce module NE vérifie PAS, faute de connaître l'appareil : le plancher
 * matériel `minimum-version`. Le job le lit et refuse une cible en dessous.
 */
export function validateDowngradeTarget(target: string, currentVersion: string | null): DowngradeValidation {
  const t = parseRosVersion(target);
  if (!t) return { ok: false, error: "Version cible invalide (attendu : 7.8, 7.8.1 ou 6.49.18)." };
  if (t[0] < 6) {
    return {
      ok: false,
      error:
        "Trop bas : sous RouterOS 6.0 il n'existe plus de paquet en ligne. Un tel retour impose un netinstall hors-ligne (Winbox + Netinstall), impossible à distance.",
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
  if (!normalized) return { ok: false, error: "Version cible invalide (attendu : 7.8, 7.8.1 ou 6.49.18)." };
  return { ok: true, version: normalized, crossMajor: !!current && t[0] < current[0] };
}

/**
 * La cible est-elle SOUS le plancher matériel du routeur ? RouterOS refuse
 * d'installer en dessous de `minimum-version` (anciennement `factory-software`,
 * lus dans /system/resource/print) : une carte livrée en 7.x n'a aucune 6.x où
 * revenir. On lit ce plancher sur l'appareil et on bloque AVANT le long
 * téléchargement, plutôt que de laisser le downgrade échouer au redémarrage.
 * Plancher absent/illisible → null (on laisse RouterOS trancher lui-même).
 */
export function belowHardwareFloor(targetVersion: string, floor: string | null | undefined): boolean | null {
  const f = parseRosVersion(floor);
  const t = parseRosVersion(targetVersion);
  if (!f || !t) return null;
  return compareRosVersion(t, f) < 0;
}
