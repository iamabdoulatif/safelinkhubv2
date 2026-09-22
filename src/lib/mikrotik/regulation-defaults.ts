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
  /** % du débit de chaque forfait conservé pendant un freinage ; 0 = désactivé. */
  profileThrottlePct: number;
  /** Débit laissé au téléchargeur abusif pendant son bridage (« 256k/256k »). */
  abuseThrottleLimit: string;
};

export const REGULATION_DEFAULTS: RegulationForm = {
  enabled: false,
  softCapGo: 4608, // 4,5 To
  hardCapGo: 5120, // 5 To
  safety: 0.95,
  dayCriticalRatio: 1.1,
  blockLimit: "64k/64k",
  abuseThresholdGo: 1,
  // Une pause de 2 h par dépassement, dix avant la suspension définitive :
  // la cascade demandée par l'exploitation (voir RegulationPanel).
  abuseBlockMinutes: 120,
  abuseMaxOffenses: 10,
  profileThrottlePct: 0,
  abuseThrottleLimit: "256k/256k",
};

