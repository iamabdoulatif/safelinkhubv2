import type { TrafficLink, TrafficSample } from './traffic-history';
const DAY=86400000;
export function previousUtcDay(at:Date) {
 const end=Date.UTC(at.getUTCFullYear(),at.getUTCMonth(),at.getUTCDate());
 return {start:end-DAY,end};
}
/** Exact measured intervals only: never invent midnight allocation or fill outages.
 * A monotonic counter gap retains its volume even when no rate can be drawn. */
export function dailyTraffic(samples:TrafficSample[], configured:TrafficLink[], start:number, end:number) {
 if (!Number.isFinite(start)||!Number.isFinite(end)||end-start!==DAY) throw new Error('Journée UTC invalide.');
 const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isSafeInteger(n)&&n>=0;
 const rows=[...samples].sort((a,b)=>a.at-b.at);
 const links=configured.map(link=>{
  let downloadBytes=0,uploadBytes=0,coveredMs=0,lastEnd=start,boundaryIntervals=0,gapIntervals=0;
  for(const row of [...rows].sort((a,b)=>(a.links.find(l=>l.id===link.id)?.intervalStart??Infinity)-(b.links.find(l=>l.id===link.id)?.intervalStart??Infinity)||b.at-a.at)) {
   const l=row.links.find(x=>x.id===link.id&&x.interface===link.interface);
   if (!l || !['ok','gap'].includes(l.quality) || !valid(l.rxBytes)||!valid(l.txBytes) || l.intervalStart===null || !Number.isFinite(l.intervalStart)||!Number.isFinite(row.at)||row.at<=l.intervalStart) continue;
   const from=l.intervalStart,to=row.at;
   if(to<=start||from>=end) continue;
   if(from<start||to>end){boundaryIntervals++;continue;}
   if(from<lastEnd) continue; // duplicate or overlapping counter interval
   downloadBytes+=l.rxBytes;uploadBytes+=l.txBytes;coveredMs+=to-from;lastEnd=to;
   if(l.quality==='gap')gapIntervals++;
  }
  return {...link,downloadBytes:coveredMs?downloadBytes:null,uploadBytes:coveredMs?uploadBytes:null,
   coveredSeconds:coveredMs/1000,coveragePct:Math.floor(coveredMs/DAY*10000)/100,
   missingSeconds:(DAY-coveredMs)/1000,boundaryIntervals,gapIntervals};
 });
 const measured=links.filter(l=>l.downloadBytes!==null);
 return {date:new Date(start).toISOString().slice(0,10),timezone:'UTC',start:new Date(start).toISOString(),end:new Date(end).toISOString(),
  status:!measured.length?'unavailable':links.every(l=>l.coveredSeconds===86400)?'complete':'partial',
  downloadBytes:measured.length?measured.reduce((n,l)=>n+l.downloadBytes!,0):null,
  uploadBytes:measured.length?measured.reduce((n,l)=>n+l.uploadBytes!,0):null,links,
  source:'mikrotik_wan_history',method:'contained_counter_intervals',
 };
}
