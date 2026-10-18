import { createHash } from 'node:crypto';
import { calculateFupPool } from '@/lib/mikrotik/starlink-fup-pool';
import { calculateFupBudget, type FupLink, type FupLedger } from '@/lib/mikrotik/starlink-fup';

export type TelegramPreferences = { changes: boolean; quota: boolean; releases: boolean; daily: boolean };
export type TelegramChat = { id: string; label: string };
export type TelegramPending = { hash: string; expires: string; userId: string; offset: number; candidate?: TelegramChat };
export type TelegramUpdate = { update_id: number; message?: { text?: string; chat: { id: number; type: string; first_name?: string; last_name?: string; username?: string }; from?: { id: number; is_bot?: boolean } } };
export const hashPairCode = (code: string) => createHash('sha256').update(code).digest('hex');
export function canManageTelegram(session: { orgId: string; userId: string; role: string } | null): boolean {
  return !!session?.orgId && !!session.userId && ['admin','superadmin'].includes(session.role);
}
export function normalizeTelegramPreferences(value: Partial<Record<keyof TelegramPreferences, unknown>>): TelegramPreferences {
  return { changes: value.changes === true, quota: value.quota === true, releases: value.releases === true, daily: value.daily === true };
}
export function validateRouterSelection(ids: string[], owned: string[]): string[] {
  const unique = [...new Set(ids)];
  if (!unique.length || unique.length > 200) throw new Error('Sélectionnez entre 1 et 200 routeurs.');
  if (unique.some(id => !owned.includes(id))) throw new Error('Un routeur ne fait pas partie de votre organisation.');
  return unique;
}
export function matchingPrivateChat(updates: TelegramUpdate[], hash: string, expires: Date, now = new Date()): TelegramChat | null {
  if (!Number.isFinite(expires.getTime()) || expires <= now) return null;
  for (const update of updates) {
    const m = update.message;
    if (!m || m.chat.type !== 'private' || !m.from || m.from.is_bot || m.from.id !== m.chat.id || !Number.isSafeInteger(m.chat.id) || m.chat.id <= 0) continue;
    const code = /^\/start ([A-Za-z0-9_-]{32,64})$/.exec(m.text ?? '')?.[1];
    if (code && hashPairCode(code) === hash) return { id: String(m.chat.id), label: [m.chat.first_name,m.chat.last_name].filter(Boolean).join(' ') || (m.chat.username ? `@${m.chat.username}` : String(m.chat.id)) };
  }
  return null;
}
export class TelegramError extends Error {
  constructor(message: string, public permanent = false, public retryAfter = 0) { super(message); }
}
/** Fixed host/method allowlist; never propagate upstream descriptions (may contain secrets). */
export async function telegramCall<T>(token: string, method: 'getMe'|'getWebhookInfo'|'getUpdates'|'getChat'|'sendMessage', body: Record<string, unknown> = {}, fetcher = fetch): Promise<T> {
  if (!/^\d{5,20}:[A-Za-z0-9_-]{25,100}$/.test(token)) throw new TelegramError('Token Telegram invalide.',true);
  let response: Response;
  try { response = await fetcher(`https://api.telegram.org/bot${token}/${method}`, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body), cache:'no-store', signal:AbortSignal.timeout(8000) }); }
  catch { throw new TelegramError('Telegram est temporairement injoignable. Réessayez.'); }
  const data = await response.json().catch(()=>null);
  if (!response.ok || !data?.ok) {
    const code = data?.error_code ?? response.status;
    if (code === 401) throw new TelegramError('Token Telegram refusé. Remplacez-le depuis BotFather.',true);
    if (code === 403) throw new TelegramError('Le bot est bloqué ou ne peut pas écrire à ce destinataire.',true);
    if (code === 409) throw new TelegramError('Ce bot est utilisé par un autre service. Utilisez un bot dédié.',true);
    if (code === 400) throw new TelegramError('Conversation inaccessible. Ouvrez votre bot et appuyez sur Démarrer.',true);
    throw new TelegramError('Envoi Telegram temporairement indisponible.',false,Math.min(86400,Math.max(0,Number(data?.parameters?.retry_after)||0)));
  }
  return data.result as T;
}
export function quotaNotices(links: FupLink[], ledger: Record<string,FupLedger>, now: Date, pooled = false) {
  if (pooled) {
    const pool=calculateFupPool(links,ledger,now);
    return pool.phase === "reserve" || pool.phase === "exhausted" ? [{key:`pool:${links.map(l=>`${l.id}:${l.cycleStart}`).join("|")}:${pool.phase}`,level:pool.phase,text:`Enveloppe cumulée ${(pool.quotaGB/1000).toFixed(2)} To : ${pool.phase === "exhausted" ? "quota de gestion épuisé" : `réserve atteinte, ${pool.remainingGB!.toFixed(1)} Go restants`}. Estimation SafeLinkHub.`}] : [];
  }
  return links.flatMap(link => {
    const budget = calculateFupBudget(link,ledger[link.id] ?? null,now);
    if (budget.phase !== 'reserve' && budget.phase !== 'exhausted') return [];
    return [{key:`${link.id}:${link.cycleStart}:${budget.phase}`,level:budget.phase,text:`${link.name} : ${budget.phase === 'exhausted' ? 'quota de gestion épuisé' : `réserve atteinte, ${budget.remainingGB!.toFixed(1)} Go restants`}. Estimation SafeLinkHub à rapprocher du relevé Starlink.`}];
  });
}
export function fupEventNotice(kind: string, payload: unknown, routerName: string, preferences: TelegramPreferences): string | null {
  if (kind === 'fup_released' && preferences.releases) return `${routerName} : les limitations FUP ont été levées par SafeLinkHub. Cela ne confirme pas une remise à zéro du quota Starlink.`;
  if (kind !== 'fup_enforcement' || !preferences.changes) return null;
  const text = (payload as {telegram?:unknown} | null)?.telegram;
  return typeof text === 'string' ? text.slice(0,2000) : `${routerName} : le niveau de limitation FUP a changé.`;
}
