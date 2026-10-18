import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from '@/lib/db/schema';
import { configureOrganizationTelegram, readOrganizationTelegram, type TelegramCommand } from './telegram-configuration';
import { runTelegramMaintenance } from './telegram-delivery';
import { platformTelegramRouterScope } from './platform-telegram-scope';
import { telegramCall, TelegramError } from './telegram';
import { encryptSecret } from '@/lib/mikrotik/crypto';

// Explicit local/test database only. All rows live in a unique disposable schema.
test('Telegram organization onboarding, tenant isolation, consent and delivery retries (real PostgreSQL)',{skip:!process.env.TEST_DATABASE_URL},async t=>{
  const admin = new Pool({connectionString:process.env.TEST_DATABASE_URL,max:1});
  const namespace = `telegram_test_${randomUUID().replaceAll('-','')}`;
  await admin.query(`create schema ${namespace}`);
  const pool = new Pool({connectionString:process.env.TEST_DATABASE_URL,options:`-c search_path=${namespace}`,max:5});
  const db = drizzle(pool,{schema});
  const previousSecret = process.env.AUTH_SECRET;
  process.env.AUTH_SECRET='isolated-integration-test-secret-not-production';
  try {
    await pool.query(`create table organizations(id uuid primary key); create table users(id uuid primary key default gen_random_uuid(),org_id uuid references organizations(id),role text); create table routers(id uuid primary key,org_id uuid references organizations(id),name text); create table router_regulation(router_id uuid primary key references routers(id),fup_links jsonb,fup_ledger jsonb,fup_runtime jsonb,fup_mode text); create table router_regulation_events(id uuid primary key default gen_random_uuid(),router_id uuid references routers(id),kind text,payload jsonb,created_at timestamp default now());`);
    await pool.query(readFileSync('scripts/add-org-telegram.sql','utf8'));
    const orgA=randomUUID(),orgB=randomUUID(),routerA=randomUUID(),routerB=randomUUID();
    await pool.query('insert into organizations values($1),($2)',[orgA,orgB]);
    await pool.query('insert into routers values($1,$2,$3),($4,$5,$6)',[routerA,orgA,'Fouanga',routerB,orgB,'Other client']);
    const sessionA={orgId:orgA,userId:randomUUID(),role:'admin',name:'Alice',email:'alice@example.test'};
    const sessionB={...sessionA,orgId:orgB,userId:randomUUID()};
    const token='123456:FAKE_secret_token_never_real_123456';
    let botId=123456,updates:unknown[]=[];
    const calls:string[]=[];
    const mockCall=(async (_token:string,method:string)=>{
      calls.push(method);
      if (method==='getMe') return {id:botId,is_bot:true,first_name:'Client bot',username:'client_test_bot'};
      if (method==='getWebhookInfo') return {url:''};
      if (method==='getUpdates') return updates;
      if (method==='sendMessage') return {message_id:1};
      if (method==='getChat') return {id:123456,type:'private',first_name:'Alice'};
      throw new Error('Unexpected method');
    }) as typeof telegramCall;
    const command=async(cmd:TelegramCommand,session=sessionA,call=mockCall)=>{
      await pool.query('update org_telegram_settings set last_call_at=null where org_id=$1',[session.orgId]);
      return configureOrganizationTelegram(session,cmd,db,call);
    };
    await t.test('legacy platform Telegram workflow excludes tenant routers',async()=>{
      await pool.query('insert into users(org_id,role) values($1,$2),($3,$4)',[orgA,'admin',orgB,'superadmin']);
      const scope=await db.select({id:schema.routers.id}).from(schema.routers).where(platformTelegramRouterScope(db));
      assert.deepEqual(scope.map(row=>row.id),[routerB]);
    });
    await t.test('rejects viewer before DB writes or Telegram calls',async()=>{
      const before=calls.length;
      assert.equal((await command({kind:'bot',token},{...sessionA,role:'viewer'})).ok,false);
      assert.equal(calls.length,before);
      assert.equal(await readOrganizationTelegram({...sessionA,role:'viewer'},db),null);
    });
    await t.test('encrypts credentials, prevents cross-org bot reuse and hides all secrets from projection',async()=>{
      assert.equal((await command({kind:'bot',token})).ok,true);
      const saved=(await pool.query('select token_encrypted from org_telegram_settings where org_id=$1',[orgA])).rows[0];
      assert.notEqual(saved.token_encrypted,token);
      assert.equal((await command({kind:'bot',token},sessionB)).ok,false);
      const view=await readOrganizationTelegram(sessionA,db);
      assert.deepEqual(view?.routers.map(r=>r.id),[routerA]);
      assert.ok(!JSON.stringify(view).includes(token)); assert.ok(!JSON.stringify(view).includes(saved.token_encrypted));
    });
    await t.test('pairing preserves existing webhook and cannot be confirmed by another organization admin',async()=>{
      const withWebhook=(async (_token:string,method:string)=>method==='getWebhookInfo'?{url:'https://existing.example/webhook'}:null) as typeof telegramCall;
      const rejected=await command({kind:'pair'},sessionA,withWebhook);
      assert.equal(rejected.ok,false); assert.match(!rejected.ok?rejected.error:'',/webhook/);
      const pairing=await command({kind:'pair'});
      assert.ok(pairing.ok && pairing.link);
      const code=new URL(pairing.ok?pairing.link!:'').searchParams.get('start');
      updates=[{update_id:10,message:{text:`/start ${code}`,chat:{id:123456,type:'private',first_name:'Alice'},from:{id:123456,is_bot:false}}}];
      assert.equal((await command({kind:'poll'})).ok,true);
      assert.equal((await command({kind:'confirm'},{...sessionA,userId:randomUUID()})).ok,false);
      assert.equal((await command({kind:'confirm'})).ok,true);
      assert.equal((await command({kind:'confirm'})).ok,false);
    });
    const prefs={changes:true,quota:false,releases:true,daily:false};
    await t.test('test and owned route selection are required before activation',async()=>{
      assert.equal((await command({kind:'preferences',enabled:true,preferences:prefs,routerIds:[routerA]})).ok,false);
      assert.equal((await command({kind:'test'})).ok,true);
      assert.equal((await command({kind:'preferences',enabled:true,preferences:prefs,routerIds:[routerB]})).ok,false);
      assert.equal((await command({kind:'preferences',enabled:true,preferences:prefs,routerIds:[routerA]})).ok,true);
    });
    const now=new Date(Date.now()+1000);
    await pool.query('insert into router_regulation_events(router_id,kind,payload,created_at) values($1,$2,$3,$4),($5,$2,$6,$4)',[routerA,'fup_enforcement',JSON.stringify({telegram:'Fouanga : réserve.'}),now,routerB,JSON.stringify({telegram:'PRIVATE FOREIGN DATA'})]);
    await t.test('worker sends once, only owned event, and concurrent cron does not duplicate',async()=>{
      const sent:string[]=[];
      const send=async(_token:string,chatId:string,text:string)=>{assert.equal(chatId,'123456');sent.push(text);await new Promise(resolve=>setTimeout(resolve,50));};
      await Promise.all([runTelegramMaintenance(now,{db,send}),runTelegramMaintenance(now,{db,send})]);
      await runTelegramMaintenance(now,{db,send});
      assert.deepEqual(sent,['Fouanga : réserve.']);
      const view=await readOrganizationTelegram(sessionB,db);assert.equal(view?.history.length,0);
    });
    await t.test('already queued events do not hide new alerts behind a full scan page',async()=>{
      const revision=(await pool.query('select revision from org_telegram_settings where org_id=$1',[orgA])).rows[0].revision;
      // More than a worker page of historical events, already delivered.
      await pool.query(`with inserted as (insert into router_regulation_events(router_id,kind,payload,created_at) select $1,'fup_enforcement','{"telegram":"Already sent"}'::jsonb,$2::timestamp-interval '1 millisecond' from generate_series(1,501) returning id) insert into org_telegram_deliveries(org_id,revision,router_id,event_key,text,status) select $3,$4,$1,'event:'||id,'Already sent','sent' from inserted`,[routerA,now,orgA,revision]);
      await pool.query('insert into router_regulation_events(router_id,kind,payload,created_at) values($1,$2,$3,$4)',[routerA,'fup_enforcement',JSON.stringify({telegram:'New event after backlog'}),now]);
      const texts:string[]=[];
      await runTelegramMaintenance(now,{db,send:async(_t,_c,text)=>{texts.push(text);}});
      assert.deepEqual(texts,['New event after backlog']);
    });
    await t.test('temporary errors retry and permanent errors disable consent without leaking raw error',async()=>{
      await pool.query('insert into router_regulation_events(router_id,kind,payload,created_at) values($1,$2,$3,$4)',[routerA,'fup_released','{}',now]);
      await runTelegramMaintenance(now,{db,send:async()=>{throw new TelegramError('Telegram temporairement indisponible.');}});
      const retry=(await pool.query("select * from org_telegram_deliveries where status='pending'")).rows[0];
      assert.equal(retry.attempts,1);assert.ok(retry.next_attempt_at>new Date());
      await pool.query("update org_telegram_deliveries set next_attempt_at=$1 where status='pending'",[new Date(0)]);
      await runTelegramMaintenance(now,{db,send:async()=>{throw new TelegramError('Le bot est bloqué.',true);}});
      assert.equal((await readOrganizationTelegram(sessionA,db))?.bot?.enabled,false);
      assert.equal((await pool.query("select status from org_telegram_deliveries where id=$1",[retry.id])).rows[0].status,'failed');
    });
    await t.test('moving a router cancels queued alerts before they can reach its former owner',async()=>{
      assert.equal((await command({kind:'preferences',enabled:true,preferences:prefs,routerIds:[routerA]})).ok,true);
      const later=new Date(Date.now()+2000);
      await pool.query('insert into router_regulation_events(router_id,kind,payload,created_at) values($1,$2,$3,$4)',[routerA,'fup_enforcement',JSON.stringify({telegram:'Moved router pending alert'}),later]);
      await runTelegramMaintenance(later,{db,send:async()=>{throw new TelegramError('Temporary');}});
      await pool.query('update routers set org_id=$1 where id=$2',[orgB,routerA]);
      await pool.query("update org_telegram_deliveries set next_attempt_at=$1 where status='pending'",[new Date(0)]);
      let leaked=false;
      await runTelegramMaintenance(later,{db,send:async()=>{leaked=true;}});
      assert.equal(leaked,false);
      assert.equal((await pool.query("select count(*)::int n from org_telegram_deliveries where status='pending'")).rows[0].n,0);
      await pool.query('update routers set org_id=$1 where id=$2',[orgA,routerA]);
    });
    await t.test('replacement revokes recipient/test/activation; disconnect deletes token',async()=>{
      botId=654321;
      assert.equal((await command({kind:'bot',token})).ok,true);
      const view=await readOrganizationTelegram(sessionA,db);
      assert.equal(view?.bot?.chatId,null);assert.equal(view?.bot?.tested,false);assert.equal(view?.bot?.enabled,false);
      assert.equal((await command({kind:'disconnect'})).ok,true);
      assert.equal((await readOrganizationTelegram(sessionA,db))?.bot,null);
      assert.equal((await pool.query('select count(*)::int n from org_telegram_settings')).rows[0].n,0);
      // No real Telegram request was sent: onboarding client and delivery transport were injected.
      assert.ok(calls.includes('sendMessage'));
      assert.notEqual(encryptSecret(token),token);
    });
  } finally {
    if(previousSecret===undefined) delete process.env.AUTH_SECRET; else process.env.AUTH_SECRET=previousSecret;
    await pool.end();
    await admin.query(`drop schema ${namespace} cascade`);
    await admin.end();
  }
});
