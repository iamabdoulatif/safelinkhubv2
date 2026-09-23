import type { RegulationState, RegulationWatchEntry } from "@/lib/db/schema";
import type { ActiveSession } from "./regulation";

/**
 * LA DÉCISION DE RÉGULATION — rapatriée de n8n dans la plateforme.
 *
 * Elle vivait dans un nœud Code d'un workflow n8n Cloud. Le 22/09/2026, ce
 * compte a cessé d'exécuter quoi que ce soit — quota mensuel — et TOUTE la
 * régulation du parc s'est arrêtée pendant seize heures sans qu'aucune alerte
 * ne parte : le seul signe était l'absence de nouveaux relevés. Un mécanisme
 * qui coupe le débit de milliers de clients ne peut pas dépendre d'un tiers
 * qui s'arrête en silence. Le code est donc ici, testé, et appelé par le cron
 * du VPS qui fait déjà tourner les sauvegardes (voir /api/cron/regulation).
 *
 * Fonction PURE : mêmes entrées, mêmes sorties, aucun accès réseau ni base.
 * C'est ce qui permet de vérifier la cascade sans routeur ni n8n.
 */

export type RegulationPolicy = {
  softCapMb: number;
  hardCapMb: number;
  safety: number;
  dayCriticalRatio: number;
  blockLimit: string;
  abuseThresholdMb: number;
  abuseBlockMinutes: number;
  abuseMaxOffenses: number;
  abuseThrottleLimit: string;
  profileThrottlePct: number;
};

export type RegulationDecisionInput = {
  policy: RegulationPolicy;
  /** Jour du mois où le cycle repart (1-28). */
  billingCycleDay: number;
  state: RegulationState | null;
  watch: Record<string, RegulationWatchEntry>;
  /** Relevé courant : compteurs WAN cumulés + sessions actives. */
  counters: number | null;
  wanInterface: string | null;
  active: ActiveSession[];
  at: Date;
};

export type RegulationDecisionOutput = {
  /** Vrai si la décision de quota a changé depuis le passage précédent. */
  changed: boolean;
  limit: string;
  blocks: { address: string; user: string; minutes?: number; comment: string }[];
  throttles: { address: string; user: string }[];
  suspensions: { user: string; reason: string }[];
  warnings: { user: string; remaining: number }[];
  state: RegulationState;
  watch: Record<string, RegulationWatchEntry>;
  events: { kind: string; payload: Record<string, unknown> }[];
  /** Résumé lisible, pour le courriel d'alerte et le journal. */
  summary: string;
};

const MB = 1024 ** 2;
const GB = 1024 ** 3;
/** Cadence nominale d'un passage : le seuil de l'exploitant s'y rapporte. */
const PASSAGE_MS = 300_000;

const ACTIONS: Record<string, string> = {
  ok: "Débit normal (partage équitable illimité)",
  throttle: "Rythme du jour trop rapide : débit lissé, réparti entre utilisateurs",
  critical: "Cible mensuelle dépassée : débit réduit vers le plafond absolu",
  block: "Plafond absolu atteint : débit plancher",
};

/** Octets/jour → « 1.20M » ou « 480k », jamais sous 64 kbit/s. */
function fmtRate(bytesPerDay: number): string {
  const bps = Math.max(64000, (bytesPerDay * 8) / 86400);
  return bps >= 1024 * 1024 ? `${(bps / 1024 / 1024).toFixed(2)}M` : `${Math.round(bps / 1000)}k`;
}

