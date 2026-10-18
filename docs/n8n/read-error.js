// Collecte indisponible v3 : une erreur HTTP ne prouve pas une panne Internet.
const router = $('Boucle routeurs').item.json;
const input = $input.first().json;
const sd = $getWorkflowStaticData('global');
sd.fail = sd.fail || {};
const now = Date.now();
const until = Date.parse(router.maintenanceUntil || '');
const maintenance = router.maintenance === true || (Number.isFinite(until) && until > now);
// Extract only known error fields; never stringify an Axios object or its stack.
function detail(value, depth = 0) {
  if (depth > 5 || value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  return detail(value.error, depth+1) || detail(value.message, depth+1) || detail(value.description, depth+1) || detail(value.cause, depth+1);
}
const raw = detail(input) || 'Erreur de collecte sans détail exploitable';
const busy = /FUP_COLLECTION_BUSY/.test(raw) || input.code === 'FUP_COLLECTION_BUSY';
if (maintenance || busy) {
  delete sd.fail[router.routerId];
  return [{json:{routerId:router.routerId,name:router.name,alert:false,telegram:'',email:null,failCount:0,collectionStatus:busy?'busy':'maintenance'}}];
}
const f = sd.fail[router.routerId] || {count:0,alerted:false,firstAt:new Date(now).toISOString()};
f.firstAt = f.firstAt || new Date(now).toISOString();
f.count += 1;
f.lastAt = new Date(now).toISOString();
f.lastError = raw
 .replace(/Bearer\s+[^\s"']+/gi,'Bearer [masqué]')
 .replace(/(token|password|secret|authorization)\s*[:=]\s*[^\s,;}]+/gi,'$1=[masqué]')
 .replace(/https?:\/\/[^\s"']+/gi,'[adresse du service]')
 .replace(/[`*_\[\]<>]/g,'').replace(/[\r\n]+/g,' ').slice(0,300);
const threshold = Math.max(1, Math.min(20, Number(router.policy?.failAlertThreshold) || 3));
let alert=false,telegram='',email=null;
if (f.count >= threshold && !f.alerted) {
  f.alerted=true;alert=true;
  const elapsed = Math.max(0, Math.round((now-Date.parse(f.firstAt))/60000));
  const name=String(router.name || 'Routeur').replace(/[`*_\[\]<>]/g,'');
  telegram=[
    `⚠️ COLLECTE FUP — ${name}`,
    `${f.count} lectures consécutives ont échoué ; premier échec il y a ${elapsed} min.`,
    `Dernière erreur : ${f.lastError}`,
    'Les compteurs ne sont pas actualisés. Cet échec ne confirme pas une coupure Internet.',
    router.regulationMode === 'active'
      ? 'Le garde-fou MikroTik déjà installé reste autonome ; ses limites restent en place.'
      : 'Le site reste en observation ; cette alerte ne modifie pas les débits.',
    'Vérifier : API MikroTik, tunnel/VPN et disponibilité du SaaS.',
  ].join('\n');
  email={subject:`[SafeLinkHub] Collecte FUP indisponible : ${name}`,text:telegram};
}
sd.fail[router.routerId]=f;
return [{json:{routerId:router.routerId,name:router.name,alert,telegram,email,failCount:f.count,collectionStatus:'failed',lastError:f.lastError}}];
