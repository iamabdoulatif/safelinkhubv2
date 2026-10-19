import {eq,sql} from 'drizzle-orm';
import {getDb} from '@/lib/db';
import {routerRegulation,routerRegulationEvents} from '@/lib/db/schema';
import type {RouterOSClient} from './client';
import {readRegulationSessions} from './regulation';
import {advanceTicketPolicy,DEFAULT_TICKET_POLICY} from './fup-ticket-policy';
import {applyTicketPolicy} from './fup-ticket-router';

/** Dedicated lock: cron and n8n must not increment the same ticket twice. */
export async function runTicketPolicy(routerId:string,client:RouterOSClient,release=false) {
 return getDb().transaction(async tx=>{
  const lock=await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext('fup-tickets'),hashtext(${routerId})) as acquired`);
  if(lock.rows[0]?.acquired!==true)return {changed:false,telegram:''};
  const [row]=await tx.select().from(routerRegulation).where(eq(routerRegulation.routerId,routerId)).for('update');
  if(!row)return {changed:false,telegram:''};
  const policy={...(row.fupTicketPolicy??DEFAULT_TICKET_POLICY),...((release||row.fupMode!=='active')?{enabled:false}:{})};
  if(!release&&!policy.enabled&&!Object.keys(row.fupTicketState??{}).length)return {changed:false,telegram:''};
  const now=Date.now();
  const active=policy.enabled?await readRegulationSessions(client):[];
  const result=advanceTicketPolicy(row.fupTicketState??{},active,policy,now);
  await applyTicketPolicy(client,result.state,active,policy);
  for(const [user,s] of Object.entries(result.state))if(s.phase==='blocked'&&row.fupTicketState?.[user]?.phase!=='blocked'&&!result.events.some(e=>e.user===user&&e.kind==='blocked'))result.events.push({user,kind:'blocked',until:s.until});
  const events=result.events.filter(e=>e.kind==='released'||result.state[e.user]?.phase===e.kind);
  await tx.update(routerRegulation).set({fupTicketState:result.state}).where(eq(routerRegulation.routerId,routerId));
  const text=events.map(e=>`Ticket ${e.user} : ${e.kind==='blocked'?'coupure complète 5 h, vidéos comprises':e.kind==='throttle'?`bridage ${policy.throttleKbps} kbit/s`:'sanction terminée'}${e.kind!=='released'?` ; fin ${new Date(e.until).toISOString()}`:''}.`).join('\n');
  if(events.length)await tx.insert(routerRegulationEvents).values({routerId,kind:'fup_enforcement',payload:{at:new Date(now).toISOString(),telegram:text,ticketEvents:events}});
  return {changed:events.length>0,telegram:text};
 });
}
