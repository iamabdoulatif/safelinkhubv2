import {test} from 'node:test';
import assert from 'node:assert/strict';
import {ticketFloorRate, installTicketFairness} from './ticket-fairness';
test('ticket rate has at least 2M each way without lowering higher commercial rates',()=>{
 assert.equal(ticketFloorRate(''),'2M/2M');assert.equal(ticketFloorRate('128k/256k'),'2M/2M');
 assert.equal(ticketFloorRate('5M/10M'),'5M/10M');assert.equal(ticketFloorRate('1M/5M'),'2M/5M');
 assert.equal(ticketFloorRate('2M'),'2M');assert.equal(ticketFloorRate('0/0'),'2M/2M');
 assert.throws(()=>ticketFloorRate('bad'),/illisible/);
});
test('fairness refuses an unrelated existing queue before changing router configuration',async()=>{
 const calls:string[][]=[];
 const client={talk:async(w:string[])=>{calls.push(w);if(w[0]==='/system/resource/print')return[{'cpu-load':'20'}];if(w[0]==='/queue/simple/print')return[{name:'slh-ticket-fairness',comment:'someone else'}];return[];}};
 await assert.rejects(installTicketFairness(client as never),/hors/);
 assert.ok(calls.every(w=>w[0].endsWith('/print')));
});
test('installer requests RouterOS done attributes and applies queues without kicking HotSpot users',async()=>{
 const tables:Record<string,Record<string,string>[]>={
  '/system/resource':[{'cpu-load':'20'}],'/queue/simple':[], '/queue/type':[],
  '/ip/hotspot':[{interface:'HOTSPOT',disabled:'false'}],
  '/ip/hotspot/user/profile':[{'.id':'*p',name:'01-JOUR'},{'.id':'*pay',name:'slh-paiement'}],
  '/ip/firewall/filter':[{'.id':'*ft',action:'fasttrack-connection',disabled:'false'}],
 };
 const calls:string[][]=[];let serial=0;
 const client={talk:async(w:string[],_timeout?:number,done=false)=>{
  calls.push(w);const path=w[0].slice(0,w[0].lastIndexOf('/')),action=w[0].slice(w[0].lastIndexOf('/')+1);
  const params=Object.fromEntries(w.slice(1).filter(s=>s.startsWith('=')).map(s=>{const i=s.indexOf('=',1);return[s.slice(1,i),s.slice(i+1)];}));
  const rows=tables[path]??(tables[path]=[]);
  if(action==='print')return rows.filter(r=>w.filter(s=>s.startsWith('?')).every(s=>{const i=s.indexOf('=');return r[s.slice(1,i)]===s.slice(i+1);}));
  if(action==='add'){const id='*'+(++serial);rows.push({'.id':id,...params});return done?[{ret:id}]:[];}
  if(action==='set'){Object.assign(rows.find(r=>r['.id']===params.numbers)!,params);}
  return[];
 }};
 const result=await installTicketFairness(client as never);
 assert.equal(result.profiles[0].rate,'2M/2M');
 assert.equal(tables['/ip/hotspot/user/profile'][1]['rate-limit'],undefined);
 assert.equal(tables['/ip/firewall/filter'][0]['connection-mark'],'no-mark');
 assert.equal(tables['/ip/firewall/filter'][0]['in-interface'],'!HOTSPOT');
 assert.equal(tables['/ip/firewall/filter'][0]['out-interface'],'!HOTSPOT');
 assert.equal(tables['/queue/type'].length,2);
 assert.ok(tables['/queue/type'].every(t=>t['pcq-rate']==='2000000'));
 assert.ok(!calls.some(c=>c[0]==='/ip/hotspot/active/remove'));
});
