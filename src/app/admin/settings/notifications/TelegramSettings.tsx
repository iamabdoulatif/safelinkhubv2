'use client';

import { useState, useTransition } from 'react';
import { Check, ExternalLink, Send, ShieldCheck } from 'lucide-react';
import { configureTelegram, getTelegramSettings, type TelegramCommand } from '@/lib/notifications/telegram-actions';
import type { TelegramPreferences } from '@/lib/notifications/telegram';

type View = NonNullable<Awaited<ReturnType<typeof getTelegramSettings>>>;
const choices: {key:keyof TelegramPreferences;label:string;detail:string}[] = [
  {key:'changes',label:'Changements de niveau FUP',detail:'Lissage, passage en réserve ou suspension appliqués par SafeLinkHub.'},
  {key:'quota',label:'Alertes de consommation',detail:'Réserve atteinte ou quota de gestion épuisé, selon les relevés confirmés.'},
  {key:'releases',label:'Levée des limitations',detail:'Confirmation que SafeLinkHub a retiré ses limites FUP.'},
  {key:'daily',label:'Bilan quotidien à partir de 07 h UTC',detail:'Un récapitulatif par routeur, envoyé au prochain passage de surveillance.'},
];
const statusLabels: Record<string,string> = {pending:'En attente',sent:'Envoyé',failed:'Échec',cancelled:'Annulé'};
const field = 'w-full rounded-lg border border-line bg-paper px-3 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand-deep/30';

