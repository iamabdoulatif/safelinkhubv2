import {test} from 'node:test';
import assert from 'node:assert/strict';
import {advanceTicketPolicy, DEFAULT_TICKET_POLICY} from './fup-ticket-policy';
const p={...DEFAULT_TICKET_POLICY,enabled:true,thresholdMB:10,persistenceMinutes:5};
const s=(n:number,user='ticket')=>({user,mac:'AA:BB:CC:DD:EE:FF',address:'10.0.0.2',bytesOut:n,bytesIn:0});
test('first sample is baseline, normal download triggers throttle, persistence blocks exactly five hours',()=>{
 let state=advanceTicketPolicy({},[s(100e6)],p,0).state;
 let r=advanceTicketPolicy(state,[s(120e6)],p,300000);assert.equal(r.state.ticket.phase,'throttle');state=r.state;
 r=advanceTicketPolicy(state,[s(130e6)],p,600000);assert.equal(r.state.ticket.phase,'blocked');assert.equal(r.state.ticket.until,600000+5*3600000);
 const again=advanceTicketPolicy(r.state,[],p,900000);assert.equal(again.state.ticket.until,r.state.ticket.until);
 const expired=advanceTicketPolicy(again.state,[],p,r.state.ticket.until);assert.equal(expired.state.ticket,undefined);assert.equal(expired.events[0].kind,'released');
});
test('counter reset and duplicate observations never cause a punishment',()=>{
 const state=advanceTicketPolicy({},[s(100e6)],p,1000).state;
 assert.equal(advanceTicketPolicy(state,[s(0)],p,301000).state.ticket.phase,'normal');
 assert.deepEqual(advanceTicketPolicy(state,[s(200e6)],p,1000).state,state);
});
test('ticket remains throttled across reconnect and fresh session starts with baseline',()=>{
 let state=advanceTicketPolicy({},[s(0)],p,0).state;
 state=advanceTicketPolicy(state,[s(20e6)],p,300000).state;
 const r=advanceTicketPolicy(state,[{...s(100e6),address:'10.0.0.3'}],p,600000);
 assert.equal(r.state.ticket.phase,'throttle');assert.equal(r.state.ticket.persistenceMs,0);
});
test('disabled policy releases sanctions and never observes punitive traffic',()=>{
 const state=advanceTicketPolicy(advanceTicketPolicy({},[s(0)],p,0).state,[s(20e6)],p,300000).state;
 const r=advanceTicketPolicy(state,[s(500e6)],{...p,enabled:false},600000);
 assert.deepEqual(Object.keys(r.state),[]);assert.equal(r.events[0].kind,'released');
});

test('arbitrary ticket names cannot inherit or modify object prototypes',()=>{
 const r=advanceTicketPolicy({},[s(0,'__proto__'),s(0,'constructor')],p,0);
 assert.equal(Object.keys(r.state).length,2);assert.equal(r.state['__proto__'].phase,'normal');
 assert.equal(Object.getPrototypeOf(r.state),null);
});
