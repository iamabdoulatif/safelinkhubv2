/**
 * Étapes de l'auto-setup, dans l'ordre où provisionHotspotStack les déroule.
 *
 * Partagé entre le moteur (qui signale l'étape qu'il ATTAQUE) et l'écran
 * d'installation (qui en déduit : avant = fait, courante = en cours, après =
 * à venir). Hors du fichier "use server" : celui-ci ne peut exporter que des
 * fonctions asynchrones.
 */
export const AUTOSETUP_STEPS = [
  "connect",
  "wifi",
  "network",
  "hotspot",
  "portal",
  "firewall",
  "mikhmon",
  "packages",
  "reboot",
] as const;

export type AutoSetupStep = (typeof AUTOSETUP_STEPS)[number];

export type AutoSetupHooks = {
  /** Appelé au DÉBUT de chaque étape. Ne doit jamais faire échouer l'installation. */
  onStep?: (step: AutoSetupStep) => Promise<void> | void;
};

/** Rang d'une étape ; -1 si inconnue. */
export function stepIndex(step: string | null | undefined): number {
  return AUTOSETUP_STEPS.indexOf(step as AutoSetupStep);
}

/** État d'une étape du plan à partir de l'étape en cours côté serveur. */
export function stepStatus(
  step: AutoSetupStep,
  current: string | null | undefined,
): "done" | "active" | "pending" {
  const at = stepIndex(current);
  const me = stepIndex(step);
  if (at < 0 || me > at) return "pending";
  return me === at ? "active" : "done";
}
