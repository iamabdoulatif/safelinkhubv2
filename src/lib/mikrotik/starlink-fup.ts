/** FUP decimal par liaison. Aucun compteur brut n'est un relevé Starlink mensuel. */
export type FupLink = {
  id: string;
  name: string;
  interface: string;
  quotaGB: number;
  reserveGB: number;
  cycleStart: string;
  /** Borne exclusive : le cycle du 3 octobre au 2 novembre finit le 3 à 00:00 UTC. */
  cycleEnd: string;
  cycleConfirmed: boolean;
};

export type FupLedger = {
  cycleStart: string;
  cycleEnd: string;
  cycleUsedBytes: number;
  rawBytes: number | null;
  at: string;
  baselineConfirmed: boolean;
  uptimeSeconds?: number;
  baselineAt?: string;
  issue?: string;
};

const GB = 1e9;
const DAY = 86400000;
const bytes = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

export function validateFupLinks(links: FupLink[]): string | null {
  if (!Array.isArray(links) || !links.length || links.length > 8) return "Une à huit liaisons requises.";
  const ids = new Set<string>(), interfaces = new Set<string>();
  for (const l of links) {
    if (!l || typeof l.id !== "string" || !/^[a-zA-Z0-9_-]{1,64}$/.test(l.id) || ids.has(l.id)) return "Identifiant de liaison invalide ou dupliqué.";
    if (typeof l.name !== "string" || !l.name.trim() || l.name.length > 100) return "Nom de liaison requis (100 caractères maximum).";
    if (typeof l.interface !== "string" || !l.interface.trim() || l.interface !== l.interface.trim() || /[,\r\n]/.test(l.interface) || interfaces.has(l.interface)) return "Chaque liaison doit avoir sa propre interface WAN.";
    if (!Number.isFinite(l.quotaGB) || l.quotaGB <= 0 || l.quotaGB * GB > Number.MAX_SAFE_INTEGER || !Number.isFinite(l.reserveGB) || l.reserveGB < 0 || l.reserveGB >= l.quotaGB) return "Réserve comprise dans le quota et strictement inférieure au total.";
    const start = Date.parse(l.cycleStart), end = Date.parse(l.cycleEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 32 * DAY || typeof l.cycleConfirmed !== "boolean") return "Dates du cycle de données invalides (32 jours maximum).";
    ids.add(l.id); interfaces.add(l.interface);
  }
  return null;
}

/** Ne réinitialise jamais un quota à partir d'une simple date de paiement. */
export function advanceFupLedger(link: FupLink, prev: FupLedger | null, raw: number | null, at: Date, uptimeSeconds?: number): FupLedger {
  if (prev && at.getTime() <= Date.parse(prev.at)) return { ...prev };
  const next: FupLedger = {
    cycleStart: link.cycleStart, cycleEnd: link.cycleEnd,
    cycleUsedBytes: prev?.cycleUsedBytes ?? 0,
    rawBytes: bytes(raw) ? raw : null, at: at.toISOString(), baselineConfirmed: false,
    ...(uptimeSeconds === undefined ? {} : { uptimeSeconds }),
    ...(prev?.baselineAt ? { baselineAt: prev.baselineAt } : {}),
  };
  if (!prev || !prev.baselineConfirmed) return { ...next, issue: "provider_baseline_required" };
  if (prev.cycleStart !== link.cycleStart || prev.cycleEnd !== link.cycleEnd) return { ...next, issue: "cycle_baseline_required" };
  if (prev.uptimeSeconds !== undefined && (uptimeSeconds === undefined ||
    Math.abs((uptimeSeconds - prev.uptimeSeconds) - (at.getTime() - Date.parse(prev.at)) / 1000) > 60)) {
    return { ...next, issue: "router_reboot_reconcile_required" };
  }
  if (!bytes(raw) || !bytes(prev.rawBytes)) return { ...next, issue: "wan_sample_missing" };
  if (raw < prev.rawBytes) return { ...next, issue: "counter_reset_reconcile_required" };
  const used = prev.cycleUsedBytes + raw - prev.rawBytes;
  if (!bytes(used)) return { ...next, issue: "invalid_counter" };
  return { ...next, cycleUsedBytes: used, baselineConfirmed: true };
}

export function fupUptimeSeconds(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const tokens = /^(?:(\d+)w)?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/i.exec(value);
  if (tokens && tokens.slice(1).some(v => v !== undefined)) {
    return tokens.slice(1).reduce((sum, n, i) => sum + Number(n ?? 0) * [604800, 86400, 3600, 60, 1][i], 0);
  }
  const clock = /^(?:(\d+)w)?(?:(\d+)d)?(\d{1,2}):(\d{2}):(\d{2})$/.exec(value);
  if (!clock || Number(clock[4]) > 59 || Number(clock[5]) > 59) return undefined;
  return Number(clock[1] ?? 0) * 604800 + Number(clock[2] ?? 0) * 86400 + Number(clock[3]) * 3600 + Number(clock[4]) * 60 + Number(clock[5]);
}

/** Indication de rythme, pas un plafond de volume garanti entre deux relevés. */
export function calculateFupBudget(link: FupLink, ledger: FupLedger | null, at: Date) {
  const ms = at.getTime(), start = Date.parse(link.cycleStart), end = Date.parse(link.cycleEnd);
  const age = ledger ? ms - Date.parse(ledger.at) : Infinity;
  const known = !validateFupLinks([link]) && link.cycleConfirmed && ledger?.baselineConfirmed &&
    ledger.cycleStart === link.cycleStart && ledger.cycleEnd === link.cycleEnd &&
    bytes(ledger.cycleUsedBytes) && Date.parse(ledger.at) >= start && ms >= start && ms < end && age >= -60000 && age <= 180000;
  const phase = !known ? "unknown" : ledger.cycleUsedBytes >= link.quotaGB * GB ? "exhausted" :
    ledger.cycleUsedBytes >= (link.quotaGB - link.reserveGB) * GB ? "reserve" : "normal";
  const remainingGB = known ? Math.max(0, link.quotaGB - ledger.cycleUsedBytes / GB) : null;
  const ordinaryRemainingGB = remainingGB === null ? null : Math.max(0, remainingGB - link.reserveGB);
  const reserveRemainingGB = remainingGB === null ? null : Math.min(link.reserveGB, remainingGB);
  const available = phase === "normal" ? ordinaryRemainingGB : remainingGB;
  const daysRemaining = (end - ms) / DAY;
  const dailyBudgetGB = known ? (available ?? 0) / daysRemaining : null;
  return {
    phase, remainingGB, ordinaryRemainingGB, reserveRemainingGB, dailyBudgetGB,
    aggregateBps: dailyBudgetGB === null ? null : Math.floor(dailyBudgetGB * GB * 8 / 86400),
    windows: [7, 14, 21, 28].map(days => ({ days,
      endsAt: Number.isFinite(end) ? new Date(Math.max(ms, Math.min(end, ms + days * DAY))).toISOString() : null,
      budgetGB: dailyBudgetGB === null ? null : (available ?? 0) * Math.min(1, days / daysRemaining),
    })),
  };
}
