import {test} from 'node:test';
import assert from 'node:assert/strict';
import {applyTicketPolicy} from './fup-ticket-router';
import {DEFAULT_TICKET_POLICY,type TicketStates} from './fup-ticket-policy';
import type {RouterOSClient} from './client';
function mock(users:Record<string,string>[]){const calls:string[][]=[];return {calls,client:{talk:async(w:string[])=>{calls.push(w);if(w[0]==='/ip/hotspot/user/print')return users;return [];}} as unknown as RouterOSClient};}
test('blocked ticket arms local expiry before disabling, preserves Mikhmon comment and removes sessions',async()=>{
 const {calls,client}=mock([{'.id':'*1',name:'a',comment:'vc-date',disabled:'false'}]);
 const state:TicketStates={a:{phase:'blocked',at:0,until:Date.parse('2026-10-19T12:00:00Z'),persistenceMs:0,points:[],sessions:{}}};
 await applyTicketPolicy(client,state,[],DEFAULT_TICKET_POLICY);
 const armed=calls.findIndex(c=>c[0]==='/system/scheduler/add'),disabled=calls.findIndex(c=>c.includes('=disabled=yes'));
 assert.ok(armed>=0&&disabled>armed);assert.match(calls[armed].join(' '),/start-date=2026-10-19/);assert.ok(calls[armed].some(c=>c.startsWith('=comment=')&&c.includes('vc-date')));
 assert.ok(!calls[disabled].some(c=>c.startsWith('=comment=')));
});
test('pre-existing disabled ticket is never enabled or adopted',async()=>{
 const {calls,client}=mock([{'.id':'*1',name:'a',comment:'expired',disabled:'true'}]);
 const state:TicketStates={a:{phase:'blocked',at:0,until:9999,persistenceMs:0,points:[],sessions:{}}};
 await applyTicketPolicy(client,state,[],DEFAULT_TICKET_POLICY);assert.equal(state.a,undefined);assert.ok(!calls.some(c=>c[0].endsWith('/set')));
});

test('retry after router-side block and DB rollback preserves blocked recovery and original deadline',async()=>{
 const calls:string[][]=[];
 const meta={user:'a',id:'*1',comment:'vc-date',until:1792411200000,blocked:true};
 const client={talk:async(w:string[])=>{calls.push(w);if(w[0]==='/ip/hotspot/user/print')return [{'.id':'*1',name:'a',comment:'vc-date',disabled:'true'}];if(w[0]==='/system/scheduler/print')return [{'.id':'*2',name:'slh-fup-ticket-ca978112ca1bbdcafac2',comment:'SafeLinkHub FUP ticket v1 '+JSON.stringify(meta)}];return [];}} as unknown as RouterOSClient;
 const state:TicketStates={a:{phase:'throttle',at:0,until:1792411300000,persistenceMs:0,points:[],sessions:{}}};
 await applyTicketPolicy(client,state,[],DEFAULT_TICKET_POLICY);
 assert.equal(state.a.phase,'blocked');assert.equal(state.a.until,meta.until);
 assert.ok(calls.find(w=>w[0]==='/system/scheduler/set')?.some(w=>w.startsWith('=on-event=')&&w.includes('disabled=no')));
});

test('replacement account with same username never inherits an old native block',async()=>{
 const calls:string[][]=[];
 const meta={user:'a',id:'*1',comment:'old',until:1792411200000,blocked:true};
 const client={talk:async(w:string[])=>{calls.push(w);if(w[0]==='/ip/hotspot/user/print')return [{'.id':'*3',name:'a',comment:'new',disabled:'false'}];if(w[0]==='/system/scheduler/print')return [{'.id':'*2',name:'slh-fup-ticket-ca978112ca1bbdcafac2',comment:'SafeLinkHub FUP ticket v1 '+JSON.stringify(meta)}];return [];}} as unknown as RouterOSClient;
 const state:TicketStates={a:{phase:'blocked',at:0,until:1792411200000,persistenceMs:0,points:[],sessions:{}}};
 await applyTicketPolicy(client,state,[],DEFAULT_TICKET_POLICY);
 assert.equal(state.a,undefined);assert.ok(!calls.some(w=>w[0]==='/ip/hotspot/user/set'));
 assert.ok(calls.some(w=>w[0]==='/system/scheduler/remove'));
});
