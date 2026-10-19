import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { suggestedStarlinkLinks } from './starlink-fup-presets';
const cfg=suggestedStarlinkLinks('0c1fea72-50fb-4593-a740-ea2a3fe49c5f');
const at='2026-10-18T12:00:00.000Z';
class Clock extends Date { constructor(){super(at);} }
const router={routerId:'fouanga',name:'FOUANGA',fupLinks:cfg,fupPooled:true,state:{},policy:{},watch:{}};
const read={at,active:[],pool:{quotaGB:10000,usedGB:7180,remainingGB:2820,phase:'normal'},links:cfg.map((l,i)=>({...l,at,baselineConfirmed:true,cycleUsedBytes:(i?2250:4930)*1e9}))};
for(const file of ['pooled-decision.js','pooled-recap.js']) {
 test(`published n8n ${file} uses server pool and keeps 2M/2M`,()=>{
  const code=readFileSync(`docs/n8n/${file}`,'utf8');
  const run=new Function('$','$input','Date','$getWorkflowStaticData',code);
  const result=run(()=>({item:{json:router}}),{first:()=>({json:read})},Clock,()=>({}))[0].json;
  if(file==='pooled-decision.js') {
   assert.equal(result.fup.pool.remainingGB,2820);
   assert.ok(result.fup.links.every((l:{proposedPerTicketUploadDownload:string;proposedAction:string})=>l.proposedPerTicketUploadDownload==='2M/2M' && l.proposedAction==='accounting_only_pooled_policy'));
   assert.match(result.apply.state.fupV2.signature,/^pool:normal:/);
   assert.deepEqual(result.apply.throttles,[]);
  } else { assert.match(result.text,/10000 Go/);assert.match(result.text,/2820 Go/);assert.match(result.text,/2M\/2M/); }
 });
}
test('individual sites retain explicit suspension wording in daily recap',()=>{
 const run=new Function('$','$input','Date',readFileSync('docs/n8n/pooled-recap.js','utf8'));
 const input={...router,fupPooled:false,regulationMode:'active',fupRuntime:{stopped:true,totalBps:0}};
 const result=run(()=>({item:{json:input}}),{first:()=>({json:read})},Clock)[0].json;
 assert.match(result.text,/Internet suspendu/);
 assert.doesNotMatch(result.text,/Enveloppe cumulée/);
});

test('daily recap includes measured WAN downloads and warns about incomplete days',()=>{
 const run=new Function('$','$input','Date',readFileSync('docs/n8n/pooled-recap.js','utf8'));
 const dailyUsage={date:'2026-10-17',status:'partial',downloadBytes:30e9,uploadBytes:3e9,links:[{name:'Standard',downloadBytes:20e9,uploadBytes:2e9,coveragePct:90},{name:'Mini',downloadBytes:10e9,uploadBytes:1e9,coveragePct:80}]};
 const result=run(()=>({item:{json:router}}),{first:()=>({json:{...read,dailyUsage}})},Clock)[0].json;
 assert.match(result.text,/17\/10\/2026/);assert.match(result.text,/Téléchargés.*30[,.]00 Go/);
 assert.match(result.text,/Standard.*20[,.]00 Go/);assert.match(result.text,/Mini.*10[,.]00 Go/);
 assert.match(result.text,/incomplète/);assert.match(result.text,/90/);
 assert.match(result.text,/Envoyés.*3[,.]00 Go/);
});
test('daily recap never presents missing history as zero consumption',()=>{
 const run=new Function('$','$input','Date',readFileSync('docs/n8n/pooled-recap.js','utf8'));
 const result=run(()=>({item:{json:router}}),{first:()=>({json:{...read,dailyUsage:{date:'2026-10-17',status:'unavailable',downloadBytes:null,uploadBytes:null,links:[]}}})},Clock)[0].json;
 assert.match(result.text,/Téléchargés.*indisponible/);assert.doesNotMatch(result.text,/Téléchargés.*0[,.]00 Go/);
});
