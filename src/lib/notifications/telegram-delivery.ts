import { and, asc, eq, gte, inArray, lt, lte, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { orgTelegramSettings as settings, orgTelegramDeliveries as deliveries, routers, routerRegulation, routerRegulationEvents as events } from '@/lib/db/schema';
import { decryptSecret } from '@/lib/mikrotik/crypto';
import { fupEventNotice, normalizeTelegramPreferences, quotaNotices, telegramCall, TelegramError } from './telegram';
import { calculateFupBudget } from '@/lib/mikrotik/starlink-fup';

/** Existing five-minute server cron drives this independently of slow router health checks. */
export async function runTelegramMaintenance(now = new Date(), options: {db?:ReturnType<typeof getDb>; send?:(token:string,chatId:string,text:string)=>Promise<unknown>} = {}) {
  const db = options.db ?? getDb();
  const send = options.send ?? ((token,chatId,text)=>telegramCall(token,'sendMessage',{chat_id:chatId,text}));
  const enabled = await db.select({orgId:settings.orgId}).from(settings).where(eq(settings.enabled,true)).orderBy(sql`${settings.lastProcessedAt} asc nulls first`);
  const deadline = Date.now()+45000;
  let sent = 0, failed = 0;
  // Least recently processed first, so the bounded work budget is fair across organizations.
  for (const {orgId} of enabled) {
    if (Date.now()>deadline) break;
    sent += await db.transaction(async tx=>{
      const lock = await tx.execute(sql`select pg_try_advisory_xact_lock(hashtext(${`telegram:${orgId}`})) as locked`);
      if (!lock.rows[0]?.locked) return 0;
      const [config] = await tx.select().from(settings).where(eq(settings.orgId,orgId)).for('update');
      if (!config?.enabled || !config.chatId || !config.testedAt || !config.activatedAt || !config.routerIds.length) return 0;
      await tx.update(settings).set({lastProcessedAt:now}).where(eq(settings.orgId,orgId));
      const prefs = normalizeTelegramPreferences(config.preferences);
      const selected = await tx.select({router:{id:routers.id,name:routers.name},regulation:{fupLinks:routerRegulation.fupLinks,fupLedger:routerRegulation.fupLedger,fupRuntime:routerRegulation.fupRuntime,fupMode:routerRegulation.fupMode}}).from(routers).leftJoin(routerRegulation,eq(routerRegulation.routerId,routers.id)).where(and(eq(routers.orgId,orgId),inArray(routers.id,config.routerIds)));
      const ids = selected.map(r=>r.router.id);
      await tx.update(deliveries).set({status:'cancelled'}).where(and(eq(deliveries.orgId,orgId),eq(deliveries.status,'pending'),ids.length ? sql`${deliveries.routerId} not in (${sql.join(ids.map(id=>sql`${id}::uuid`),sql`, `)})` : sql`true`));
      if (!ids.length) return 0;
      const queue = async (routerId:string,key:string,text:string) => {
        await tx.insert(deliveries).values({orgId,revision:config.revision,routerId,eventKey:key,text:text.slice(0,4000),createdAt:now,nextAttemptAt:now}).onConflictDoNothing();
      };
      const kinds = [...(prefs.changes ? ['fup_enforcement']:[]),...(prefs.releases ? ['fup_released']:[])];
      const recent = kinds.length ? await tx.select({id:events.id,kind:events.kind,payload:events.payload,routerId:events.routerId}).from(events).where(and(inArray(events.routerId,ids),inArray(events.kind,kinds),sql`not exists (select 1 from ${deliveries} where ${deliveries.orgId} = ${orgId} and ${deliveries.eventKey} = 'event:' || ${events.id}::text)`,gte(events.createdAt,new Date(Math.max(config.activatedAt.getTime(),now.getTime()-86400000))))).orderBy(asc(events.createdAt)).limit(500) : [];
      for (const event of recent) {
        const name = selected.find(r=>r.router.id===event.routerId)!.router.name;
        const text = fupEventNotice(event.kind,event.payload,name,prefs);
        if (text) await queue(event.routerId,`event:${event.id}`,text);
      }
      for (const {router,regulation} of selected) {
        if (prefs.quota && regulation?.fupLinks?.length) for (const notice of quotaNotices(regulation.fupLinks,regulation.fupLedger ?? {},now)) {
          await queue(router.id,`quota:${router.id}:${notice.key}`,`${router.name} — ${notice.text}`);
        }
        if (prefs.daily && now.getUTCHours()>=7 && regulation?.fupLinks?.length) {
          const lines = regulation.fupLinks.map(link=>{
            const budget = calculateFupBudget(link,regulation.fupLedger?.[link.id] ?? null,now);
            return `${link.name} : ${budget.remainingGB === null ? 'solde non confirmé ou relevé périmé' : `${budget.remainingGB.toFixed(1)} Go restants (estimation)`}`;
          });
          const runtime = regulation.fupRuntime;
          await queue(router.id,`daily:${now.toISOString().slice(0,10)}:${router.id}`,`Bilan FUP — ${router.name}\n${lines.join('\n')}\nMode : ${regulation.fupMode === 'active' ? runtime?.stopped ? 'suspension FUP' : runtime?.reserve ? 'réserve FUP' : 'lissage FUP' : 'observation'}.\nHorodatage : ${now.toISOString()} (UTC). Les restrictions Starlink restent indépendantes du FUP.`);
        }
      }
      // Changes to settings revoke queued deliveries from the previous configuration.
      await tx.update(deliveries).set({status:'cancelled'}).where(and(eq(deliveries.orgId,orgId),eq(deliveries.status,'pending'),sql`${deliveries.revision} <> ${config.revision}`));
      const pending = await tx.select().from(deliveries).where(and(eq(deliveries.orgId,orgId),eq(deliveries.revision,config.revision),eq(deliveries.status,'pending'),lte(deliveries.nextAttemptAt,now))).orderBy(asc(deliveries.createdAt)).limit(3);
      let delivered = 0;
      for (const item of pending) {
        if (Date.now()>deadline) break;
        try {
          await send(decryptSecret(config.tokenEncrypted),config.chatId,item.text);
          await tx.update(deliveries).set({status:'sent',attempts:item.attempts+1,sentAt:new Date(),lastError:null}).where(eq(deliveries.id,item.id));
          await tx.update(settings).set({lastError:null}).where(eq(settings.orgId,orgId));
          delivered++;
        } catch (error) {
          const safe = error instanceof TelegramError ? error : new TelegramError('Configuration Telegram inaccessible.',true);
          const attempts = item.attempts+1;
          await tx.update(deliveries).set({status:safe.permanent || attempts>=5 ? 'failed':'pending',attempts,lastError:safe.message,nextAttemptAt:new Date(Date.now()+Math.max(safe.retryAfter*1000,300000*2**(attempts-1)))}).where(eq(deliveries.id,item.id));
          await tx.update(settings).set({lastError:safe.message,...(safe.permanent ? {enabled:false}: {})}).where(eq(settings.orgId,orgId));
          if (safe.permanent) await tx.update(deliveries).set({status:'cancelled'}).where(and(eq(deliveries.orgId,orgId),eq(deliveries.status,'pending')));
          break;
        }
      }
      return delivered;
    }).catch(()=>{ failed++; return 0; }); // Never log raw database/upstream errors (may contain secrets).
  }
  await db.delete(deliveries).where(lt(deliveries.createdAt,new Date(now.getTime()-90*86400000)));
  return {organizations:enabled.length,sent,failed};
}
