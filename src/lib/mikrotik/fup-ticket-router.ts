import {createHash} from 'node:crypto';
import type {RouterOSClient} from './client';
import {quoteRos} from './content-filter';
import {FUP_QUEUE} from './starlink-fup-enforcement';
import type {ActiveSession} from './regulation';
import type {TicketStates,TicketPolicy} from './fup-ticket-policy';
const OWNER='SafeLinkHub FUP ticket v1';
const key=(user:string)=>createHash('sha256').update(user).digest('hex').slice(0,20);
type Recovery={user:string;id:string;comment:string;until:number;blocked:boolean};
const prefix=OWNER+' ';
function recovery(s:Record<string,string>|undefined):Recovery|null {try{return s?.comment?.startsWith(prefix)?JSON.parse(s.comment.slice(prefix.length)):null;}catch{return null;}}
export async function applyTicketPolicy(client:RouterOSClient,state:TicketStates,active:ActiveSession[],policy:TicketPolicy) {
 const users=await client.talk(['/ip/hotspot/user/print','=.proplist=.id,name,disabled,comment'],10000);
 const queues=await client.talk(['/queue/simple/print','=.proplist=.id,name,comment'],10000);
 const schedulers=await client.talk(['/system/scheduler/print','=.proplist=.id,name,comment'],10000);
 const wanted=new Set(Object.entries(state).filter(([,v])=>v.phase!=='normal').map(([u])=>key(u)));
 // The account comment (including Mikhmon expiry) remains completely untouched.
 for(const s of schedulers){const meta=recovery(s);if(!meta||wanted.has(key(meta.user)))continue;
  const u=users.find(u=>u.name===meta.user&&u['.id']===meta.id&&u.comment===meta.comment);
  if(meta.blocked&&u?.disabled==='true')await client.talk(['/ip/hotspot/user/set',`=numbers=${u['.id']}`,'=disabled=no'],10000);
  await client.talk(['/system/scheduler/remove',`=numbers=${s['.id']}`],10000);
 }
 for(const q of queues)if(q.comment===OWNER&&q.name.startsWith('slh-fup-ticket-')&&!wanted.has(q.name.slice('slh-fup-ticket-'.length)))await client.talk(['/queue/simple/remove',`=numbers=${q['.id']}`],10000);
 for(const [user,status] of Object.entries(state)) {
  if(status.phase==='normal')continue;
  const k=key(user),name='slh-fup-ticket-'+k,u=users.find(u=>u.name===user);
  const q=queues.find(q=>q.name===name),scheduler=schedulers.find(s=>s.name===name),owned=recovery(scheduler);
  if(q&&q.comment!==OWNER||scheduler&&!owned)throw new Error('Nom réservé de sanction déjà utilisé.');
  if(owned?.blocked&&(!u||owned.id!==u['.id']||owned.comment!==(u.comment??''))){
   if(scheduler)await client.talk(['/system/scheduler/remove',`=numbers=${scheduler['.id']}`],10000);
   if(q)await client.talk(['/queue/simple/remove',`=numbers=${q['.id']}`],10000);
   delete state[user];continue;
  }
  // Local accounts only. Do not adopt an already disabled account.
  if(!u||u.disabled==='true'&&(!owned?.blocked||owned.id!==u['.id']||owned.comment!==(u.comment??''))){delete state[user];continue;}
  if(owned?.blocked){status.phase='blocked';status.until=owned.until;}
  const original=u.comment??'';
  const meta:Recovery={user,id:u['.id'],comment:original,until:status.until,blocked:status.phase==='blocked'};
  const restore=meta.blocked?`:local u [/ip hotspot user find where name=${quoteRos(user)}]; :if ([:len $u] = 1) do={ :if ([:tostr $u] = ${quoteRos(u['.id'])} && [/ip hotspot user get $u comment] = ${quoteRos(original)}) do={ /ip hotspot user set $u disabled=no } }; `:'';
  const cleanup=`${restore}/queue simple remove [find where name=${quoteRos(name)} and comment=${quoteRos(OWNER)}]; /system scheduler remove [find where name=${quoteRos(name)} and comment=${quoteRos(prefix+JSON.stringify(meta))}]`;
  const end=new Date(Math.ceil(status.until/1000)*1000).toISOString();
  // Arm recovery BEFORE disabling an account, so a server outage cannot leave a permanent ban.
  await client.talk([`/system/scheduler/${scheduler?'set':'add'}`,...(scheduler?[`=numbers=${scheduler['.id']}`]:[`=name=${name}`]),`=comment=${prefix+JSON.stringify(meta)}`,`=start-date=${end.slice(0,10)}`,`=start-time=${end.slice(11,19)}`,'=interval=1m','=policy=read,write,policy,test',`=on-event=${cleanup}`,'=disabled=no'],10000);
  if(status.phase==='blocked') {
   await client.talk(['/ip/hotspot/user/set',`=numbers=${u['.id']}`,'=disabled=yes'],10000);
   const sessions=await client.talk(['/ip/hotspot/active/print','=.proplist=.id',`?user=${user}`],10000);
   for(const session of sessions)await client.talk(['/ip/hotspot/active/remove',`=numbers=${session['.id']}`],10000);
   if(q)await client.talk(['/queue/simple/remove',`=numbers=${q['.id']}`],10000);
  }else{
   const targets=[...new Set(active.filter(s=>s.user===user&&/^\d{1,3}(\.\d{1,3}){3}$/.test(s.address)).map(s=>s.address+'/32'))];
   if(!targets.length){if(q)await client.talk(['/queue/simple/remove',`=numbers=${q['.id']}`],10000);continue;}
   await client.talk([`/queue/simple/${q?'set':'add'}`,...(q?[`=numbers=${q['.id']}`]:[`=name=${name}`]),`=comment=${OWNER}`,`=target=${targets.join(',')}`,`=parent=${FUP_QUEUE}`,`=max-limit=${policy.throttleKbps*1000}/${policy.throttleKbps*1000}`,'=queue=default-small/default-small','=disabled=no'],10000);
  }
 }
}
