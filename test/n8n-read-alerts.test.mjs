import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
const workflow=()=>JSON.parse(readFileSync('docs/n8n/regulation-workflow.json','utf8'));
const source=name=>workflow().nodes.find(n=>n.name===name).parameters.jsCode;
const router={routerId:'fouanga',name:'FOUANGA',regulationMode:'active',policy:{},fupLinks:[]};
function execute(code, sd, input) { return new Function('$','$input','$getWorkflowStaticData',code)(()=>({item:{json:router}}),{first:()=>({json:input})},()=>sd)[0].json; }
test('read failures expose a safe message rather than an object or a stack',()=>{
 const sd={};let out;
 for(let i=0;i<3;i++)out=execute(source('Erreur lecture'),sd,{error:{message:'timeout of 60000ms exceeded',code:'ECONNABORTED',stack:'SECRET_STACK'}});
 assert.equal(out.alert,true);assert.match(out.telegram,/timeout of 60000ms exceeded/);
 assert.doesNotMatch(out.telegram,/\[object Object\]|SECRET_STACK|INJOIGNABLE|regulation est suspendue/i);
});
test('successful scheduled reads reset the consecutive failure counter',()=>{
 const sd={fail:{fouanga:{count:2,alerted:false}}};
 execute(readFileSync('docs/n8n/pooled-decision.js','utf8'),sd,{links:[],active:[]});
 assert.equal(sd.fail.fouanga,undefined);
 const out=execute(source('Erreur lecture'),sd,{error:{message:'timeout'}});
 assert.equal(out.failCount,1);assert.equal(out.alert,false);
});
test('a confirmed FUP lock is busy collection, not a network outage',()=>{
 const sd={fail:{fouanga:{count:2,alerted:false}}};
 const out=execute(source('Erreur lecture'),sd,{error:{message:'503 - {"code":"FUP_COLLECTION_BUSY","error":"Application FUP en cours"}'}});
 assert.equal(out.alert,false);assert.equal(out.failCount,0);assert.equal(out.collectionStatus,'busy');
});
test('alerts are deduplicated, rearmed by recovery and maintenance respected',()=>{
 const sd={};for(let i=0;i<2;i++)assert.equal(execute(source('Erreur lecture'),sd,{error:'timeout'}).alert,false);
 assert.equal(execute(source('Erreur lecture'),sd,{error:'timeout'}).alert,true);
 assert.equal(execute(source('Erreur lecture'),sd,{error:'timeout'}).alert,false);
 router.maintenance=true;assert.equal(execute(source('Erreur lecture'),sd,{error:'timeout'}).failCount,0);delete router.maintenance;
});
test('n8n HTTP error descriptions and nested response bodies retain busy classification',()=>{
 for(const error of [
  {message:'Service unavailable',description:'503 - {"code":"FUP_COLLECTION_BUSY"}'},
  {message:'Service unavailable',response:{data:{code:'FUP_COLLECTION_BUSY',error:'Application FUP en cours'}}},
 ]) {
  const out=execute(source('Erreur lecture'),{fail:{fouanga:{count:2,alerted:false}}},{error});
  assert.equal(out.alert,false);assert.equal(out.collectionStatus,'busy');
 }
});
