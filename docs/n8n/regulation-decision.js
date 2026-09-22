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

// ----- Téléchargeurs abusifs : bridage, puis blocages de 2 h, puis suspension -----
// CASCADE (par MAC, un palier par passage qui dépasse le seuil) :
//   1er dépassement        -> BRIDAGE seul : le débit tombe au plancher, la
//                             navigation passe, le gros téléchargement n'aboutit pas.
//   2e .. (max-1)          -> bridage MAINTENU + blocage de `abuseBlockMinutes`.
//   avant-dernier          -> SMS d'avertissement au numéro qui a acheté le code.
//   `abuseMaxOffenses`     -> SUSPENSION DÉFINITIVE du code (ticket désactivé).
// Un client bridé ne peut plus dépasser le seuil : le compteur n'avance donc
// QUE lorsqu'il recommence une fois le bridage expiré. C'est bien « il persiste ».
const watch = { ...(router.watch || {}) };
const blocks = [], throttles = [], suspensions = [], warnings = [], events = [], seen = new Set();
const threshold = P.abuseThresholdMb * MB;
for (const u of read.active || []) {
  if (!u.mac) continue;
  seen.add(u.mac);
  const w = watch[u.mac] || { bytesOut: u.bytesOut, blockedUntil: 0, offenseCount: 0, permanent: false, throttledUntil: 0 };
  if (w.suspended) { watch[u.mac] = w; continue; }
  const d = u.bytesOut >= w.bytesOut ? u.bytesOut - w.bytesOut : u.bytesOut;
  const stillBlocked = w.blockedUntil && ms < w.blockedUntil;
  const next = { ...w, bytesOut: u.bytesOut, address: u.address, user: u.user };
  if (d > threshold && !stillBlocked) {
    next.offenseCount = (w.offenseCount || 0) + 1;
    next.throttledUntil = ms + P.abuseBlockMinutes * 60000;
    const deltaGB = +(d / GB).toFixed(2);
    if (next.offenseCount >= P.abuseMaxOffenses) {
      // 10e : le CODE est suspendu, pas seulement l'IP — il ne resservira
      // nulle part, sur aucun appareil.
      next.suspended = true; next.permanent = true; next.blockedUntil = Number.MAX_SAFE_INTEGER;
      suspensions.push({ user: u.user, reason: `10e depassement (${deltaGB} Go)` });
      events.push({ kind: 'permanent_block', payload: { mac: u.mac, address: u.address, user: u.user, deltaGB, offenseCount: next.offenseCount, suspended: true } });
    } else if (next.offenseCount === 1) {
      // Premier dépassement : on BRIDE, on ne bloque pas.
      events.push({ kind: 'throttle', payload: { mac: u.mac, address: u.address, user: u.user, deltaGB, limit: P.abuseThrottleLimit } });
    } else {
      next.blockedUntil = ms + P.abuseBlockMinutes * 60000;
      blocks.push({ address: u.address, user: u.user, minutes: P.abuseBlockMinutes, comment: `Blocage auto - telechargement excessif (${u.user}) - ${next.offenseCount}/${P.abuseMaxOffenses}` });
      events.push({ kind: 'block', payload: { mac: u.mac, address: u.address, user: u.user, deltaGB, offenseCount: next.offenseCount, unblockAt: new Date(next.blockedUntil).toISOString() } });
      if (next.offenseCount === P.abuseMaxOffenses - 1) {
        warnings.push({ user: u.user, remaining: 1 });
      }
    }
  } else if (!stillBlocked) {
    next.blockedUntil = 0;
  }
  // Le bridage court tant que sa fenêtre n'est pas écoulée.
  if (next.throttledUntil && ms < next.throttledUntil && !next.suspended && u.address) {
    throttles.push({ address: u.address, user: u.user });
  }
  watch[u.mac] = next;
}
for (const mac of Object.keys(watch)) {
  const w = watch[mac];
  if (!seen.has(mac) && !w.permanent && !w.suspended && (!w.blockedUntil || ms > w.blockedUntil + 86400000)) delete watch[mac];
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
    throttles.length ? `Clients brides : ${throttles.length}` : '',
    blocks.length ? `Blocages ce passage : ${blocks.length}` : '',
    suspensions.length ? `Codes SUSPENDUS definitivement : ${suspensions.map((s) => s.user).join(', ')}` : '',
  ].join('\n'),
};

return [{ json: { routerId: router.routerId, name: router.name, changed, email, apply: { limit, blocks, throttles, suspensions, warnings, state: s, watch, events } } }];
