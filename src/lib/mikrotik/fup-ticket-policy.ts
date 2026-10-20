import type { ActiveSession } from './regulation';
export type TicketPolicy={enabled:boolean;thresholdMB:number;windowMinutes:number;throttleKbps:number;persistenceMinutes:number;blockHours:number};
export const DEFAULT_TICKET_POLICY:TicketPolicy={enabled:false,thresholdMB:200,windowMinutes:15,throttleKbps:256,persistenceMinutes:15,blockHours:5};
export type TicketState={phase:'normal'|'throttle'|'blocked';at:number;until:number;persistenceMs:number;points:{at:number;bytes:number}[];sessions:Record<string,{bytes:number;address:string}>};
export type TicketStates=Record<string,TicketState>;
export type TicketEvent={user:string;kind:'throttle'|'blocked'|'released';until:number};
export function validateTicketPolicy(p:TicketPolicy) {
 return !p||typeof p.enabled!=='boolean'||!Number.isFinite(p.thresholdMB)||p.thresholdMB<1||p.thresholdMB>100000||
 ![5,10,15,30,60].includes(p.windowMinutes)||!Number.isInteger(p.throttleKbps)||p.throttleKbps<64||p.throttleKbps>1024||
 !Number.isInteger(p.persistenceMinutes)||p.persistenceMinutes<5||p.persistenceMinutes>60||p.blockHours!==5
 ?'Seuil 1–100000 Mo ; fenêtre 5/10/15/30/60 min ; bridage 64–1024 kbit/s ; persistance 5–60 min ; blocage 5 h.':null;
}
/** Ticket-level accounting, per-session deltas; no classifier of applications.
 * Only consecutive samples <=6 min apart can confirm continued saturation. */
export function advanceTicketPolicy(previous:TicketStates,active:ActiveSession[],policy:TicketPolicy,at:number) {
 const invalid=validateTicketPolicy(policy);if(invalid)throw new Error(invalid);
 const state:TicketStates=Object.create(null),events:TicketEvent[]=[];
 const users=new Map<string,ActiveSession[]>();
 if(policy.enabled)for(const s of active){if(!s.user||!s.mac||!s.address||!Number.isSafeInteger(s.bytesOut)||s.bytesOut<0)continue;const list=users.get(s.user)??[];list.push(s);users.set(s.user,list);}
 for(const user of new Set([...Object.keys(previous),...users.keys()])) {
  const old=Object.hasOwn(previous,user)?previous[user]:undefined;
  if(old&&at<=old.at){state[user]=old;continue;}
  if(old&&(!policy.enabled||old.phase!=='normal'&&at>=old.until)) {
   if(old.phase!=='normal')events.push({user,kind:'released',until:old.until});
   // Release first; do not instantly punish again from pre-sanction history.
   continue;
  }
  if(!policy.enabled)continue;
  if(old?.phase==='blocked'){state[user]={...old,at};continue;}
  const current=users.get(user)??[];
  if(!current.length){if(old&&old.phase==='throttle')state[user]={...old,at,persistenceMs:0,sessions:{}};continue;}
  const sessions:TicketState['sessions']={};let delta=0;
  const elapsed=old?at-old.at:0;
  let pair=false;
  for(const s of current){const key=(s.sessionId??s.mac)+'|'+s.address;if(sessions[key])continue;sessions[key]={bytes:s.bytesOut,address:s.address};
   const prev=old?.sessions[key];if(prev&&s.bytesOut>=prev.bytes&&elapsed>0&&elapsed<=360000){delta+=s.bytesOut-prev.bytes;pair=true;}}
  const points=(old?.points??[]).filter(p=>p.at>at-policy.windowMinutes*60000);
  if(pair)points.push({at,bytes:delta});
  const next:TicketState={phase:old?.phase??'normal',at,until:old?.until??0,persistenceMs:0,points,sessions};
  if(old?.phase==='throttle'){
   const sustained=pair&&delta*8/(elapsed/1000)>=policy.throttleKbps*1000*0.8;
   next.persistenceMs=sustained?old.persistenceMs+elapsed:0;
   if(next.persistenceMs>=policy.persistenceMinutes*60000){next.phase='blocked';next.until=at+policy.blockHours*3600000;next.sessions={};next.points=[];events.push({user,kind:'blocked',until:next.until});}
  }else if(pair&&points.reduce((n,p)=>n+p.bytes,0)>=policy.thresholdMB*1e6){next.phase='throttle';next.until=at+5*3600000;events.push({user,kind:'throttle',until:next.until});}
  state[user]=next;
 }
 // Built on a null-proto object so a "__proto__"/"constructor" username can't
 // pollute; return a plain-proto copy so drizzle's is() (Object.getPrototypeOf
 // (v).constructor) doesn't crash persisting it. Spread keeps those usernames
 // as own data properties, so no pollution is reintroduced.
 return {state:{...state},events};
}
