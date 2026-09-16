"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Loader2, Split, X } from "lucide-react";
import { clearDualWanJobs, deleteDualWanJob, readDualWanJobs, removeDualWan, startDualWan } from "@/lib/mikrotik/dualwan-actions";
import { DUALWAN_DEFAULTS, type DualWanForm } from "@/lib/mikrotik/dualwan-defaults";

type Jobs = NonNullable<Awaited<ReturnType<typeof readDualWanJobs>>["jobs"]>;
type Job = Jobs[number];

const CAS_LABEL: Record<DualWanForm["cas"], string> = {
  cas1: "Standard + Mini (3:1)",
  cas2: "Standard × 2 (1:1)",
  cas3: "Mini × 2 (1:1)",
};

const STATUS_LABEL: Record<Job["status"], string> = {
  running: "En cours…",
  ok: "Appliqué",
  dry_run: "Simulation OK",
  error: "Échec",
  stale: "Sans réponse",
  removed: "Retirée",
};

const input = "mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg";

/** Reconstitue le formulaire depuis la demande mémorisée (snake_case du webhook). */
function formOf(r: Record<string, unknown>, dryRun: boolean): DualWanForm {
  return {
    mode: r.mode as DualWanForm["mode"],
    cas: r.cas as DualWanForm["cas"],
    lanInterface: String(r.lan_interface ?? ""),
    wan1Interface: String(r.wan1_interface ?? DUALWAN_DEFAULTS.wan1Interface),
    wan2Interface: String(r.wan2_interface ?? DUALWAN_DEFAULTS.wan2Interface),
    wan1Mbps: Number(r.wan1_mbps) > 0 ? Number(r.wan1_mbps) : "",
    wan2Mbps: Number(r.wan2_mbps) > 0 ? Number(r.wan2_mbps) : "",
    detachWan2FromBridge: r.detach_wan2_from_bridge === true,
    dryRun,
  };
}

