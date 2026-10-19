import { and, asc, eq, gte, lte } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { routerTrafficSamples } from '@/lib/db/schema';
import { loadRegulatedRouter, n8nAuthorized, unauthorized } from '@/lib/mikrotik/regulation-api';
import { configuredTrafficLinks } from '@/lib/mikrotik/traffic-collector';
import { dailyTraffic, previousUtcDay } from '@/lib/mikrotik/traffic-daily';
import { calculateFupPool } from '@/lib/mikrotik/starlink-fup-pool';

export const dynamic='force-dynamic';
/** Read-only persisted report. Router availability must not suppress yesterday's data. */
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!n8nAuthorized(request))return unauthorized();
 const {id}=await params;
 if(!/^[\da-f-]{36}$/i.test(id))return Response.json({error:'Routeur invalide.'},{status:400});
 const row=await loadRegulatedRouter(id);
 if(!row)return Response.json({error:'Routeur non régulé.'},{status:404});
 const now=new Date(),{start,end}=previousUtcDay(now);
 const rows=await getDb().select({payload:routerTrafficSamples.payload}).from(routerTrafficSamples)
  .where(and(eq(routerTrafficSamples.routerId,id),gte(routerTrafficSamples.measuredAt,new Date(start)),lte(routerTrafficSamples.measuredAt,now)))
  .orderBy(asc(routerTrafficSamples.measuredAt)).limit(2000);
 const configured=configuredTrafficLinks(row.router,row.regulation.fupLinks);
 const samples=rows.map(r=>r.payload);
 const links=configured.length?configured:(samples.at(-1)?.links.map(({id,name,interface:iface})=>({id,name,interface:iface}))??[]);
 const cfg=row.regulation.fupLinks??[],ledger=row.regulation.fupLedger??{};
 return Response.json({at:now.toISOString(),source:'persisted_history',active:[],
  dailyUsage:dailyTraffic(samples,links,start,end),
  links:cfg.flatMap(l=>ledger[l.id]?[{id:l.id,cycleConfirmed:l.cycleConfirmed,...ledger[l.id]}]:[]),
  ...(row.regulation.fupPooled?{pool:calculateFupPool(cfg,ledger,now)}:{}),
 },{headers:{'Cache-Control':'no-store'}});
}
