/* Hors du fichier "use server" : celui-ci ne peut exporter que des fonctions
   async, et l'écran a besoin des valeurs par défaut et du type. */
/** Seuils tels qu'édités à l'écran (Go / minutes), convertis en Mo en base. */
export type RegulationForm = {
  enabled: boolean;
  softCapGo: number;
  hardCapGo: number;
  safety: number;
  dayCriticalRatio: number;
  blockLimit: string;
  abuseThresholdGo: number;
  abuseBlockMinutes: number;
  abuseMaxOffenses: number;
};

export const REGULATION_DEFAULTS: RegulationForm = {
  enabled: false,
  softCapGo: 4608, // 4,5 To
  hardCapGo: 5120, // 5 To
  safety: 0.95,
  dayCriticalRatio: 1.1,
  blockLimit: "64k/64k",
  abuseThresholdGo: 1,
  abuseBlockMinutes: 180,
  abuseMaxOffenses: 3,
};

