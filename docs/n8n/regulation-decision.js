// ===================== DÉCISION — nœud Code n8n =====================
// Entrée : la réponse de POST /read (compteurs WAN + sessions actives).
// Le routeur, ses SEUILS (policy) et son ÉTAT précédent viennent de la
// plateforme (GET /routers), plus aucune constante ici, plus de
// $getWorkflowStaticData. Sortie : ce que POST /apply attend + l'email.
const MB = 1024 ** 2, GB = 1024 ** 3;
const router = $('Boucle routeurs').item.json;
const read = $input.first().json;
const P = router.policy;

const now = new Date(read.at || Date.now());
const ms = now.getTime();

// ----- Cycle : démarre le billingCycleDay (1-28), pas forcément le 1er -----
const day = router.billingCycleDay || 1;
let start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), day));
if (start.getTime() > ms) start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, day));
const daysInCycle = (end.getTime() - start.getTime()) / 86400000;
const elapsedDays = Math.max((ms - start.getTime()) / 86400000, 1 / 96);
const remainingDays = Math.max(1, Math.ceil((end.getTime() - ms) / 86400000));
const monthKey = start.toISOString().slice(0, 10);
const dayKey = now.toISOString().slice(0, 10);

// ----- État précédent (mémorisé par la plateforme) -----
const prev = router.state || null;
const s = prev
  ? { ...prev }
  : { decision: 'ok', previous: 'ok', limit: '0/0', counters: read.counters, monthBytes: 0, dayBytes: 0, monthKey, dayKey, changedAt: null };
if (s.monthKey !== monthKey) { s.monthKey = monthKey; s.monthBytes = 0; s.dayBytes = 0; }
if (s.dayKey !== dayKey) { s.dayKey = dayKey; s.dayBytes = 0; }

// Compteur plus petit qu'avant = reboot du routeur → l'écart repart du relevé brut
const counters = Number(read.counters || 0);
const delta = counters >= (s.counters || 0) ? counters - (s.counters || 0) : counters;
s.counters = counters;
s.monthBytes += delta;
s.dayBytes += delta;
s.wanInterface = read.wanInterface || s.wanInterface || null;
s.at = now.toISOString();

// ----- Seuils -----
const SOFT = P.softCapMb * MB, HARD = P.hardCapMb * MB;
const fmtRate = (bytesPerDay) => {
  const bps = Math.max(64000, (bytesPerDay * 8) / 86400);
  return bps >= 1024 * 1024 ? (bps / 1024 / 1024).toFixed(2) + 'M' : Math.round(bps / 1000) + 'k';
};
const usedBeforeToday = s.monthBytes - s.dayBytes;
const dailyBudget = (Math.max(0, SOFT - usedBeforeToday) / remainingDays) * P.safety;
const projected = (s.monthBytes / elapsedDays) * daysInCycle;

let decision = 'ok', limit = '0/0';
if (s.monthBytes >= HARD) {
  decision = 'block'; limit = P.blockLimit;
} else if (s.monthBytes >= SOFT) {
  decision = 'critical';
  const marginDaily = Math.max(0, HARD - s.monthBytes) / remainingDays;
  limit = `${fmtRate(marginDaily * 0.5)}/${fmtRate(marginDaily)}`;
} else if (s.dayBytes > dailyBudget * P.dayCriticalRatio) {
  decision = 'throttle';
  limit = `${fmtRate(dailyBudget * 0.5)}/${fmtRate(dailyBudget)}`;
}
const previous = s.decision;
const changed = decision !== previous;
s.previous = previous; s.decision = decision; s.limit = limit;
if (changed) s.changedAt = now.toISOString();

