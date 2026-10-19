import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyTraffic, previousUtcDay } from './traffic-daily';
import type { TrafficSample, TrafficLinkSample } from './traffic-history';
const start=Date.parse('2026-10-18T00:00:00Z'), end=start+86400000;
const links=[{id:'a',name:'Standard',interface:'E1'},{id:'b',name:'Mini',interface:'E2'}];
function sample(from:number,to:number,rx=100,tx=20,quality:TrafficLinkSample['quality']='ok',id='a'):TrafficSample {
 return {at:to,connected:null,exchanging:null,conditions:[],links:[{...links.find(l=>l.id===id)!,rxBytes:rx,txBytes:tx,intervalStart:from,intervalSeconds:(to-from)/1000,rxMbps:null,txMbps:null,running:true,quality}]};
}
test('previous UTC calendar day crosses month/year independently of run hour',()=>{
 assert.deepEqual(previousUtcDay(new Date('2027-01-01T07:00:00Z')),{start:Date.parse('2026-12-31T00:00:00Z'),end:Date.parse('2027-01-01T00:00:00Z')});
});
test('downloads use RX, aggregate kits without counting duplicates or uploads',()=>{
 const rows=[sample(start,start+300000),sample(start,start+300000),sample(start,start+300000,200,40,'ok','b')];
 const d=dailyTraffic(rows,links,start,end);
 assert.equal(d.downloadBytes,300);assert.equal(d.uploadBytes,60);assert.equal(d.links[0].coveredSeconds,300);assert.equal(d.status,'partial');
});
test('absent data is unavailable, observed zero remains zero',()=>{
 const d=dailyTraffic([sample(start,start+300000,0,0)],links,start,end);
 assert.equal(d.links[0].downloadBytes,0);assert.equal(d.links[1].downloadBytes,null);assert.equal(dailyTraffic([],links,start,end).downloadBytes,null);
});
test('exclude resets, invalid counters and midnight straddles without prorating',()=>{
 const d=dailyTraffic([sample(start-1000,start+1000,500),sample(start,start+300000,999,20,'reset'),sample(start+300000,start+600000,-1),sample(end-1000,end+1000,500)],links.slice(0,1),start,end);
 assert.equal(d.downloadBytes,null);assert.equal(d.links[0].boundaryIntervals,2);
});
test('monotonic gap interval wholly in day has known volume; overlapping samples are excluded',()=>{
 const d=dailyTraffic([sample(start,start+3600000,800,40,'gap'),sample(start+300000,start+600000,999)],links.slice(0,1),start,end);
 assert.equal(d.downloadBytes,800);assert.equal(d.links[0].coveredSeconds,3600);assert.equal(d.links[0].gapIntervals,1);
});
test('complete interval coverage yields complete day and unknown interface cannot pollute total',()=>{
 const d=dailyTraffic([sample(start,end,0,0,'gap'),sample(start,end,500,0,'gap','b')],links.slice(0,1),start,end);
 assert.equal(d.status,'complete');assert.equal(d.downloadBytes,0);assert.equal(d.links[0].coveragePct,100);
});
