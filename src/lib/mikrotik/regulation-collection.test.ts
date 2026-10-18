import assert from 'node:assert/strict';
import {test} from 'node:test';
import {withCollectionDeadline, collectionFailure} from './regulation-collection';
test('deadline closes an acquired router and returns a structured timeout',async()=>{
 let closed=0;const client={close(){closed++}};
 await assert.rejects(withCollectionDeadline(async()=>client,async()=>new Promise(()=>{}),15),/délai/);
 assert.equal(closed,1);
});
test('late connections are closed even after the HTTP response has ended',async()=>{
 let closed=0;let resolve!:(c:{close:()=>void})=>void;let collected=false;
 const connect=new Promise<{close:()=>void}>(r=>{resolve=r});
 await assert.rejects(withCollectionDeadline(()=>connect,async()=>{collected=true},10));
 resolve({close:()=>{closed++}});await new Promise(r=>setImmediate(r));
 assert.equal(closed,1);assert.equal(collected,false);
});
test('successful reads close once and return the actual fresh result',async()=>{
 let closed=0;const result=await withCollectionDeadline(async()=>({close(){closed++}}),async()=>({active:123}),100);
 assert.deepEqual(result,{active:123});assert.equal(closed,1);
});
test('lock contention is distinguished from router failure without exposing SQL',()=>{
 assert.equal(collectionFailure({cause:{code:'55P03',message:'SECRET SQL'}}).code,'FUP_COLLECTION_BUSY');
 assert.doesNotMatch(JSON.stringify(collectionFailure(new Error('password SECRET'))),/SECRET/);
});
