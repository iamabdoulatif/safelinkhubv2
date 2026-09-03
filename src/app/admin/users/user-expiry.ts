/**
 * Ce qu'un opérateur lit vraiment dans une date d'expiration : le TEMPS QUI
 * RESTE, pas la date. « Gratuit jusqu'au 28 sept. 2026 » oblige à calculer de
 * tête pour savoir s'il faut agir ; « expire dans 6 j » le dit.
 *
 * La date absolue reste disponible dans le tiroir de détail — c'est là qu'on
 * la recopie, pas dans une liste qu'on balaie.
 */
export type ExpiryHint = {
  label: string;
  /** `urgent` = sept jours ou moins, `over` = déjà passé. */
  tone: "none" | "calm" | "urgent" | "over";
};

const JOUR_MS = 24 * 60 * 60 * 1000;

export function expiryHint(expiresAt: string | null, now: Date = new Date()): ExpiryHint {
  if (!expiresAt) return { label: "", tone: "none" };
  const fin = new Date(expiresAt);
  if (Number.isNaN(fin.getTime())) return { label: "", tone: "none" };

  // Différence en JOURS DE CALENDRIER : à 23 h, « demain » doit se lire
  // « demain », pas « dans 0 j ».
  const debutJour = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const jours = Math.round((debutJour(fin) - debutJour(now)) / JOUR_MS);

  if (jours < 0) return { label: jours === -1 ? "expiré hier" : `expiré depuis ${-jours} j`, tone: "over" };
  if (jours === 0) return { label: "expire aujourd'hui", tone: "urgent" };
  if (jours === 1) return { label: "expire demain", tone: "urgent" };
  if (jours <= 7) return { label: `expire dans ${jours} j`, tone: "urgent" };
  if (jours <= 60) return { label: `expire dans ${jours} j`, tone: "calm" };
  const mois = Math.round(jours / 30);
  return { label: `expire dans ${mois} mois`, tone: "calm" };
}