export default function TelegramSettings({initial}:{initial:View}) {
  const [view,setView] = useState(initial);
  const [token,setToken] = useState('');
  const [manualId,setManualId] = useState('');
  const [link,setLink] = useState<string|null>(null);
  const [notice,setNotice] = useState<{error:boolean;text:string}|null>(null);
  const [busy,startTransition] = useTransition();
  const [preferences,setPreferences] = useState<TelegramPreferences>(initial.bot?.preferences ?? {changes:true,quota:true,releases:true,daily:false});
  const [selected,setSelected] = useState<string[]>(initial.bot?.routerIds ?? initial.routers.map(r=>r.id));
  const [dedicated,setDedicated] = useState(false);
  const bot = view.bot;
  const run = (command:TelegramCommand) => startTransition(async()=>{
    setNotice(null);
    try {
      const result = await configureTelegram(command);
      if (!result.ok) { setNotice({error:true,text:result.error}); return; }
      setNotice({error:false,text:result.message});
      if (command.kind === 'bot') { setToken(''); setLink(null); }
      if (result.link) setLink(result.link);
      if (['confirm','disconnect'].includes(command.kind)) setLink(null);
      const refreshed = await getTelegramSettings();
      if (refreshed) setView(refreshed);
    } catch { setNotice({error:true,text:'La connexion a été interrompue. Réessayez dans quelques instants.'}); }
  });
  return <div className="mx-auto max-w-4xl space-y-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="mb-1 text-xs font-semibold uppercase tracking-widest text-ink-soft">Notifications de votre organisation</p><h1 className="text-2xl font-semibold tracking-tight text-ink">Votre bot Telegram</h1><p className="mt-2 max-w-xl text-sm leading-6 text-ink-soft">Recevez vos alertes FUP dans votre conversation privée. Connectez votre bot une fois, puis choisissez les routeurs à suivre.</p></div>
      <span className={`rounded-full px-3 py-1.5 text-xs font-semibold ${bot?.enabled ? 'bg-ok-soft text-ok':'bg-clay text-ink-soft'}`}>{bot?.enabled ? 'Alertes actives':bot?.chatId ? 'Conversation connectée':bot ? 'Bot vérifié':'À configurer'}</span>
    </header>
    <div className="flex items-start gap-2 rounded-xl border border-line bg-clay/60 p-4 text-xs leading-5 text-ink-soft"><ShieldCheck aria-hidden className="mt-0.5 h-4 w-4 shrink-0"/><p>Votre token est chiffré et n’est jamais réaffiché. Les alertes concernent uniquement les routeurs sélectionnés de votre organisation. Vous n’avez rien à configurer dans n8n.</p></div>
    {notice && <p role={notice.error ? 'alert':'status'} aria-live="polite" className={`rounded-xl border p-4 text-sm ${notice.error ? 'border-err/20 bg-err-soft text-err':'border-line bg-ok-soft text-ok'}`}>{notice.text}</p>}
    {bot?.error && <p role="alert" className="rounded-xl bg-err-soft p-4 text-sm text-err">Dernier problème d’envoi : {bot.error}</p>}
    <section className="rounded-xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="bot-heading">
      <Step n="1" title="Créer et vérifier votre bot" id="bot-heading" done={!!bot}/>
      <p className="mt-3 text-sm leading-6 text-ink-soft">Dans <a className="font-medium text-brand-deep underline" href="https://t.me/BotFather" target="_blank" rel="noreferrer">BotFather officiel</a>, envoyez <code>/newbot</code>, choisissez le nom et le nom d’utilisateur, puis copiez le token ici.</p>
      {bot && <p className="mt-3 rounded-lg bg-clay px-3 py-2 text-sm text-ink"><strong>{bot.name}</strong> <span className="text-ink-soft">@{bot.username}</span></p>}
      <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={e=>{e.preventDefault();run({kind:'bot',token});}}>
        <div className="min-w-0 flex-1 basis-60"><label htmlFor="telegram-token" className="mb-1.5 block text-xs font-medium text-ink">{bot ? 'Remplacer le token (facultatif)':'Token fourni par BotFather'}</label><input id="telegram-token" type="password" autoComplete="new-password" spellCheck={false} value={token} onChange={e=>setToken(e.target.value)} required maxLength={130} className={field} placeholder="Collez votre token" aria-describedby="token-help"/></div>
        <button disabled={busy || !token.trim()} className="btn btn-primary disabled:opacity-50">{busy ? 'Vérification…':bot ? 'Remplacer et vérifier':'Vérifier mon bot'}</button>
      </form><p id="token-help" className="mt-2 text-xs leading-5 text-ink-soft">Le nom sera rempli automatiquement. Remplacer le token désactive les alertes jusqu’à une nouvelle connexion et un test.</p>
    </section>
    <section className="rounded-xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="chat-heading">
      <Step n="2" title="Connecter votre conversation" id="chat-heading" done={!!bot?.chatId}/>
      <p className="mt-3 text-sm leading-6 text-ink-soft">Ouvrez votre bot depuis le lien personnel, appuyez sur <strong>Démarrer</strong>, puis revenez ici. Votre Chat ID sera récupéré automatiquement.</p>
      <label className="mt-4 flex items-start gap-2 text-xs leading-5 text-ink-soft"><input className="mt-1 h-4 w-4 shrink-0 accent-current" type="checkbox" checked={dedicated} onChange={e=>setDedicated(e.target.checked)}/>J’utilise un bot dédié à ces notifications. La connexion automatique lit ses messages de liaison ; un bot déjà utilisé par un autre service doit passer par la configuration avancée.</label>
      <div className="mt-4 flex flex-wrap gap-2"><button type="button" className="btn btn-outline disabled:opacity-50" disabled={busy || !bot || !dedicated} onClick={()=>run({kind:'pair'})}>Connecter mon Telegram</button>{link && <a href={link} target="_blank" rel="noreferrer" className="btn btn-primary">Ouvrir mon bot <ExternalLink aria-hidden className="h-3.5 w-3.5"/></a>}{bot?.pending && <button type="button" className="btn btn-outline disabled:opacity-50" disabled={busy} onClick={()=>run({kind:'poll'})}>J’ai appuyé sur Démarrer — rechercher</button>}</div>
      {bot?.pending && <p className="mt-2 text-xs text-ink-soft">Liaison valable jusqu’à {new Date(bot.pending.expires).toLocaleTimeString('fr-FR',{timeZone:'UTC',hour:'2-digit',minute:'2-digit'})} UTC. Si le lien a été perdu ou a expiré, cliquez sur Connecter mon Telegram pour le renouveler.</p>}
      {bot?.pending?.candidate && <div className="mt-4 rounded-lg border border-line bg-clay p-4"><p className="text-sm font-semibold text-ink">Est-ce bien votre conversation ?</p><p className="mt-1 text-sm text-ink-soft">{bot.pending.candidate.label} · Chat ID {bot.pending.candidate.id}</p><button className="btn btn-primary mt-3 disabled:opacity-50" disabled={busy} onClick={()=>run({kind:'confirm'})}>Confirmer ce destinataire</button></div>}
      {bot?.chatId && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-ok-soft p-4"><div className="text-sm text-ink"><p className="font-semibold">{bot.chatLabel}</p><p className="mt-0.5 text-xs text-ink-soft">Conversation privée · Chat ID {bot.chatId}</p></div><button type="button" disabled={busy} onClick={()=>run({kind:'test'})} className="btn btn-outline disabled:opacity-50"><Send aria-hidden className="h-3.5 w-3.5"/>Envoyer un test</button></div>}
      <details className="mt-5 border-t border-line-soft pt-4 text-sm"><summary className="cursor-pointer font-medium text-ink">Configuration avancée : saisir mon Chat ID</summary><p className="mt-3 text-xs leading-5 text-ink-soft">Pour une conversation privée déjà connue du bot, saisissez son identifiant numérique positif. Le destinataire sera affiché avant confirmation. Aucun webhook existant ne sera supprimé.</p><form className="mt-3 flex flex-wrap gap-2" onSubmit={e=>{e.preventDefault();run({kind:'manual',chatId:manualId});}}><label htmlFor="manual-chat" className="sr-only">Chat ID privé</label><input id="manual-chat" inputMode="numeric" value={manualId} onChange={e=>setManualId(e.target.value)} className={`${field} max-w-xs`} placeholder="Exemple : 123456789" required/><button className="btn btn-outline disabled:opacity-50" disabled={busy || !bot}>Vérifier le destinataire</button></form></details>
    </section>
    <section className="rounded-xl border border-line bg-paper p-5 sm:p-6" aria-labelledby="alerts-heading">
      <Step n="3" title="Choisir vos alertes" id="alerts-heading" done={!!bot?.enabled}/>
      <fieldset disabled={busy} className="mt-5 space-y-4"><legend className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-soft">Événements à recevoir</legend>{choices.map(choice=><label key={choice.key} className="flex items-start gap-3"><input type="checkbox" checked={preferences[choice.key]} onChange={e=>setPreferences({...preferences,[choice.key]:e.target.checked})} className="mt-1 h-4 w-4 shrink-0 accent-current"/><span><span className="block text-sm font-medium text-ink">{choice.label}</span><span className="mt-0.5 block text-xs leading-5 text-ink-soft">{choice.detail}</span></span></label>)}</fieldset>
      <fieldset disabled={busy} className="mt-6 border-t border-line-soft pt-4"><legend className="px-1 text-xs font-semibold uppercase tracking-wider text-ink-soft">Routeurs de votre organisation</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">{view.routers.map(router=><label key={router.id} className="flex items-center gap-2 text-sm text-ink"><input type="checkbox" checked={selected.includes(router.id)} onChange={e=>setSelected(e.target.checked ? [...selected,router.id] : selected.filter(id=>id!==router.id))} className="h-4 w-4 accent-current"/>{router.name}</label>)}</div>{!view.routers.length && <p className="mt-2 text-sm text-ink-soft">Ajoutez d’abord un routeur à votre organisation.</p>}</fieldset>
      {!bot?.tested && <p className="mt-5 text-xs text-ink-soft">Confirmez votre conversation et envoyez un test pour pouvoir activer les alertes.</p>}
      <div className="mt-5 flex flex-wrap gap-2"><button type="button" className="btn btn-primary disabled:opacity-50" disabled={busy || !bot?.tested || !selected.length} onClick={()=>run({kind:'preferences',enabled:true,preferences,routerIds:selected})}>{bot?.enabled ? 'Enregistrer mes préférences':'Activer les alertes'}</button>{bot?.enabled && <button type="button" className="btn btn-outline disabled:opacity-50" disabled={busy} onClick={()=>run({kind:'preferences',enabled:false,preferences,routerIds:selected})}>Désactiver les alertes</button>}</div>
      <p className="mt-3 text-xs leading-5 text-ink-soft">Surveillance toutes les 5 minutes. Les estimations de consommation dépendent de relevés confirmés. Cette connexion ne modifie pas les limites de vos routeurs.</p>
    </section>
    <details className="rounded-xl border border-line bg-clay/40 p-5" open={!bot}><summary className="cursor-pointer font-semibold text-ink">Guide pas à pas et dépannage</summary><ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-ink-soft"><li>Ouvrez <a href="https://t.me/BotFather" target="_blank" rel="noreferrer" className="text-brand-deep underline">@BotFather</a> et envoyez <code>/newbot</code>.</li><li>Choisissez un nom et un nom d’utilisateur terminé par <code>bot</code>. Copiez uniquement le token dans le champ sécurisé ci-dessus.</li><li>Vérifiez le bot, ouvrez le lien de connexion puis appuyez sur Démarrer dans Telegram.</li><li>Revenez ici, recherchez votre conversation, confirmez le destinataire et envoyez un test.</li><li>Sélectionnez vos routeurs et vos alertes, puis activez-les.</li></ol><dl className="mt-5 space-y-3 text-xs leading-5 text-ink-soft"><div><dt className="font-semibold text-ink">Le token est refusé</dt><dd>Recopiez-le depuis BotFather. Ne le publiez pas et ne le communiquez pas au support.</dd></div><div><dt className="font-semibold text-ink">Ma conversation n’apparaît pas</dt><dd>Utilisez le lien généré par cette page et appuyez sur Démarrer. Un simple message « bonjour » ne suffit pas. Renouvelez le lien s’il a expiré.</dd></div><div><dt className="font-semibold text-ink">Mon bot a déjà un webhook</dt><dd>Créez un bot dédié ou utilisez la saisie avancée du Chat ID pour préserver votre intégration existante.</dd></div><div><dt className="font-semibold text-ink">Le bot ne peut plus m’écrire</dt><dd>Débloquez-le dans Telegram et envoyez un nouveau test. Si les alertes ont été désactivées après une erreur, réactivez-les ici.</dd></div></dl><a className="mt-5 inline-block text-sm font-medium text-brand-deep underline" href="/guides/telegram-notifications.html" target="_blank" rel="noreferrer">Ouvrir le guide imprimable / enregistrer en PDF</a></details>
    <section className="rounded-xl border border-line bg-paper p-5"><h2 className="font-semibold text-ink">Derniers envois</h2>{!view.history.length ? <p className="mt-2 text-sm text-ink-soft">Les alertes envoyées apparaîtront ici après activation. Les tests de connexion ne figurent pas dans cet historique.</p>:<ul className="mt-3 divide-y divide-line-soft">{view.history.map(item=><li key={item.id} className="py-3 text-xs text-ink-soft"><div className="flex flex-wrap justify-between gap-2"><span className="font-medium text-ink">{statusLabels[item.status] ?? item.status}</span><time dateTime={item.at}>{new Date(item.at).toLocaleString('fr-FR',{timeZone:'UTC'})} UTC</time></div><p>{item.attempts} tentative(s){item.error ? ` · ${item.error}`:''}</p></li>)}</ul>}<button type="button" className="btn btn-sm btn-outline mt-4 disabled:opacity-50" disabled={busy} onClick={()=>startTransition(async()=>{try{const refreshed=await getTelegramSettings();if(refreshed)setView(refreshed);}catch{setNotice({error:true,text:'Impossible d’actualiser pour le moment.'});}})}>Actualiser l’état</button></section>
    {bot && <details className="text-sm text-ink-soft"><summary className="cursor-pointer">Déconnecter ce bot</summary><p className="mt-2 text-xs leading-5">Le token sera supprimé de SafeLinkHub, les alertes arrêtées et les envois en attente annulés. Le bot restera dans votre compte Telegram.</p><button type="button" className="btn btn-outline mt-3 disabled:opacity-50" disabled={busy} onClick={()=>run({kind:'disconnect'})}>Confirmer la déconnexion</button></details>}
  </div>;
}
function Step({n,title,id,done}:{n:string;title:string;id:string;done:boolean}) {
  return <div className="flex items-center gap-3"><span aria-hidden className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? 'bg-ok-soft text-ok':'bg-slate-deep text-white'}`}>{done ? <Check className="h-4 w-4"/>:n}</span><h2 id={id} className="text-base font-semibold text-ink">{title}</h2></div>;
}