const ACTIONS = {
  ok: 'Débit normal (partage équitable illimité)',
  throttle: 'Rythme du jour trop rapide : débit lissé, réparti entre utilisateurs',
  critical: 'Cible mensuelle dépassée : débit réduit vers le plafond absolu',
  block: 'Plafond absolu atteint : débit plancher',
};
s.stats = {
  todayGB: +(s.dayBytes / GB).toFixed(2),
  monthGB: +(s.monthBytes / GB).toFixed(2),
  budgetGB: +(dailyBudget / GB).toFixed(2),
  projectedGB: +(projected / GB).toFixed(2),
  softRemainingGB: +(Math.max(0, SOFT - s.monthBytes) / GB).toFixed(2),
  hardRemainingGB: +(Math.max(0, HARD - s.monthBytes) / GB).toFixed(2),
};

// ----- Téléchargeurs abusifs (volume sortant par passage, par MAC) -----
const watch = { ...(router.watch || {}) };
const blocks = [], events = [], seen = new Set();
const threshold = P.abuseThresholdMb * MB;
for (const u of read.active || []) {
  if (!u.mac) continue;
  seen.add(u.mac);
  const w = watch[u.mac] || { bytesOut: u.bytesOut, blockedUntil: 0, offenseCount: 0, permanent: false };
  if (w.permanent) { watch[u.mac] = w; continue; }
  const d = u.bytesOut >= w.bytesOut ? u.bytesOut - w.bytesOut : u.bytesOut;
  const stillBlocked = w.blockedUntil && ms < w.blockedUntil;
  const next = { ...w, bytesOut: u.bytesOut, address: u.address, user: u.user };
  if (d > threshold && !stillBlocked) {
    next.offenseCount = (w.offenseCount || 0) + 1;
    const deltaGB = +(d / GB).toFixed(2);
    if (next.offenseCount >= P.abuseMaxOffenses) {
      next.permanent = true; next.blockedUntil = Number.MAX_SAFE_INTEGER;
      blocks.push({ address: u.address, user: u.user, comment: `Blocage DEFINITIF - recidive ${next.offenseCount} (${u.user})` });
      events.push({ kind: 'permanent_block', payload: { mac: u.mac, address: u.address, user: u.user, deltaGB, offenseCount: next.offenseCount } });
    } else {
      next.blockedUntil = ms + P.abuseBlockMinutes * 60000;
      blocks.push({ address: u.address, user: u.user, minutes: P.abuseBlockMinutes, comment: `Blocage auto - telechargement excessif (${u.user}) - avertissement ${next.offenseCount}/${P.abuseMaxOffenses}` });
      events.push({ kind: 'block', payload: { mac: u.mac, address: u.address, user: u.user, deltaGB, offenseCount: next.offenseCount, unblockAt: new Date(next.blockedUntil).toISOString() } });
    }
  } else if (!stillBlocked) {
    next.blockedUntil = 0;
  }
  watch[u.mac] = next;
}
for (const mac of Object.keys(watch)) {
  const w = watch[mac];
  if (!seen.has(mac) && !w.permanent && (!w.blockedUntil || ms > w.blockedUntil + 86400000)) delete watch[mac];
}
if (changed) events.push({ kind: 'decision', payload: { previous, decision, limit, stats: s.stats } });

const email = {
  subject: `[SafeLinkHub] ${router.name} : ${decision.toUpperCase()}`,
  text: [
    `Routeur : ${router.name}`,
    `Decision : ${previous} -> ${decision}`,
    `Action : ${ACTIONS[decision]}`,
    `Debit applique (upload/download) : ${limit}`,
    '',
    `Aujourd'hui : ${s.stats.todayGB} Go (budget du jour ${s.stats.budgetGB} Go)`,
    `Ce cycle : ${s.stats.monthGB} Go / ${(SOFT / GB).toFixed(0)} Go cible (reste ${s.stats.softRemainingGB} Go avant cible, ${s.stats.hardRemainingGB} Go avant plafond ${(HARD / GB).toFixed(0)} Go)`,
    `Projection fin de cycle : ${s.stats.projectedGB} Go`,
    `Interface WAN : ${s.wanInterface}`,
    blocks.length ? `Blocages ce passage : ${blocks.length}` : '',
  ].join('\n'),
};

return [{ json: { routerId: router.routerId, name: router.name, changed, email, apply: { limit, blocks, state: s, watch, events } } }];
