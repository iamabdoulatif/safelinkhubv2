/**
 * La ligne d'un routeur et son vocabulaire — extraits de RoutersTable.
 *
 * Ils y vivaient à côté du composant, si bien que la carte et la zone
 * d'attention, pour lire `timeAgo` ou le type d'une ligne, devaient importer
 * l'écran qui les affiche : un cycle d'imports entre parent et enfants. Les
 * données descendent, les types aussi.
 */

import type { AdminDictionary } from "@/lib/i18n/admin/fr";

export type RouterRow = {
  id: string;
  name: string;
  model: string | null;
  host: string | null;
  apiPort: number | null;
  status: string;
  cpuLoad: number | null;
  memoryUsage: string | null;
  activeUsers: number | null;
  lastSyncAtMs: number | null;
  connectionMethod: string;
  /** Routeur « paralysé » : ports + WiFi coupés sauf ether1 (kill-switch). */
  locked?: boolean;
  /** Adresse déjà composée (rue · quartier · commune · pays), "" si inconnue. */
  location?: string;
};

export type RouterDictionary = AdminDictionary["network"]["routers"];

export function timeAgo(ms: number | null, t: RouterDictionary["table"]) {
  if (!ms) return t.never;
  const seconds = Math.floor((Date.now() - ms) / 1000);
  if (seconds < 60) return t.justNow;
  if (seconds < 3600) return t.minuteAgo.replace("{count}", String(Math.floor(seconds / 60)));
  if (seconds < 86400) return t.hourAgo.replace("{count}", String(Math.floor(seconds / 3600)));
  return t.dayAgo.replace("{count}", String(Math.floor(seconds / 86400)));
}
