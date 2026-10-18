import assert from 'node:assert/strict';
import {test} from 'node:test';
import {recentFupMeasurements} from './starlink-fup-recent';
import {suggestedStarlinkLinks} from './starlink-fup-presets';
const at=new Date('2026-10-18T21:00:00Z');
const links=suggestedStarlinkLinks('0c1fea72-50fb-4593-a740-ea2a3fe49c5f');
const ledger=Object.fromEntries(links.map(l=>[l.id,{cycleStart:l.cycleStart,cycleEnd:l.cycleEnd,cycleUsedBytes:2000e9,rawBytes:1e9,at:new Date(at.getTime()-10000).toISOString(),baselineConfirmed:true}]));
test('reuse only a complete recently confirmed server sample, with its real timestamp',()=>{
 const result=recentFupMeasurements(links,ledger,at)!;
 assert.equal(result.length,2);assert.equal(result[0].at,ledger[links[0].id].at);assert.equal(result[0].budget.phase,'normal');
});
test('stale, incomplete, future, unconfirmed and wrong-cycle ledgers force a live read',()=>{
 for(const patch of [{at:new Date(at.getTime()-31000).toISOString()},{at:new Date(at.getTime()+1000).toISOString()},{baselineConfirmed:false},{cycleStart:'2026-01-01T00:00:00Z'}]) {
  assert.equal(recentFupMeasurements(links,{...ledger,[links[0].id]:{...ledger[links[0].id],...patch}},at),null);
 }
 assert.equal(recentFupMeasurements(links,{},at),null);
});
