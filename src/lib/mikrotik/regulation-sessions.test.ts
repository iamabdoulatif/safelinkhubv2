import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readRegulationSessions} from './regulation';
test('session collection preserves ticket accounting and requests no WAN counters',async()=>{
 const calls:string[][]=[];
 const rows=await readRegulationSessions({talk:async(words:string[])=>{calls.push(words);return [{'mac-address':'AA:BB:CC:DD:EE:FF',address:'10.0.0.2',user:'ticket', 'bytes-out':'123','bytes-in':'45'}]}} as never);
 assert.deepEqual(rows,[{mac:'AA:BB:CC:DD:EE:FF',address:'10.0.0.2',user:'ticket',bytesOut:123,bytesIn:45}]);
 assert.equal(calls.length,1);assert.equal(calls[0][0],'/ip/hotspot/active/print');
});
test('an API timeout is not reported as zero connected users',async()=>{
 await assert.rejects(readRegulationSessions({talk:async()=>{throw new Error('API timed out')}} as never),/timed out/);
});
