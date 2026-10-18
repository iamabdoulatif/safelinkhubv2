import { randomBytes, randomUUID } from 'node:crypto';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { SessionPayload } from '@/lib/auth/session';
import { getDb } from '@/lib/db';
import { orgTelegramSettings as settings, orgTelegramDeliveries as deliveries, routers } from '@/lib/db/schema';
import { decryptSecret, encryptSecret } from '@/lib/mikrotik/crypto';
import { canManageTelegram, hashPairCode, matchingPrivateChat, normalizeTelegramPreferences, telegramCall, TelegramError, validateRouterSelection, type TelegramPreferences, type TelegramUpdate } from './telegram';

class ConfigurationError extends Error {}

export type TelegramCommand =
  | {kind:'bot';token:string}
  | {kind:'pair'} | {kind:'poll'} | {kind:'confirm'}
  | {kind:'manual';chatId:string}
  | {kind:'test'} | {kind:'disconnect'}
  | {kind:'preferences';enabled:boolean;preferences:TelegramPreferences;routerIds:string[]};

/** Explicit public projection. Neither ciphertext nor pairing code/hash can leave the server. */
export async function readOrganizationTelegram(session: SessionPayload | null, db = getDb()) {
  if (!session || !canManageTelegram(session)) return null;
  const [row] = await db.select().from(settings).where(eq(settings.orgId,session.orgId));
  const owned = await db.select({id:routers.id,name:routers.name}).from(routers).where(eq(routers.orgId,session.orgId));
  const history = await db.select({id:deliveries.id,status:deliveries.status,attempts:deliveries.attempts,error:deliveries.lastError,at:deliveries.createdAt,sentAt:deliveries.sentAt}).from(deliveries).where(eq(deliveries.orgId,session.orgId)).orderBy(desc(deliveries.createdAt)).limit(10);
  return { bot:row ? {name:row.botName,username:row.botUsername,chatId:row.chatId,chatLabel:row.chatLabel,tested:!!row.testedAt,enabled:row.enabled,preferences:normalizeTelegramPreferences(row.preferences),routerIds:row.routerIds,pending:row.pending && row.pending.expires > new Date().toISOString() ? {expires:row.pending.expires,candidate:row.pending.userId === session.userId ? row.pending.candidate ?? null : null} : null,error:row.lastError} : null, routers:owned, history:history.map(h=>({...h,at:h.at.toISOString(),sentAt:h.sentAt?.toISOString() ?? null})) };
}
export async function configureOrganizationTelegram(session: SessionPayload | null, command: TelegramCommand, db = getDb(), call: typeof telegramCall = telegramCall): Promise<{ok:true;message:string;link?:string}|{ok:false;error:string}> {
  if (!session || !canManageTelegram(session)) return {ok:false,error:'Configuration réservée aux administrateurs de votre organisation.'};
  try {
    const result = await db.transaction(async tx=>{
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`telegram:${session.orgId}`}))`);
      const [row] = await tx.select().from(settings).where(eq(settings.orgId,session.orgId)).for('update');
      const now = new Date();
      const needsNetwork = ['bot','pair','poll','manual','test'].includes(command.kind);
      if (needsNetwork && row?.lastCallAt && now.getTime()-row.lastCallAt.getTime()<3000) throw new ConfigurationError('Patientez trois secondes entre deux vérifications.');
      if (['bot','confirm','preferences'].includes(command.kind)) {
        await tx.update(deliveries).set({status:'cancelled'}).where(and(eq(deliveries.orgId,session.orgId),eq(deliveries.status,'pending')));
      }
      if (command.kind === 'disconnect') {
        await tx.delete(settings).where(eq(settings.orgId,session.orgId));
        await tx.update(deliveries).set({status:'cancelled',lastError:null}).where(and(eq(deliveries.orgId,session.orgId),eq(deliveries.status,'pending')));
        return {ok:true as const,message:'Bot déconnecté. Les alertes Telegram sont désactivées.'};
      }
      if (command.kind === 'bot') {
        const token = String(command.token ?? '').trim();
        const me = await call<{id:number;is_bot:boolean;first_name:string;username:string}>(token,'getMe');
        if (!me.is_bot || !Number.isSafeInteger(me.id) || !/^[A-Za-z0-9_]{5,32}$/.test(me.username)) throw new ConfigurationError('Identité du bot Telegram invalide.');
        const values = {botId:String(me.id),botName:me.first_name,botUsername:me.username,tokenEncrypted:encryptSecret(token),revision:randomUUID(),pending:null,chatId:null,chatLabel:null,testedAt:null,enabled:false,activatedAt:null,lastError:null,lastCallAt:now,updatedAt:now};
        await tx.insert(settings).values({orgId:session.orgId,...values}).onConflictDoUpdate({target:settings.orgId,set:values});
        return {ok:true as const,message:`Bot @${me.username} vérifié. Connectez maintenant votre conversation.`};
      }
      if (!row) throw new ConfigurationError('Vérifiez d’abord le token de votre bot.');
      const scope = eq(settings.orgId,session.orgId);
      if (command.kind === 'pair') {
        const info = await call<{url:string}>(decryptSecret(row.tokenEncrypted),'getWebhookInfo');
        if (info.url) throw new ConfigurationError('Ce bot possède déjà un webhook. Utilisez un bot dédié ou la configuration avancée ; le service existant est conservé.');
        const code = randomBytes(32).toString('base64url');
        await tx.update(settings).set({pending:{hash:hashPairCode(code),expires:new Date(now.getTime()+600000).toISOString(),userId:session.userId,offset:0},lastCallAt:now,updatedAt:now}).where(scope);
        return {ok:true as const,message:'Ouvrez votre bot, appuyez sur Démarrer puis recherchez votre conversation.',link:`https://t.me/${row.botUsername}?start=${code}`};
      }
      if (command.kind === 'poll') {
        const pending = row.pending;
        if (!pending || pending.userId !== session.userId || Date.parse(pending.expires)<=now.getTime()) throw new ConfigurationError('Lien absent ou expiré. Cliquez à nouveau sur Connecter mon Telegram.');
        const token = decryptSecret(row.tokenEncrypted);
        const info = await call<{url:string}>(token,'getWebhookInfo');
        if (info.url) throw new ConfigurationError('Un webhook utilise ce bot. La récupération automatique est interrompue sans modifier ce service.');
        const updates = await call<TelegramUpdate[]>(token,'getUpdates',{offset:pending.offset,limit:100,timeout:0,allowed_updates:['message']});
        const candidate = matchingPrivateChat(updates,pending.hash,new Date(pending.expires),new Date());
        const next = {...pending,offset:Math.max(pending.offset,...updates.map(u=>u.update_id+1)),...(candidate ? {candidate}: {})};
        await tx.update(settings).set({pending:next,lastCallAt:now,updatedAt:now}).where(scope);
        return {ok:true as const,message:candidate ? 'Conversation trouvée. Vérifiez le destinataire avant de confirmer.' : 'Pas encore de message de liaison. Appuyez sur Démarrer dans votre bot, puis réessayez.'};
      }
      if (command.kind === 'manual') {
        const chatId = String(command.chatId ?? '').trim();
        if (!/^[1-9]\d{4,19}$/.test(chatId)) throw new ConfigurationError('Indiquez le Chat ID numérique positif de votre conversation privée.');
        const chat = await call<{id:number;type:string;first_name?:string;last_name?:string;username?:string}>(decryptSecret(row.tokenEncrypted),'getChat',{chat_id:chatId});
        if (chat.type !== 'private' || String(chat.id)!==chatId) throw new ConfigurationError('Seules les conversations privées sont prises en charge.');
        await tx.update(settings).set({pending:{hash:hashPairCode(randomBytes(32).toString('base64url')),expires:new Date(now.getTime()+600000).toISOString(),userId:session.userId,offset:0,candidate:{id:chatId,label:[chat.first_name,chat.last_name].filter(Boolean).join(' ') || chat.username || chatId}},lastCallAt:now,updatedAt:now}).where(scope);
        return {ok:true as const,message:'Destinataire trouvé. Vérifiez-le puis confirmez.'};
      }
      if (command.kind === 'confirm') {
        const pending = row.pending;
        if (!pending?.candidate || pending.userId!==session.userId || Date.parse(pending.expires)<=now.getTime()) throw new ConfigurationError('Destinataire absent ou lien expiré. Recommencez la connexion.');
        await tx.update(settings).set({chatId:pending.candidate.id,chatLabel:pending.candidate.label,pending:null,testedAt:null,enabled:false,activatedAt:null,revision:randomUUID(),lastError:null,updatedAt:now}).where(scope);
        return {ok:true as const,message:'Conversation confirmée. Envoyez un test avant d’activer les alertes.'};
      }
      if (command.kind === 'test') {
        if (!row.chatId) throw new ConfigurationError('Confirmez d’abord votre conversation Telegram.');
        await call(decryptSecret(row.tokenEncrypted),'sendMessage',{chat_id:row.chatId,text:'✅ Test SafeLinkHub : votre bot est connecté. Vous pouvez maintenant activer les alertes FUP de votre organisation.'});
        await tx.update(settings).set({testedAt:now,lastCallAt:now,lastError:null,updatedAt:now}).where(scope);
        return {ok:true as const,message:'Message de test envoyé dans votre conversation privée.'};
      }
      if (command.kind === 'preferences') {
        if (typeof command.enabled !== 'boolean' || !Array.isArray(command.routerIds) || !command.preferences || typeof command.preferences!=='object') throw new ConfigurationError('Réglages invalides.');
        const owned = await tx.select({id:routers.id}).from(routers).where(eq(routers.orgId,session.orgId));
        const ids = command.enabled ? validateRouterSelection(command.routerIds,owned.map(r=>r.id)) : command.routerIds.filter(id=>owned.some(r=>r.id===id));
        const preferences = normalizeTelegramPreferences(command.preferences);
        if (command.enabled && (!row.chatId || !row.testedAt)) throw new ConfigurationError('Confirmez votre conversation et envoyez un test avant l’activation.');
        if (command.enabled && !Object.values(preferences).some(Boolean)) throw new ConfigurationError('Choisissez au moins une catégorie d’alertes.');
        await tx.update(settings).set({enabled:command.enabled,preferences,routerIds:ids,revision:randomUUID(),activatedAt:command.enabled ? now : null,lastError:null,updatedAt:now}).where(scope);
        return {ok:true as const,message:command.enabled ? 'Alertes activées pour les routeurs sélectionnés.' : 'Alertes désactivées.'};
      }
      throw new ConfigurationError('Action inconnue.');
    });
    return result;
  } catch (error) {
    // Known validation and Telegram errors are controlled strings. Database errors may echo ciphertext.
    const code = (error as {code?:string;cause?:{code?:string}})?.code ?? (error as {cause?:{code?:string}})?.cause?.code;
    if (code === '23505') return {ok:false,error:'Ce bot est déjà associé à une autre organisation. Créez un bot dédié.'};
    if (error instanceof TelegramError) return {ok:false,error:error.message};
    if (error instanceof ConfigurationError) return {ok:false,error:error.message};
    return {ok:false,error:'Impossible d’enregistrer cette configuration. Réessayez ou contactez le support.'};
  }
}
