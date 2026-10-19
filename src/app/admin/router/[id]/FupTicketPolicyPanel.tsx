"use client";
import {useState,useTransition} from 'react';
import {saveFupTicketPolicy} from '@/lib/mikrotik/regulation-actions';
import {DEFAULT_TICKET_POLICY,type TicketPolicy,type TicketStates} from '@/lib/mikrotik/fup-ticket-policy';
export default function FupTicketPolicyPanel({routerId,policy,state,onSaved}:{routerId:string;policy:TicketPolicy;state:TicketStates;onSaved:()=>Promise<void>}){
 const [form,setForm]=useState(policy??DEFAULT_TICKET_POLICY),[message,setMessage]=useState(''),[pending,start]=useTransition();
 const fields=[['thresholdMB','Volume reçu déclenchant le bridage (Mo)'],['throttleKbps','Débit bridé en envoi et réception (kbit/s)'],['persistenceMinutes','Persistance au débit bridé avant blocage (minutes)']] as const;
 return <section className="mb-5 rounded-xl border border-line bg-paper p-5" aria-label="Usage intensif par ticket">
  <h3 className="font-semibold">Usage intensif : bridage puis blocage 5 heures</h3>
  <p className="mt-2 text-sm text-ink-soft">Ce contrôle porte sur le volume et le débit, sans distinguer une vidéo d’un téléchargement. La coupure complète interdit aussi YouTube et TikTok. Le quota partagé reste prioritaire sur tout débit par ticket.</p>
  <p className="mt-2 text-sm"><a className="underline" href="/guides/configurer-fup.html#tickets" target="_blank" rel="noreferrer">Lire le guide des sanctions et du prorata</a></p>
  <label className="mt-4 flex items-center gap-2"><input type="checkbox" checked={form.enabled} onChange={e=>setForm({...form,enabled:e.target.checked})}/>Activer les sanctions progressives pour cette zone</label>
  <div className="mt-4 grid gap-3 sm:grid-cols-2">{fields.map(([key,label])=><label key={key}>{label}<input className="field mt-1" type="number" min="1" value={form[key]} onChange={e=>setForm({...form,[key]:Number(e.target.value)})}/></label>)}
   <label>Fenêtre de mesure<select className="field mt-1" value={form.windowMinutes} onChange={e=>setForm({...form,windowMinutes:Number(e.target.value)})}>{[5,10,15,30,60].map(n=><option key={n} value={n}>{n} minutes</option>)}</select></label>
  </div>
  <p className="mt-3 text-sm">Après le premier dépassement : bridage temporaire (maximum 5 h). Si le ticket maintient au moins 80 % du débit bridé pendant la durée choisie : coupure complète 5 h, non prolongée à chaque contrôle. Une reconnexion conserve la sanction. Un relevé manquant ou une remise à zéro ne compte pas comme une insistance.</p>
  <p className="mt-2 text-xs text-ink-soft">Comptes HotSpot locaux uniquement. Les tickets déjà désactivés ne sont pas repris. Évitez de modifier un ticket suspendu pendant sa sanction ; sa récupération locale vérifie son identité et son commentaire d’origine. Les comptes RADIUS externes ne sont pas sanctionnés par ce mécanisme.</p>
  <button className="btn btn-secondary btn-sm mt-4" disabled={pending} onClick={()=>start(async()=>{try{const r=await saveFupTicketPolicy(routerId,form);setMessage(r.error??'Paramètres enregistrés. Application au prochain passage FUP actif (≤ 5 min).');if(r.ok)await onSaved();}catch{setMessage('Enregistrement ou libération incomplet : vérifiez le routeur.');}})}>Enregistrer les sanctions</button>
  <p role="status" className="mt-2 text-sm">{pending?'Enregistrement…':message}</p>
  <div className="mt-3 space-y-1 text-sm">{Object.entries(state).filter(([,s])=>s.phase!=='normal').map(([user,s])=><p key={user}>{user} · {s.phase==='blocked'?'Bloqué':'Bridé'} · fin {new Date(s.until).toLocaleString('fr-FR',{timeZone:'UTC'})} UTC</p>)}</div>
 </section>;
}