export function decideRegulation(input: RegulationDecisionInput): RegulationDecisionOutput {
  const P = input.policy;
  const now = input.at;
  const ms = now.getTime();

  // ── Cycle : démarre le billingCycleDay, pas forcément le 1er ──────────────
  const day = Math.min(28, Math.max(1, input.billingCycleDay || 1));
  let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
  if (start.getTime() > ms) {
    start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
  }
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day));
  const daysInCycle = (end.getTime() - start.getTime()) / 86400000;
  const elapsedDays = Math.max((ms - start.getTime()) / 86400000, 1 / 96);
  const remainingDays = Math.max(1, Math.ceil((end.getTime() - ms) / 86400000));
  const monthKey = start.toISOString().slice(0, 10);
  const dayKey = now.toISOString().slice(0, 10);

  const prev = input.state;
  // `released` marque un routeur nettoyé APRÈS désactivation : s'il est
  // régulé de nouveau, la marque tombe — sinon une nouvelle coupure ne le
  // nettoierait plus.
  const s: RegulationState = prev
    ? // eslint-disable-next-line @typescript-eslint/no-unused-vars
      (({ released: _released, ...rest }) => rest)(prev)
    : {
        decision: "ok",
        previous: "ok",
        limit: "0/0",
        wanInterface: input.wanInterface,
        counters: input.counters ?? 0,
        monthBytes: 0,
        dayBytes: 0,
        monthKey,
        dayKey,
        at: now.toISOString(),
        changedAt: null,
      };
  if (s.monthKey !== monthKey) {
    s.monthKey = monthKey;
    s.monthBytes = 0;
    s.dayBytes = 0;
  }
  if (s.dayKey !== dayKey) {
    s.dayKey = dayKey;
    s.dayBytes = 0;
  }

  // Compteur plus petit qu'avant = le routeur a redémarré : l'écart repart du
  // relevé brut plutôt que de rendre un delta négatif.
  const counters = Number(input.counters ?? 0);
  const delta = counters >= (s.counters || 0) ? counters - (s.counters || 0) : counters;
  s.counters = counters;
  s.monthBytes += delta;
  s.dayBytes += delta;
  s.wanInterface = input.wanInterface || s.wanInterface || null;
  s.at = now.toISOString();

  // ── Rythme du quota ──────────────────────────────────────────────────────
  const SOFT = P.softCapMb * MB;
  const HARD = P.hardCapMb * MB;
  const usedBeforeToday = s.monthBytes - s.dayBytes;
  const dailyBudget = (Math.max(0, SOFT - usedBeforeToday) / remainingDays) * P.safety;
  const projected = (s.monthBytes / elapsedDays) * daysInCycle;

  let decision = "ok";
  let limit = "0/0";
  if (s.monthBytes >= HARD) {
    decision = "block";
    limit = P.blockLimit;
  } else if (s.monthBytes >= SOFT) {
    decision = "critical";
    const marginDaily = Math.max(0, HARD - s.monthBytes) / remainingDays;
    limit = `${fmtRate(marginDaily * 0.5)}/${fmtRate(marginDaily)}`;
  } else if (s.dayBytes > dailyBudget * P.dayCriticalRatio) {
    decision = "throttle";
    limit = `${fmtRate(dailyBudget * 0.5)}/${fmtRate(dailyBudget)}`;
  }
  const previous = s.decision;
  const changed = decision !== previous;
  s.previous = previous;
  s.decision = decision;
  s.limit = limit;
  if (changed) s.changedAt = now.toISOString();
  s.stats = {
    todayGB: +(s.dayBytes / GB).toFixed(2),
    monthGB: +(s.monthBytes / GB).toFixed(2),
    budgetGB: +(dailyBudget / GB).toFixed(2),
    projectedGB: +(projected / GB).toFixed(2),
    softRemainingGB: +(Math.max(0, SOFT - s.monthBytes) / GB).toFixed(2),
    hardRemainingGB: +(Math.max(0, HARD - s.monthBytes) / GB).toFixed(2),
  };

  // ── Cascade anti-téléchargement, par appareil ────────────────────────────
  // 1er dépassement        → BRIDAGE seul : la navigation passe, le gros
  //                          téléchargement n'aboutit pas ;
  // 2e … avant-dernier     → bridage maintenu + blocage de abuseBlockMinutes ;
  // avant-dernier          → avertissement au client ;
  // abuseMaxOffenses       → SUSPENSION DÉFINITIVE du code.
  // Un client bridé ne peut plus dépasser le seuil : le compteur n'avance donc
  // que s'il recommence une fois la pause écoulée. C'est bien « il persiste ».
  const watch: Record<string, RegulationWatchEntry> = { ...input.watch };
  const blocks: RegulationDecisionOutput["blocks"] = [];
  const throttles: RegulationDecisionOutput["throttles"] = [];
  const suspensions: RegulationDecisionOutput["suspensions"] = [];
  const warnings: RegulationDecisionOutput["warnings"] = [];
  const events: RegulationDecisionOutput["events"] = [];
  const seen = new Set<string>();
  const threshold = P.abuseThresholdMb * MB;

  for (const u of input.active) {
    if (!u.mac) continue;
    seen.add(u.mac);
    const w = watch[u.mac] ?? {
      bytesOut: u.bytesOut,
      blockedUntil: 0,
      offenseCount: 0,
      permanent: false,
      throttledUntil: 0,
    };
    if (w.suspended) {
      watch[u.mac] = w;
      continue;
    }
    const d = u.bytesOut >= w.bytesOut ? u.bytesOut - w.bytesOut : u.bytesOut;
    const stillBlocked = Boolean(w.blockedUntil) && ms < w.blockedUntil;
    const next: RegulationWatchEntry = {
      ...w,
      bytesOut: u.bytesOut,
      address: u.address,
      user: u.user,
      at: ms,
    };
    // UN DÉBIT, PAS UN VOLUME. Le seuil est exprimé « par passage de 5 min »
    // parce que c'est ainsi que l'exploitant le pense, mais on le compare à la
    // vitesse réelle sur l'intervalle écoulé. Sinon, après toute interruption
    // de la régulation, le premier passage voit le cumul du trou et punit tout
    // le monde : le 22/09/2026, huit clients de FOUANGA ont été bridés pour
    // 0,35 à 0,87 Go étalés sur dix-sept heures — rien d'abusif.
    //
    // SANS INSTANT DE RÉFÉRENCE, ON NE JUGE PAS. Un relevé mémorisé avant que
    // ce champ n'existe ne dit pas sur combien de temps il porte ; le supposer
    // long serait laxiste, le supposer court a puni quarante-quatre clients à
    // des vitesses de 45 Mbit/s qu'aucun forfait ne permet (22/09/2026, une
    // heure après le correctif précédent). On enregistre la référence et on
    // attend le passage suivant — exactement ce qu'on fait d'un nouvel appareil.
    const referenceConnue = typeof w.at === "number" && w.at > 0;
    const ecouleS = referenceConnue ? Math.max(30, (ms - w.at!) / 1000) : 0;
    const debit = referenceConnue ? d / ecouleS : 0;
    const seuilDebit = threshold / (PASSAGE_MS / 1000);
    if (referenceConnue && debit > seuilDebit && !stillBlocked) {
      next.offenseCount = (w.offenseCount || 0) + 1;
      next.throttledUntil = ms + P.abuseBlockMinutes * 60000;
      const deltaGB = +(d / GB).toFixed(2);
      const debitMoMin = +((debit * 60) / MB).toFixed(1);
      if (next.offenseCount >= P.abuseMaxOffenses) {
        next.suspended = true;
        next.permanent = true;
        next.blockedUntil = Number.MAX_SAFE_INTEGER;
        suspensions.push({ user: u.user, reason: `${next.offenseCount}e dépassement (${deltaGB} Go)` });
        events.push({
          kind: "permanent_block",
          payload: { mac: u.mac, address: u.address, user: u.user, deltaGB, debitMoMin, offenseCount: next.offenseCount, suspended: true },
        });
      } else if (next.offenseCount === 1) {
        events.push({
          kind: "throttle",
          payload: { mac: u.mac, address: u.address, user: u.user, deltaGB, debitMoMin, limit: P.abuseThrottleLimit },
        });
      } else {
        next.blockedUntil = ms + P.abuseBlockMinutes * 60000;
        blocks.push({
          address: u.address,
          user: u.user,
          minutes: P.abuseBlockMinutes,
          comment: `Blocage auto - telechargement excessif (${u.user}) - ${next.offenseCount}/${P.abuseMaxOffenses}`,
        });
        events.push({
          kind: "block",
          payload: {
            mac: u.mac,
            address: u.address,
            user: u.user,
            deltaGB,
            debitMoMin,
            offenseCount: next.offenseCount,
            unblockAt: new Date(next.blockedUntil).toISOString(),
          },
        });
        if (next.offenseCount === P.abuseMaxOffenses - 1) {
          warnings.push({ user: u.user, remaining: 1 });
        }
      }
    } else if (!stillBlocked) {
      next.blockedUntil = 0;
    }
    if (next.throttledUntil && ms < next.throttledUntil && !next.suspended && u.address) {
      throttles.push({ address: u.address, user: u.user });
    }
    watch[u.mac] = next;
  }

  // Oubli des appareils partis : on garde les suspendus et les bloqués récents.
  for (const mac of Object.keys(watch)) {
    const w = watch[mac];
    if (!seen.has(mac) && !w.permanent && !w.suspended && (!w.blockedUntil || ms > w.blockedUntil + 86400000)) {
      delete watch[mac];
    }
  }
  if (changed) {
    events.push({ kind: "decision", payload: { previous, decision, limit, stats: s.stats } });
  }
  s.profileLimits = prev?.profileLimits;

  const summary = [
    `${previous} → ${decision} (${limit})`,
    ACTIONS[decision],
    `${s.stats.monthGB} Go ce cycle, ${s.stats.todayGB} Go aujourd'hui`,
    throttles.length ? `${throttles.length} bridé(s)` : "",
    blocks.length ? `${blocks.length} bloqué(s)` : "",
    suspensions.length ? `SUSPENDUS : ${suspensions.map((x) => x.user).join(", ")}` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  return { changed, limit, blocks, throttles, suspensions, warnings, state: s, watch, events, summary };
}
