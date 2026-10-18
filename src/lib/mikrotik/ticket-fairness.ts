import type {RouterOSClient} from './client';
import {clearFastTrackedConnections} from './starlink-fup-router';
const OWNER='SafeLinkHub ticket fairness';
const NAME='slh-ticket-fairness';
const rateNumber=(v:string)=>{const m=/^(\d+(?:\.\d+)?)([kKmMgG]?)$/.exec(v);if(!m)throw new Error('Débit de profil illisible : vérification manuelle requise.');return Number(m[1])*({k:1e3,m:1e6,g:1e9}[m[2].toLowerCase()]??1);};
export function ticketFloorRate(value:string):string {
 if(!value.trim())return '2M/2M';
 const [base]=value.trim().split(/\s+/);const parts=base.split('/');
 if(parts.length>2)throw new Error('Débit de profil illisible.');
 const up=rateNumber(parts[0]),down=rateNumber(parts[1]??parts[0]);
 if(up>=2e6 && down>=2e6)return value;
 return `${Math.max(up,2e6)/1e6}M/${Math.max(down,2e6)/1e6}M`;
}
/** Explicit operational install, independent of FUP on/off. Requires FUP already released. */
export async function installTicketFairness(client:RouterOSClient) {
 const read=(path:string,fields:string)=>client.talk([`${path}/print`,`=.proplist=${fields}`],20000);
 const [resource]=await read('/system/resource','cpu-load');
 if(!resource || !Number.isFinite(Number(resource['cpu-load'])) || Number(resource['cpu-load'])>=80)throw new Error('CPU trop élevée pour intervenir.');
 const queues=await read('/queue/simple','.id,name,comment,queue,target,max-limit,disabled');
 const existing=queues.find(q=>q.name===NAME);
 if(existing && existing.comment!==OWNER)throw new Error('File de partage existante hors SafeLinkHub.');
 if(queues.some(q=>q.name==='slh-fup-shared'))throw new Error('Libérez le FUP avant de configurer le partage des tickets.');
 const types=await read('/queue/type','.id,name,kind,pcq-rate,pcq-classifier');
 for(const name of ['slh-ticket-up','slh-ticket-down'])if(types.some(t=>t.name===name) && (!existing || !existing.queue?.split('/').includes(name)))throw new Error('Type de file réservé déjà utilisé hors partage des tickets.');
 const hotspots=await read('/ip/hotspot','interface,disabled');
 const targets=[...new Set(hotspots.filter(h=>h.disabled!=='true').map(h=>h.interface).filter(Boolean))];
 if(!targets.length)throw new Error('Interface HotSpot absente.');
 if(targets.length!==1)throw new Error('Plusieurs interfaces HotSpot : exclusion FastTrack spécifique requise.');
 const profiles=(await read('/ip/hotspot/user/profile','.id,name,rate-limit')).filter(p=>p.name!=='slh-paiement');
 const changes=profiles.map(p=>({id:p['.id'],name:p.name,before:p['rate-limit']??'',after:ticketFloorRate(p['rate-limit']??'')})).filter(p=>p.before!==p.after);
 const fasttrack=(await read('/ip/firewall/filter','.id,action,disabled,connection-mark,in-interface,out-interface')).filter(r=>r.action==='fasttrack-connection' && r.disabled!=='true');
 if(fasttrack.some(r=>(r['connection-mark'] && r['connection-mark']!=='no-mark') || ['in-interface','out-interface'].some(k=>r[k] && r[k]!==`!${targets[0]}`)))throw new Error('FastTrack personnalisé : vérification manuelle requise.');
 const backup=`slh-before-ticket-fairness-${Date.now()}`;
 await client.talk(['/system/backup/save',`=name=${backup}`],20000);
 const undo:(()=>Promise<unknown>)[]=[];
 const set=(path:string,id:string,params:Record<string,string>)=>client.talk([`${path}/set`,`=numbers=${id}`,...Object.entries(params).map(([k,v])=>`=${k}=${v}`)],20000);
 try {
  for(const [name,classifier] of [['slh-ticket-up','src-address'],['slh-ticket-down','dst-address']]){
   const previous=types.find(t=>t.name===name);
   if(previous){await set('/queue/type',previous['.id'],{'pcq-rate':'2000000','pcq-classifier':classifier});undo.push(()=>set('/queue/type',previous['.id'],{'pcq-rate':previous['pcq-rate'],'pcq-classifier':previous['pcq-classifier']}));}
   else {const result=await client.talk(['/queue/type/add',`=name=${name}`,'=kind=pcq',`=pcq-classifier=${classifier}`,'=pcq-rate=2000000'],20000,true);const id=result.find(r=>r.ret)?.ret;if(!id)throw new Error('Identifiant du type de file absent.');undo.push(()=>client.talk(['/queue/type/remove',`=numbers=${id}`],15000));}
  }
  const params={'target':targets.join(','),'queue':'slh-ticket-up/slh-ticket-down','max-limit':'0/0','comment':OWNER,'disabled':'no'};
  let queueId=existing?.['.id'];
  if(existing){await set('/queue/simple',existing['.id'],params);undo.push(()=>set('/queue/simple',existing['.id'],{target:existing.target,queue:existing.queue,'max-limit':existing['max-limit'],disabled:existing.disabled==='true'?'yes':'no'}));}
  else{const result=await client.talk(['/queue/simple/add',`=name=${NAME}`,...Object.entries(params).map(([k,v])=>`=${k}=${v}`)],20000,true);queueId=result.find(r=>r.ret)?.ret;if(!queueId)throw new Error('Identifiant de file absent.');const id=queueId;undo.push(()=>client.talk(['/queue/simple/remove',`=numbers=${id}`],15000));}
  const [first]=await read('/queue/simple','.id');if(first && first['.id']!==queueId)await client.talk(['/queue/simple/move',`=numbers=${queueId}`,`=destination=${first['.id']}`],15000);
  for(const p of changes){await set('/ip/hotspot/user/profile',p.id,{'rate-limit':p.after});undo.push(()=>set('/ip/hotspot/user/profile',p.id,{'rate-limit':p.before}));}
  // Exclude HotSpot in BOTH directions too: a flow can acquire a WAN mark after initial packets.
  for(const rule of fasttrack) {
   const desired={'connection-mark':'no-mark','in-interface':`!${targets[0]}`,'out-interface':`!${targets[0]}`};
   for(const [key,value] of Object.entries(desired))if(rule[key]!==value){
    await set('/ip/firewall/filter',rule['.id'],{[key]:value});
    undo.push(()=>rule[key] ? set('/ip/firewall/filter',rule['.id'],{[key]:rule[key]}) : client.talk(['/ip/firewall/filter/unset',`=numbers=${rule['.id']}`,`=value-name=${key}`],15000));
   }
  }
  await clearFastTrackedConnections(client);
  const [verified]=await client.talk(['/queue/simple/print',`?name=${NAME}`],15000);
  if(!verified || verified.disabled==='true' || verified.queue!==params.queue)throw new Error('Partage non confirmé sur le routeur.');
  return {backup,profiles:changes.map(p=>({name:p.name,rate:p.after})),targets,queue:NAME,fasttrackRules:fasttrack.length};
 }catch(error){let rollbackFailed=false;for(const revert of undo.reverse()){try{await revert();}catch{rollbackFailed=true;}}if(rollbackFailed)throw new Error(`Intervention incomplète : vérifier la sauvegarde ${backup}.`);throw error;}
}
