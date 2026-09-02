/**
 * CONTRÔLE DE CONSOMMATION sur le lien montant (WAN) et par zone WiFi (VLAN).
 *
 * But : rester SOUS le plafond de données d'un forfait — typiquement un
 * Starlink facturé au volume — en mesurant l'usage réel, en alertant à
 * l'approche du cap, et en bridant le débit quand il est atteint. Pas de
 * dissimulation : on lit ce que le routeur consomme et on l'affiche.
 *
 * Deux dimensions, même logique de comptage :
 *   1. QUOTA TOTAL du lien Starlink/fibre — compteur d'octets de l'interface WAN.
 *   2. QUOTA + DÉBIT par zone VLAN — compteur d'octets de l'interface de zone
 *      (le bridge hotspot), plafond de débit via une file d'attente.
 *
 * ─── Le comptage, et pourquoi il n'est pas trivial ──────────────────────────
 *
 * RouterOS n'expose qu'un compteur CUMULATIF depuis le dernier redémarrage
 * (`rx-byte`/`tx-byte`). Deux pièges :
 *
 *   - il RETOMBE À ZÉRO au reboot du routeur. Comparer bêtement deux relevés
 *     donnerait un delta NÉGATIF et ferait reculer la conso du mois.
 *   - il ne connaît pas le cycle de facturation. Un forfait mensuel se remet à
 *     zéro le jour de facturation, pas au reboot.
 *
 * D'où un accumulateur persistant : on garde le DERNIER relevé brut et le total
 * accumulé du cycle. À chaque lecture on ajoute l'écart (ou le relevé entier si
 * le compteur a reculé = reboot), et on repart de zéro au passage d'un cycle.
 * Tout est PUR ici — le comptage se teste sans routeur.
 */

export type LinkType = "fibre" | "starlink" | "autre";

export const LINK_TYPES: { value: LinkType; label: string; hint: string }[] = [
  {
    value: "fibre",
    label: "Fibre",
    hint: "Lien filaire, généralement sans limite de volume — le quota reste optionnel.",
  },
  {
    value: "starlink",
    label: "Starlink",
    hint: "Lien satellite souvent facturé au volume : le quota total évite le dépassement.",
  },
  {
    value: "autre",
    label: "Autre (4G/LTE…)",
    hint: "Tout autre uplink — clé 4G, radio, etc. Souvent limité en volume.",
  },
];

export function linkTypeLabel(t: string | null | undefined): string {
  return LINK_TYPES.find((x) => x.value === t)?.label ?? "Inconnu";
}

// ── Accumulateur ────────────────────────────────────────────────────────────

export type UsageAccumulator = {
  /** Octets accumulés depuis le début du cycle courant. */
  usedBytes: number;
  /** Dernier relevé BRUT du compteur (rx+tx), pour calculer l'écart suivant. */
  lastRaw: number;
  /** Début du cycle de facturation courant. */
  cycleStartedAt: Date | null;
};

/**
 * Début du cycle de facturation le plus récent ≤ `now`, pour un jour de
 * facturation donné (1-28). On borne à 28 pour qu'un cycle existe dans TOUS les
 * mois (février compris) — un « le 31 » n'a pas de sens universel.
 */
export function cycleStart(now: Date, billingDay: number): Date {
  const day = Math.min(28, Math.max(1, Math.floor(billingDay) || 1));
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day, 0, 0, 0, 0));
  // Si le jour de facturation de CE mois n'est pas encore passé, le cycle
  // courant a commencé le mois dernier.
  if (d.getTime() > now.getTime()) d.setUTCMonth(d.getUTCMonth() - 1);
  return d;
}

/**
 * Intègre un nouveau relevé brut dans l'accumulateur.
 *
 * `rawNow` = rx-byte + tx-byte lus à l'instant. Renvoie le nouvel état + deux
 * drapeaux utiles à l'appelant (rollover de cycle, reset de compteur détecté).
 */
