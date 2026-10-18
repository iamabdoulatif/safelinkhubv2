// FUP v2 — OBSERVATION UNIQUEMENT. Ne pas réactiver /apply sans intégration validée.
// Contrat attendu : read.links[] = {id, at, cycleStart, cycleEnd,
// cycleConfirmed:true, cycleUsedBytes, counters?, baselineConfirmed:true}.
// Les anciens compteurs WAN ne sont PAS un total de cycle Starlink.
const router = $('Boucle routeurs').item.json;
const read = $input.first().json;
const GB = 1e9, DAY = 86400000;
const now = new Date();
const ms = now.getTime();
const P = router.policy || {};
const observationOnly = true;
const version = 'fup-v3-pool-2026-10-18';
const finite = v => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const dateMs = v => typeof v === 'string' ? Date.parse(v) : NaN;
const round = n => Math.round(n * 1000) / 1000;
const site = String(router.name || router.identity || '').toUpperCase();
const known = site.includes('FOUANGA') ? [
 {id:'fouanga-standard', name:'FOUANGA Standard', wanInterface:'E1-WAN-FAI', billingDay:21, cycleStart:'2026-09-21T00:00:00Z',cycleEnd:'2026-10-21T00:00:00Z',referenceGB:4720},
 {id:'fouanga-mini', name:'FOUANGA Mini', wanInterface:'E2-WAN-FAI',billingDay:10, cycleStart:'2026-10-10T00:00:00Z',cycleEnd:'2026-11-10T00:00:00Z',referenceGB:2050}
] : site.includes('KONGASSO') ? [
 {id:'kongasso-starlink',name:'KONGASSO Starlink',wanInterface:'E1-WAN-FAI',billingDay:3,cycleStart:'2026-10-03T00:00:00Z',cycleEnd:'2026-11-03T00:00:00Z',referenceGB:6120}
] : [];
// Références du 17 octobre : arrondies, jamais importées comme mesures temps réel.
const cfgs = Array.isArray(router.fupLinks) && router.fupLinks.length ? router.fupLinks : known;
const incoming = Array.isArray(read.links) ? read.links : [];
const previous = router.state?.fupV2 || {};
const issues = [];
if (!cfgs.length) issues.push('Liaisons non configurées : fournir router.fupLinks ; aucun rapprochement automatique par nom commercial.');
const rate = bps => Math.max(1, Math.floor(bps)) + '';
const links = cfgs.map(cfg => {
 const sample = incoming.find(x => x.id === cfg.id);
 const quotaGB = finite(cfg.quotaGB) && cfg.quotaGB > 0 ? cfg.quotaGB : 5000;
 const reserveGB = finite(cfg.reserveGB) && cfg.reserveGB < quotaGB ? cfg.reserveGB : Math.min(500, quotaGB * 0.1);
 const quota = quotaGB * GB, reserve = reserveGB * GB, ordinary = quota - reserve;
 const start = dateMs(sample?.cycleStart || cfg.cycleStart);
 const end = dateMs(sample?.cycleEnd || cfg.cycleEnd);
 const at = dateMs(sample?.at);
 const valid = !!sample && sample.cycleConfirmed === true && sample.baselineConfirmed === true
  && finite(sample.cycleUsedBytes) && Number.isFinite(start) && Number.isFinite(end)
  && start <= ms && ms < end && end > start && Number.isFinite(at)
  && at >= start && at <= ms + 60000 && ms - at <= 180000;
 const historical = !valid && finite(cfg.referenceGB) && ms >= start && ms < end;
 const used = valid ? sample.cycleUsedBytes : historical ? cfg.referenceGB * GB : null;
 const remainingMs = Math.max(0, end - ms);
 const daysRemaining = remainingMs / DAY;
 const phase = used === null ? 'unknown' : used >= quota ? 'exhausted' : used >= ordinary ? 'reserve' : 'normal';
 const ordinaryRemaining = used === null ? null : Math.max(0, ordinary - used);
 const remaining = used === null ? null : Math.max(0, quota - used);
 const reserveRemaining = used === null ? null : Math.min(reserve, remaining);
 const spendable = phase === 'reserve' ? remaining : ordinaryRemaining;
 const budgetDay = used !== null && daysRemaining > 0 ? spendable / daysRemaining : null;
 const elapsed = (ms - start) / DAY;
 const projection = valid && elapsed > 0 ? used / elapsed * ((end - start) / DAY) : null;
 const confirmedPrevious = previous.links?.find(x => x.id === cfg.id);
 const target = phase === 'normal' && projection !== null && projection > ordinary ? 'vigilance' : phase;
 let measuredStreak = 0;
 if (valid) {
  const newSample = !confirmedPrevious || confirmedPrevious.sampleAt !== sample.at;
  const sameCycle = confirmedPrevious?.cycleStart === sample.cycleStart;
  measuredStreak = sameCycle && confirmedPrevious.target === target ? (confirmedPrevious.measuredStreak || 0) + (newSample ? 1 : 0) : 1;
 }
 // Aucun débit minimal artificiel ne doit transformer un budget nul en autorisation.
 const capBps = budgetDay !== null && budgetDay > 0 ? Math.floor(budgetDay * 8 / 86400) : 0;
 const proposedAction = !valid ? 'await_confirmed_data' : phase === 'exhausted' ? 'stop_ordinary_internet_keep_local_portal'
  : phase === 'reserve' ? 'reduced_access_with_volume_cap' : target === 'vigilance' && measuredStreak >= 3 ? 'smooth_usage' : 'fair_share';
 if (!valid) issues.push(cfg.id + ': données par liaison et cycle confirmé nécessaires ; référence historique seulement.');
 return {
  id:cfg.id,name:cfg.name,wanInterface:cfg.wanInterface,billingDay:cfg.billingDay,
  cycleStart:Number.isFinite(start)?new Date(start).toISOString():null,
  cycleEnd:Number.isFinite(end)?new Date(end).toISOString():null,
  sampleAt:valid?sample.at:null,dataQuality:valid?'confirmed':'uncertain',source:valid?'platform_link_accounting':historical?'historical_reference_2026-10-17':'missing',
  quotaGB,reserveGB,ordinaryGB:ordinary/GB,usedGB:used===null?null:round(used/GB),
  ordinaryRemainingGB:ordinaryRemaining===null?null:round(ordinaryRemaining/GB),
  reserveRemainingGB:reserveRemaining===null?null:round(reserveRemaining/GB),remainingGB:remaining===null?null:round(remaining/GB),
  daysRemaining:Number.isFinite(daysRemaining)?round(daysRemaining):null,
  dailyBudgetGB:budgetDay===null?null:round(budgetDay/GB),projectedGB:projection===null?null:round(projection/GB),
  target,phase,measuredStreak,proposedAction,
  proposedAggregateDownBps:valid&&capBps>0?capBps:null,
  proposedPerTicketUploadDownload:router.fupPooled === true ? '2M/2M' : phase==='reserve'?'128k/256k':null,
  localVolumeCapRequired:true,confirmedRenewalRequired:true,
  windows:[7,14,21,28].map(days=>({days,coveredDays:round(Math.max(0,Math.min(days,daysRemaining||0))),budgetGB:budgetDay===null?null:round(budgetDay*Math.max(0,Math.min(days,daysRemaining||0))/GB)}))
 };
});
// Ne proposer un poids WAN que si toutes les mesures sont fiables. Les poids
// portent sur les volumes visés, pas sur une garantie de distribution des octets.
const pool = router.fupPooled === true ? (read.pool || {phase:'unknown',quotaGB:cfgs.reduce((n,l)=>n+(l.quotaGB||0),0),remainingGB:null}) : null;
const routable = links.length > 1 && links.every(x=>x.dataQuality==='confirmed');
const weights = routable ? links.map(x=>({linkId:x.id,weight:Math.max(0,x.dailyBudgetGB||0)})) : [];
const sumWeight = weights.reduce((a,x)=>a+x.weight,0);
for (const x of weights) x.share = sumWeight>0 ? x.weight/sumWeight : 0;
// Détection temporaire, sans suspension ni blocage punitif. La plateforme doit
// persister nextWatch et fupV2 pour confirmer trois échantillons consécutifs.
const watch = {...(router.watch || {})};
const candidateThrottles = [];
const sampleAt = dateMs(read.at);
const fresh = Number.isFinite(sampleAt) && ms-sampleAt <= 180000 && sampleAt <= ms+60000;
const threshold = (finite(P.abuseThresholdMb) && P.abuseThresholdMb>0 ? P.abuseThresholdMb : 0) * 1024**2;
for (const u of Array.isArray(read.active)?read.active:[]) {
 if (!u.user || !finite(u.bytesOut)) continue;
 const key = 'ticket:' + u.user;
 const old = watch[key];
 const validPair = fresh && old && old.sampleAt < sampleAt && sampleAt-old.sampleAt <= 600000
  && old.address===u.address && u.bytesOut >= old.bytesOut && threshold > 0;
 const delta = validPair ? u.bytesOut-old.bytesOut : 0;
 // Le seuil historique est converti en débit moyen sur 5 minutes pour éviter
 // qu'un changement de fréquence de collecte crée des faux dépassements.
 const excessive = validPair && delta / ((sampleAt-old.sampleAt)/1000) > threshold / 300;
 const streak = excessive ? (old.streak||0)+1 : 0;
 if (fresh && (!old || sampleAt>old.sampleAt)) watch[key]={bytesOut:u.bytesOut,sampleAt,address:u.address,user:u.user,streak};
 const atRisk = pool ? ['reserve','exhausted'].includes(pool.phase) : links.some(x=>x.dataQuality==='confirmed' && ['vigilance','reserve'].includes(x.target));
 if (streak>=3 && atRisk && u.address) candidateThrottles.push({address:u.address,user:u.user,limit:pool?'2M/2M':'128k/256k',durationMinutes:15,reason:'usage soutenu et budget global sous tension'});
}
// Oublier les tickets inactifs pour borner la mémoire sur plusieurs semaines.
for (const key of Object.keys(watch)) {
 const w = watch[key];
 if (!w || !finite(w.sampleAt) || ms - w.sampleAt > DAY || w.sampleAt > ms + 60000) delete watch[key];
}
if (pool) for (const l of links) l.proposedAction = pool.phase === 'unknown' ? 'await_confirmed_pool' : 'accounting_only_pooled_policy';
const signature = pool ? 'pool:'+pool.phase+':'+links.map(x=>x.id+':'+x.dataQuality).join('|') : links.map(x=>x.id+':'+x.dataQuality+':'+x.target).join('|');
const changed = previous.signature !== signature;
const state = {...(router.state||{}),fupV2:{version,mode:'observation',at:now.toISOString(),signature,links,pool}};
const events = [{kind:'fup_observation',payload:{mode:'observation',pool,links,wanWeights:weights,candidateThrottles,issues}}];
const poolDescription = pool ? 'Enveloppe cumulée : '+pool.quotaGB+' Go ; consommés '+(pool.usedGB??'?')+' Go ; restants '+(pool.remainingGB??'?')+' Go ; état '+pool.phase+'. Tickets 2M/2M sous plafond partagé.\n' : '';
const description = poolDescription + links.map(x=>x.name+': '+x.phase+' ; '+(x.usedGB??'?')+' / '+x.quotaGB+' Go ; reste '+(x.remainingGB??'?')+' Go ; '+x.dataQuality).join('\n');
const email={subject:'[OBSERVATION FUP] '+router.name,text:description+'\nAucune restriction appliquée. Réserve comprise dans les 5 To. Données historiques non assimilées à une consommation actuelle.'};
return [{json:{routerId:router.routerId,name:router.name,mode:'observation',changed:false,proposedChanged:changed,email,telegram:email.text,
 fup:{version,pool,links,wanWeights:weights,candidateThrottles,issues,persistenceRequired:true},
 apply:{dryRun:true,observationOnly,limit:router.state?.limit||'0/0',blocks:[],throttles:[],suspensions:[],warnings:[],state,watch,events}}}];
