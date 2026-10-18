import assert from 'node:assert/strict';
import { test } from 'node:test';
import { calculateFupPool } from './starlink-fup-pool';
import { buildFupEnforcement } from './starlink-fup-enforcement';
import { suggestedStarlinkLinks } from './starlink-fup-presets';
const links=suggestedStarlinkLinks('0c1fea72-50fb-4593-a740-ea2a3fe49c5f');
const now=new Date('2026-10-18T12:00Z');
const ledger=Object.fromEntries(links.map((l,i)=>[l.id,{cycleStart:l.cycleStart,cycleEnd:l.cycleEnd,cycleUsedBytes:(i?2250:4930)*1e9,rawBytes:10000,uptimeSeconds:3600,baselineConfirmed:true,at:now.toISOString()}]));
test('pool adds both quotas and consumption before deciding reserve',()=>{
 const p=calculateFupPool(links,ledger,now);assert.equal(p.quotaGB,10000);assert.equal(p.usedGB,7180);assert.equal(p.remainingGB,2820);assert.equal(p.phase,'normal');assert.equal(p.endsAt,'2026-10-21T00:00:00.000Z');assert.ok(p.aggregateBps!>100000000);
 const plan=buildFupEnforcement(links,ledger,now,true);assert.equal(plan.reserve,false);assert.equal(plan.stop,false);assert.equal(plan.ticketRateBps,2000000);assert.ok(Math.abs(plan.uploadBps-plan.downloadBps)<=1);assert.match(plan.script,/:local consumed 0/);assert.doesNotMatch(plan.script,/69000000000/);
});
test('one exhausted member cannot stop remaining pool; total depletion does',()=>{
 const one={...ledger,[links[0].id]:{...ledger[links[0].id],cycleUsedBytes:5010e9}};
 assert.equal(buildFupEnforcement(links,one,now,true).stop,false);
 const all={...one,[links[1].id]:{...ledger[links[1].id],cycleUsedBytes:4990e9}};
 assert.equal(buildFupEnforcement(links,all,now,true).stop,true);
});
test('pool does not credit a renewal or accept stale counters implicitly',()=>{
 assert.equal(calculateFupPool(links,ledger,new Date('2026-10-21T00:00Z')).phase,'unknown');
 assert.throws(()=>buildFupEnforcement(links,{},now,true));
 assert.equal(calculateFupPool(links,ledger,new Date(now.getTime()+600000)).phase,'unknown');
});