export function accumulate(
  prev: UsageAccumulator,
  rawNow: number,
  now: Date,
  billingDay: number,
): UsageAccumulator & { rolledOver: boolean; counterReset: boolean } {
  const start = cycleStart(now, billingDay);
  const rolledOver = prev.cycleStartedAt === null || start.getTime() > prev.cycleStartedAt.getTime();

  // Le compteur a-t-il reculé depuis le dernier relevé ? → reboot du routeur :
  // le nouvel écart est le relevé entier (le compteur repart de 0 au boot).
  const counterReset = rawNow < prev.lastRaw;
  const delta = counterReset ? Math.max(0, rawNow) : rawNow - prev.lastRaw;

  return {
    // Au passage d'un cycle, la conso repart de l'écart de CETTE lecture (le
    // trafic depuis le tout début du nouveau cycle n'est pas mesurable plus
    // finement sans relevé intermédiaire — négligeable à 10 relevés/jour).
    usedBytes: rolledOver ? delta : prev.usedBytes + delta,
    lastRaw: rawNow,
    cycleStartedAt: start,
    rolledOver,
    counterReset,
  };
}

// ── Verdict de quota ────────────────────────────────────────────────────────

export type QuotaState = "unlimited" | "ok" | "warn" | "over";

export type QuotaVerdict = {
  usedBytes: number;
  usedMb: number;
  quotaMb: number | null;
  /** Pourcentage du quota consommé (0 si illimité). */
  pct: number;
  state: QuotaState;
};

/** Seuil d'alerte « on approche du plafond ». */
export const WARN_PCT = 80;

export function quotaVerdict(usedBytes: number, quotaMb: number | null): QuotaVerdict {
  const usedMb = usedBytes / (1024 * 1024);
  if (!quotaMb || quotaMb <= 0) {
    return { usedBytes, usedMb, quotaMb: null, pct: 0, state: "unlimited" };
  }
  const pct = (usedMb / quotaMb) * 100;
  const state: QuotaState = pct >= 100 ? "over" : pct >= WARN_PCT ? "warn" : "ok";
  return { usedBytes, usedMb, quotaMb, pct, state };
}

/** « 12.3 Go », « 840 Mo » — pour l'affichage. */
export function formatBytes(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    const gb = mb / 1024;
    return `${gb.toFixed(gb >= 100 ? 0 : 1)} Go`;
  }
  if (mb >= 1) return `${mb.toFixed(mb >= 10 ? 0 : 1)} Mo`;
  return `${Math.round(bytes / 1024)} Ko`;
}

/** Mbit/s → kbit/s (unité des files RouterOS). Entier positif ou null. */
export function mbpsToKbps(mbps: number | null | undefined): number | null {
  if (!mbps || mbps <= 0) return null;
  return Math.round(mbps * 1000);
}

// ── Files d'attente de zone : plafond du VLAN + débit par client (PCQ) ───────

/**
 * Nom stable des types PCQ posés pour une zone (un par sens). Distinct du nom
 * de la file simple (zoneQueueName dans le reader) — un type et une file ne
 * partagent pas d'espace de noms, mais on garde le préfixe SafeLinkHub pour
 * repérer et purger ce qu'on gère.
 */
export function pcqTypeName(zone: string, dir: "up" | "dn"): string {
  return `SLH-pcq-${zone}-${dir}`;
}

export type ZoneQueuePlan =
  | { kind: "none" }
  | {
      /** max-limit de la file simple (« 0/0 » = agrégat illimité). */
      maxLimit: string;
      /**
       * Sous-files PCQ à créer/référencer pour plafonner CHAQUE client. null =
       * pas de limite par client (la file ne porte que le plafond agrégé).
       */
      pcq: { up: string; dn: string; rateKbps: number } | null;
      kind: "simple";
    };

/**
 * Traduit (plafond agrégé du VLAN, débit par client) en plan de files RouterOS.
 * PUR : le « quoi poser » se teste sans routeur ; le « comment le poser » (I/O)
 * est dans link-usage-reader.ts.
 *
 *  - `totalKbps` seul  → une file simple max-limit=total (tout le VLAN partage).
 *  - `perClientKbps` seul → max-limit illimité + PCQ pcq-rate=perClient (chaque
 *    client plafonné, pas d'agrégat).
 *  - les deux → total en plafond ET PCQ par client à l'intérieur.
 *  - aucun → rien à poser (kind "none").
 */
export function zoneQueuePlan(
  totalKbps: number | null,
  perClientKbps: number | null,
  zone: string,
): ZoneQueuePlan {
  if (!totalKbps && !perClientKbps) return { kind: "none" };
  return {
    kind: "simple",
    maxLimit: totalKbps ? `${totalKbps}k/${totalKbps}k` : "0/0",
    pcq: perClientKbps
      ? { up: pcqTypeName(zone, "up"), dn: pcqTypeName(zone, "dn"), rateKbps: perClientKbps }
      : null,
  };
}