function JobRow({ job, onApply, onRemove, busy }: { job: Job; onApply: (form: DualWanForm) => void; onRemove: () => void; busy: boolean }) {
  const d = job.result?.details ?? {};
  const applied = Array.isArray(d.applied) ? (d.applied as string[]) : [];
  const skipped = Array.isArray(d.skipped) ? (d.skipped as string[]) : [];
  const tone = job.status === "error" || job.status === "stale" ? "text-err" : job.status === "running" ? "text-ink-soft" : "text-ok";
  return (
    <li className="border border-line bg-clay p-3 rounded-lg text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-bold text-ink">
          {job.status === "removed"
            ? `retrait de la config dual WAN${job.request.return_to_bridge ? ` · WAN2 remis dans ${String(job.request.return_to_bridge)}` : ""}`
            : `${String(job.request.mode)} · ${CAS_LABEL[job.request.cas as DualWanForm["cas"]] ?? String(job.request.cas)}${job.request.dry_run ? " · simulation" : ""}`}
        </span>
        <span className="flex items-center gap-2">
          <span className={`font-bold ${tone}`}>{STATUS_LABEL[job.status]}</span>
          {job.status !== "running" && (
            <button type="button" onClick={onRemove} disabled={busy} aria-label="Retirer de l'historique" title="Retirer de l'historique" className="text-ink-soft hover:text-ink disabled:opacity-60">
              <X aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </span>
      </div>
      <p className="text-[11px] text-ink-soft">{new Date(job.at).toLocaleString("fr-FR")}</p>
      {job.status === "error" && (
        <p className="mt-1 text-err">
          {d.step ? `${d.step} : ` : ""}
          {d.message ?? (Array.isArray(d.failed) && d.failed.length ? `contrôles en échec : ${d.failed.join(", ")}` : "erreur inconnue")}
        </p>
      )}
      {job.status === "removed" && (
        <p className="mt-1 text-ink-soft">
          {Object.entries(d).filter(([, v]) => typeof v === "number").map(([k, v]) => `${k} ${v}`).join(" · ") || "rien à retirer"}
        </p>
      )}
      {job.status === "stale" && <p className="mt-1 text-ink-soft">n8n n&apos;a pas rappelé la plateforme — voir l&apos;exécution dans n8n.</p>}
      {(job.status === "ok" || job.status === "dry_run") && (
        <p className="mt-1 text-ink-soft">
          {applied.length} commande{applied.length > 1 ? "s" : ""} {job.status === "ok" ? `appliquée${applied.length > 1 ? "s" : ""}` : "à appliquer"}, {skipped.length} déjà en place
          {job.result?.backup_file ? ` · sauvegarde ${job.result.backup_file}` : ""}
        </p>
      )}
      {job.status === "dry_run" && applied.length > 0 && (
        <button
          type="button"
          onClick={() => onApply(formOf(job.request, false))}
          disabled={busy}
          className="mt-2 inline-flex items-center gap-2 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink rounded-lg hover:bg-clay disabled:opacity-60"
        >
          Appliquer ce plan ({applied.length} commande{applied.length > 1 ? "s" : ""})
        </button>
      )}
      {applied.length > 0 && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-ink-soft">Commandes</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-ink">{applied.join("\n")}</pre>
        </details>
      )}
    </li>
  );
}

/**
 * Dual WAN Starlink (PCC + failover) : la plateforme ne touche pas au
 * routeur, elle passe la commande au workflow n8n qui sauvegarde, applique
 * et rappelle. Simulation cochée par défaut : on lit le plan avant d'écrire.
 */
export default function DualWanPanel({ routerId }: { routerId: string }) {
  const [form, setForm] = useState<DualWanForm>(DUALWAN_DEFAULTS);
  const [jobs, setJobs] = useState<Jobs>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const refresh = useCallback(
    () =>
      readDualWanJobs(routerId).then((res) => {
        if (res.jobs) setJobs(res.jobs);
      }),
    [routerId],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const running = jobs.some((j) => j.status === "running");
  useEffect(() => {
    if (!running) return;
    const t = setInterval(refresh, 5000);
    return () => clearInterval(t);
  }, [running, refresh]);

  const set = <K extends keyof DualWanForm>(k: K, v: DualWanForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const launch = (f: DualWanForm = form) =>
    start(async () => {
      setMsg(null);
      const res = await startDualWan(routerId, f);
      if (res.error) setMsg({ ok: false, text: res.error });
      else setMsg({ ok: true, text: f.dryRun ? "Simulation lancée — le plan arrive dans un instant." : "Provisionnement lancé — sauvegarde, application, vérification." });
      await refresh();
    });

  // « Appliquer ce plan » : reprend les paramètres exacts de la simulation
  // (ce que l'écran affiche peut avoir été modifié depuis) et écrit pour de bon.
  const remove = (jobId: string) => start(async () => { await deleteDualWanJob(routerId, jobId); await refresh(); });
  const clearAll = () =>
    start(async () => {
      if (!window.confirm("Retirer tout l'historique terminé de ce routeur ?")) return;
      await clearDualWanJobs(routerId);
      await refresh();
    });

  const [removeBridge, setRemoveBridge] = useState(false);
  const removeConfig = () =>
    start(async () => {
      const bridge = removeBridge ? form.lanInterface.trim() : "";
      if (removeBridge && !bridge) return setMsg({ ok: false, text: "Indiquez l'interface LAN (bridge) pour y remettre le port WAN2." });
      if (!window.confirm(`Retirer la configuration dual WAN de ce routeur ? PCC, routes, tables, NAT WAN2, client DHCP WAN2 seront supprimés${bridge ? `, et ${form.wan2Interface} remis dans ${bridge}` : ""}. WAN1 reste en service.`)) return;
      setMsg(null);
      const res = await removeDualWan(routerId, { wan2Interface: form.wan2Interface, returnWan2ToBridge: bridge });
      if (res.error) setMsg({ ok: false, text: res.error });
      else setMsg({ ok: true, text: "Configuration dual WAN retirée — détail dans l'historique." });
      await refresh();
    });

  const applyPlan = (f: DualWanForm) => {
    if (!window.confirm("Appliquer ce plan sur le routeur ? Une sauvegarde /export est faite avant, mais le port WAN2 sera sorti du bridge si demandé.")) return;
    setForm(f);
    launch(f);
  };

  return (
    <section className="mt-6 border border-line bg-paper p-4 rounded-xl">
      <h3 className="flex items-center gap-2 text-base font-bold text-ink">
        <Split aria-hidden="true" className="h-5 w-5" /> Dual WAN Starlink (n8n)
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        Deux Starlink sur E1/E2 : répartition PCC selon les débits + bascule automatique. Le workflow n8n
        sauvegarde d&apos;abord (/export), n&apos;applique que ce qui manque (rejouable), puis vérifie. Nécessite un accès
        distant SSH actif sur ce routeur.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Mode</span>
          <select value={form.mode} onChange={(e) => set("mode", e.target.value as DualWanForm["mode"])} className={input}>
            <option value="complet">Complet — routeur neuf ou réinitialisé</option>
            <option value="complement">Complément — hotspot/UniWAN déjà en place</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Kits</span>
          <select value={form.cas} onChange={(e) => set("cas", e.target.value as DualWanForm["cas"])} className={input}>
            {(Object.keys(CAS_LABEL) as DualWanForm["cas"][]).map((c) => (
              <option key={c} value={c}>{CAS_LABEL[c]}</option>
            ))}
          </select>
        </label>
        <label className="block sm:col-span-2">
          <span className="text-xs font-bold text-ink-soft">Interface LAN (bridge du hotspot){form.mode === "complet" ? " — optionnel, sinon la liste LAN" : ""}</span>
          <input value={form.lanInterface} onChange={(e) => set("lanInterface", e.target.value)} placeholder="bridge-LAN, HOTSPOT…" className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Interface WAN1</span>
          <input value={form.wan1Interface} onChange={(e) => set("wan1Interface", e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Interface WAN2</span>
          <input value={form.wan2Interface} onChange={(e) => set("wan2Interface", e.target.value)} className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Débit WAN1 (Mbit/s)</span>
          <input type="number" min={1} value={form.wan1Mbps} onChange={(e) => set("wan1Mbps", e.target.value === "" ? "" : Number(e.target.value))} placeholder="selon le kit" className={input} />
        </label>
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Débit WAN2 (Mbit/s)</span>
          <input type="number" min={1} value={form.wan2Mbps} onChange={(e) => set("wan2Mbps", e.target.value === "" ? "" : Number(e.target.value))} placeholder="selon le kit" className={input} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input type="checkbox" checked={form.detachWan2FromBridge} onChange={(e) => set("detachWan2FromBridge", e.target.checked)} />
          Sortir le port WAN2 du bridge s&apos;il y est encore (ether2 d&apos;usine → renommé)
        </label>
        <label className="flex items-center gap-2 text-sm text-ink sm:col-span-2">
          <input type="checkbox" checked={form.dryRun} onChange={(e) => set("dryRun", e.target.checked)} />
          Simulation seulement (rien n&apos;est écrit sur le routeur)
        </label>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => launch()}
          disabled={pending || running}
          className="inline-flex items-center gap-2 bg-brand px-4 py-2 text-sm font-bold text-slate-deep rounded-lg disabled:opacity-60"
        >
          {pending || running ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : null}
          {form.dryRun ? "Simuler" : "Provisionner"}
        </button>
        {msg && <p className={`text-sm ${msg.ok ? "text-ok" : "text-err"}`}>{msg.text}</p>}
      </div>

      <details className="mt-4 border border-line bg-clay p-3 rounded-lg text-sm">
        <summary className="cursor-pointer font-bold text-ink">Retirer la configuration dual WAN</summary>
        <p className="mt-2 text-ink-soft">
          Défait ce que le workflow a posé (repéré par ses commentaires et marques, jamais par numéro) : PCC, marques de routage,
          sondes et routes, tables to-WAN*, liste d&apos;exclusion, NAT et client DHCP de WAN2, liste WAN. Le client DHCP WAN1 retrouve
          ses réglages, NAT WAN1, FastTrack et DNS restent. Rejouable sans doublon.
        </p>
        <label className="mt-2 flex items-center gap-2 text-ink">
          <input type="checkbox" checked={removeBridge} onChange={(e) => setRemoveBridge(e.target.checked)} />
          Remettre {form.wan2Interface || "WAN2"} dans le bridge LAN ({form.lanInterface.trim() || "interface LAN à renseigner ci-dessus"}) et lui rendre son nom d&apos;usine
        </label>
        <button
          type="button"
          onClick={removeConfig}
          disabled={pending || running}
          className="mt-3 inline-flex items-center gap-2 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-err rounded-lg hover:bg-clay disabled:opacity-60"
        >
          Retirer la configuration
        </button>
      </details>

      {jobs.length > 0 && (
        <>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs font-bold text-ink-soft">Historique</span>
            <button type="button" onClick={clearAll} disabled={pending} className="text-xs text-ink-soft underline hover:text-ink disabled:opacity-60">
              Vider l&apos;historique
            </button>
          </div>
          <ul className="mt-2 space-y-2">
            {jobs.map((j) => (
              <JobRow key={j.id} job={j} onApply={applyPlan} onRemove={() => remove(j.id)} busy={pending || running} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
