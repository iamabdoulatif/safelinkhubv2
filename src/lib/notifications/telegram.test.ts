import assert from 'node:assert/strict';
import { test } from 'node:test';
import { telegramCall, matchingPrivateChat, hashPairCode, normalizeTelegramPreferences, validateRouterSelection, canManageTelegram, quotaNotices } from './telegram';

test('only administrators configure organization notifications', () => {
  assert.equal(canManageTelegram({orgId:'a',userId:'u',role:'admin'}), true);
  assert.equal(canManageTelegram({orgId:'a',userId:'u',role:'superadmin'}), true);
  for (const role of ['agent','editor','viewer','']) assert.equal(canManageTelegram({orgId:'a',userId:'u',role}), false);
  assert.equal(canManageTelegram(null), false);
});
test('pairing requires exact challenge, private human chat and non-expired challenge', () => {
  const code = 'a'.repeat(43), expires = new Date('2026-10-18T12:10Z'), now = new Date('2026-10-18T12:00Z');
  const update = {update_id: 1, message:{text:`/start ${code}`,chat:{id:123456,type:'private',first_name:'Alice'},from:{id:123456,is_bot:false}}};
  assert.equal(matchingPrivateChat([update],hashPairCode(code),expires,now)?.id,'123456');
  assert.equal(matchingPrivateChat([update],hashPairCode('other'),expires,now),null);
  assert.equal(matchingPrivateChat([update],hashPairCode(code),expires,expires),null);
  assert.equal(matchingPrivateChat([{...update,message:{...update.message,chat:{id:-123456,type:'group'}}}],hashPairCode(code),expires,now),null);
});
test('router selection cannot escape organization and is bounded', () => {
  assert.deepEqual(validateRouterSelection(['a','a','b'],['a','b']),['a','b']);
  assert.throws(()=>validateRouterSelection(['foreign'],['a']),/organisation/);
  assert.throws(()=>validateRouterSelection([],['a']),/routeur/);
});
test('preferences default off for consent and reject missing values', () => {
  assert.deepEqual(normalizeTelegramPreferences({changes:true,daily:true}),{changes:true,quota:false,releases:false,daily:true});
  assert.equal(normalizeTelegramPreferences({daily:'true'}).daily,false);
});
test('Telegram errors never echo raw descriptions or token URLs', async () => {
  const token='123456:FAKE_secret_token_never_real_123456';
  const fetcher = async () => new Response(JSON.stringify({ok:false,error_code:401,description:`bad ${token}`}),{status:401});
  await assert.rejects(()=>telegramCall(token,'getMe',{},fetcher as typeof fetch),error=> error instanceof Error && /Token/.test(error.message) && !error.message.includes(token));
  await assert.rejects(()=>telegramCall(token,'getMe',{},(async()=>{throw new Error(token)}) as typeof fetch),error=> error instanceof Error && !error.message.includes(token));
});
test('API uses fixed Telegram host, POST and no caching', async () => {
  await telegramCall('123456:FAKE_secret_token_never_real_123456','getMe',{},(async(url,init)=>{
    assert.match(String(url),/^https:\/\/api.telegram.org\/bot/); assert.equal(init?.method,'POST'); assert.equal(init?.cache,'no-store');
    return new Response(JSON.stringify({ok:true,result:{id:1}}));
  }) as typeof fetch);
});
test('quota notices require confirmed fresh same-cycle data; warning identity includes cycle', () => {
  const at = new Date('2026-10-18T12:00Z');
  const link = {id:'standard',name:'Standard',interface:'ether1',quotaGB:5000,reserveGB:500,cycleStart:'2026-10-01T00:00Z',cycleEnd:'2026-11-01T00:00Z',cycleConfirmed:true};
  const ledger = {cycleStart:link.cycleStart,cycleEnd:link.cycleEnd,cycleUsedBytes:4600e9,rawBytes:1,at:at.toISOString(),baselineConfirmed:true};
  assert.equal(quotaNotices([link],{standard:ledger},at)[0]?.level,'reserve');
  assert.equal(quotaNotices([link],{standard:{...ledger,baselineConfirmed:false}},at).length,0);
  assert.equal(quotaNotices([link],{standard:ledger},new Date(at.getTime()+300000)).length,0);
});

test('FUP event routing respects category and does not claim a renewal on release', async () => {
  const { fupEventNotice } = await import('./telegram');
  const prefs = normalizeTelegramPreferences({changes:true,releases:false});
  assert.equal(fupEventNotice('fup_released',{},'Kongasso',prefs),null);
  assert.equal(fupEventNotice('decision',{telegram:'untrusted'},'Kongasso',prefs),null);
  assert.match(fupEventNotice('fup_enforcement',{telegram:'Kongasso : réserve.'},'Kongasso',prefs)!,/réserve/);
  const released = fupEventNotice('fup_released',{},'Kongasso',{...prefs,releases:true})!;
  assert.match(released,/levées/); assert.doesNotMatch(released,/renouvel/);
});
