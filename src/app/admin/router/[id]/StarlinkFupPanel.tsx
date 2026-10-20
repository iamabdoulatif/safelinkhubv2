"use client";

import { useState, useTransition } from "react";
import { saveStarlinkFupLinks, reconcileStarlinkBaseline, setStarlinkFupActive, setStarlinkFupPooled } from "@/lib/mikrotik/regulation-actions";
import { calculateFupBudget, sameFupLinks, type FupLink, type FupLedger } from "@/lib/mikrotik/starlink-fup";
import { calculateFupPool } from "@/lib/mikrotik/starlink-fup-pool";
import { suggestedStarlinkLinks } from "@/lib/mikrotik/starlink-fup-presets";
import FupConfigurationHelp from "./FupConfigurationHelp";
import type { FupRuntime } from "@/lib/mikrotik/starlink-fup-router";

type Props = { routerId: string; links: FupLink[]; ledger: Record<string, FupLedger>; active: boolean; pooled?: boolean; runtime: FupRuntime | null; onSaved: () => Promise<void> };

export default function StarlinkFupPanel({ routerId, links: saved, ledger, active, pooled = false, runtime, onSaved }: Props) {
  const [links, setLinks] = useState<FupLink[]>(saved.length ? saved : suggestedStarlinkLinks(routerId));
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const [used, setUsed] = useState<Record<string, string>>({});
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const change = (id: string, patch: Partial<FupLink>) => setLinks(all => all.map(l => l.id === id ? { ...l, ...patch } : l));
  const run = (task: () => Promise<{ error?: string; ok?: true }>) => start(async () => {
    setMessage("");
    try {
      const result = await task();
      setMessage(result.error ?? "Réglage enregistré.");
      if (result.ok) await onSaved();
    } catch { setMessage("Enregistrement impossible. Vérifiez la connexion au routeur puis réessayez."); }
  });

  const pool = pooled ? calculateFupPool(saved, ledger, new Date()) : null;
  return <>
    <FupConfigurationHelp />
    <section className="mb-5 rounded-xl border border-line bg-paper p-4 sm:p-5" aria-label={pooled ? "FUP Starlink cumulé" : "FUP Starlink par liaison"}>
    <h3 className="text-base font-semibold text-ink">{pooled ? "FUP : enveloppe cumulée des Starlink" : "Budget Starlink par liaison"}</h3>
    <p className="mt-1 text-sm text-ink-soft">{active ? "FUP actif." : "FUP en observation."} Chaque abonnement conserve son propre quota et son cycle. Les dates de fin ci-dessous sont exclusives, à 00:00 UTC.</p>
    <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={pooled} disabled={pending || active || saved.length < 2} onChange={e => run(() => setStarlinkFupPooled(routerId, e.target.checked))} className="mt-1" /><span>Cumuler les quotas des liaisons pour réguler le site. En mode cumulé, plafond par adresse de 2M/2M, même en réserve ; débit réel soumis au plafond partagé.</span></label>
    {pool && <p className="mt-3 rounded-lg bg-clay p-3 text-sm font-medium">Enveloppe : {(pool.quotaGB/1000).toFixed(2)} To · {pool.usedGB === null ? "Rapprochement récent requis pour le solde." : `Utilisés : ${(pool.usedGB/1000).toFixed(2)} To · Restants : ${(pool.remainingGB!/1000).toFixed(2)} To.`}</p>}
    {active && saved.some(l=>!ledger[l.id]?.baselineConfirmed) && <p role="alert" className="mt-3 rounded-lg border border-line bg-clay p-3 text-sm text-ink">Compteur à rapprocher : après un redémarrage, le garde-fou local peut couper Internet même si le dernier plafond enregistré reste affiché. Rapprochez chaque relevé Starlink, ou passez en observation pour libérer le routeur.</p>}
    {runtime && <p className="mt-3 text-sm font-medium">{runtime.stopped ? "Quota de gestion épuisé : Internet suspendu, portail local conservé." : `Plafond partagé : ${(runtime.totalBps / 1e6).toFixed(2)} Mbit/s cumulés. ${runtime.pooled ? "Envoi/réception à parts égales ; 2M/2M par adresse, sans garantie simultanée." : `Répartition 20 % envoi / 80 % réception.${runtime.reserve ? " Réserve : 128/256 kbit/s par adresse." : ""}`}`}</p>}
    <p className="mt-2 text-sm text-ink-soft">{pooled ? "Le solde et le seuil de réserve sont calculés sur la somme des abonnements. Un seul kit en réserve n’abaisse plus les profils. Le budget est étalé jusqu’au prochain changement de cycle à confirmer ; les périodes de 7, 14, 21 et 28 jours sont bornées par cette échéance. Cette enveloppe SaaS ne transfère pas les droits de données entre contrats Starlink." : "Le plafond commun protège la liaison la plus contrainte, y compris en cas de basculement."} Le garde-fou vérifie le volume toutes les 5 secondes. Après redémarrage ou fin de cycle d’une liaison, un rapprochement est requis avant reprise, sans recréditer automatiquement tous les abonnements.</p>
    <details className="mt-3 rounded-lg border border-line p-3"><summary className="cursor-pointer font-medium">Comment le volume tient jusqu’à la fin du cycle</summary><p className="mt-2 text-sm">Budget quotidien = données encore disponibles ÷ durée restante du cycle. Les données déjà utilisées sont déduites ; il n’y a aucun nouveau crédit automatique. Le plafond réseau conserve une marge de 20 %. Si les cycles diffèrent, le cumul est réparti jusqu’au prochain changement de cycle.</p>
    {pooled ? <p className="mt-2 text-sm">Budget cumulé : {pool?.dailyBudgetGB==null?"rapprochement récent requis":`${pool.dailyBudgetGB.toFixed(2)} Go/jour jusqu’au ${pool.endsAt?.slice(0,10)} (borne exclusive)`}.</p> : saved.map(l=>{const b=calculateFupBudget(l,ledger[l.id]??null,new Date());return <p key={l.id} className="mt-2 text-sm">{l.name} : {b.dailyBudgetGB==null?"rapprochement récent requis":`${b.dailyBudgetGB.toFixed(2)} Go/jour`}.</p>;})}
    <p className="mt-2 text-sm">Exemple du 11 novembre au 11 décembre à 00h UTC : 30 jours. Sans consommation, 5 To donnent 166,67 Go/jour ; 10 To donnent 333,33 Go/jour. Avec 1 To consommé et 20 jours restants : (5 − 1) To ÷ 20 = 200 Go/jour avant réserve et marge. Les vidéos utilisent aussi ce budget.</p></details>
    {saved.length > 0 && <button type="button" className="btn btn-sm btn-secondary mt-3" disabled={pending} onClick={() => run(() => setStarlinkFupActive(routerId, !active))}>{pending ? "Application en cours…" : active ? "Désactiver le FUP et libérer le routeur" : "Activer le FUP"}</button>}
    {pending ? <p role="status" className="mt-3 text-sm">Vérification en cours…</p> : message && <p role="status" className="mt-3 text-sm">{message}</p>}
    {links.map(link => <fieldset key={link.id} disabled={pending} className="mt-4 grid gap-3 rounded-lg border border-line p-3 sm:grid-cols-2">
      <legend className="px-1 font-medium">{link.name}</legend>
      <label>Nom<input className="field mt-1" value={link.name} onChange={e => change(link.id, { name: e.target.value })} /></label>
      <label>Interface WAN<input className="field mt-1" value={link.interface} onChange={e => change(link.id, { interface: e.target.value })} /></label>
      <label>Quota total (Go décimaux)<input type="number" min="1" className="field mt-1" value={link.quotaGB} onChange={e => change(link.id, { quotaGB: Number(e.target.value) })} /></label>
      <label>Réserve incluse (Go)<input type="number" min="0" className="field mt-1" value={link.reserveGB} onChange={e => change(link.id, { reserveGB: Number(e.target.value) })} /></label>
      <label>Début du cycle UTC<input type="date" className="field mt-1" value={link.cycleStart.slice(0, 10)} onChange={e => change(link.id, { cycleStart: e.target.value ? `${e.target.value}T00:00:00.000Z` : "" })} /></label>
      <label>Début du cycle suivant UTC<input type="date" className="field mt-1" value={link.cycleEnd.slice(0, 10)} onChange={e => change(link.id, { cycleEnd: e.target.value ? `${e.target.value}T00:00:00.000Z` : "" })} /></label>
      <label className="sm:col-span-2"><input type="checkbox" checked={link.cycleConfirmed} onChange={e => change(link.id, { cycleConfirmed: e.target.checked })} /> Ces dates sont celles du cycle de données indiqué par Starlink.</label>
      {saved.some(l => l.id === link.id) && <div className="space-y-2 border-t border-line pt-3 sm:col-span-2">
        <p className="text-sm text-ink-soft">{ledger[link.id]?.baselineConfirmed ? `Dernier cumul estimé : ${(ledger[link.id].cycleUsedBytes / 1e9).toFixed(2)} Go, relevé du ${new Date(ledger[link.id].at).toLocaleString("fr-FR", { timeZone: "UTC" })} UTC.` : "Référence de consommation à confirmer. Aucun budget utilisable pour une limitation."}</p>
        <label>Consommation actuelle affichée par Starlink (Go)<input type="number" min="0" step="0.01" className="field mt-1" value={used[link.id] ?? ""} onChange={e => { setUsed(v => ({ ...v, [link.id]: e.target.value })); setConfirmed(v => ({ ...v, [link.id]: false })); }} /></label>
        <label className="block text-sm"><input type="checkbox" checked={confirmed[link.id] ?? false} onChange={e => setConfirmed(v => ({ ...v, [link.id]: e.target.checked }))} /> Je viens de vérifier ce relevé dans le compte Starlink de cette liaison.</label>
        <button type="button" className="btn btn-sm btn-secondary" disabled={pending || !confirmed[link.id] || !used[link.id] || !sameFupLinks(saved, links)} onClick={() => run(() => reconcileStarlinkBaseline(routerId, link.id, Number(used[link.id]), new Date().toISOString()))}>Rapprocher le compteur avec Starlink</button>
        <p className="text-xs text-ink-soft">Le cumul MikroTik est une estimation entre deux rapprochements ; le relevé Starlink peut être différé. Une nouvelle vérification est nécessaire après un redémarrage ou un changement de cycle.</p>
      </div>}
    </fieldset>)}
    <div className="mt-4 flex flex-wrap gap-2">
      <button type="button" className="btn btn-sm btn-outline" disabled={active || pending || links.length >= 8} onClick={() => setLinks(all => [...all, { id: `wan-${Date.now()}`, name: `Starlink ${all.length + 1}`, interface: "", quotaGB: 5000, reserveGB: 500, cycleStart: "", cycleEnd: "", cycleConfirmed: false }])}>Ajouter une liaison</button>
      <button type="button" className="btn btn-sm btn-secondary" disabled={active || pending || !links.length} onClick={() => run(() => saveStarlinkFupLinks(routerId, links))}>Enregistrer en observation</button>
    </div>
  </section></>;
}
