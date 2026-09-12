"use client";

import { useEffect, useState, useTransition } from "react";
import { Bot, Loader2 } from "lucide-react";
import { readRouterRegulation, saveRouterRegulation } from "@/lib/mikrotik/regulation-actions";
import { REGULATION_DEFAULTS, type RegulationForm } from "@/lib/mikrotik/regulation-defaults";

type View = Awaited<ReturnType<typeof readRouterRegulation>>;

const DECISION_LABEL: Record<string, string> = {
  ok: "Débit normal",
  throttle: "Rythme freiné",
  critical: "Cible dépassée — débit réduit",
  block: "Plafond atteint — débit plancher",
};

function Field({
  label, hint, value, onChange, step = 1, min = 0, type = "number",
}: { label: string; hint?: string; value: string | number; onChange: (v: string) => void; step?: number | string; min?: number; type?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink-soft">{label}</span>
      <input
        type={type}
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
      />
      {hint && <span className="mt-0.5 block text-[11px] text-ink-soft">{hint}</span>}
    </label>
  );
}

/**
 * Bridage automatique piloté par n8n : ici on ÉDITE les seuils et on LIT ce
 * que le workflow a décidé. Rien n'est envoyé au routeur depuis cet écran —
 * c'est n8n qui, toutes les 15 min, lit ces seuils et applique.
 */
export default function RegulationPanel({ routerId }: { routerId: string }) {
  const [view, setView] = useState<View | null>(null);
  const [form, setForm] = useState<RegulationForm>(REGULATION_DEFAULTS);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    readRouterRegulation(routerId).then((v) => {
      setView(v);
      if ("form" in v && v.form) setForm(v.form);
    });
  }, [routerId]);

  const set = (k: keyof RegulationForm) => (v: string) =>
    setForm((f) => ({ ...f, [k]: k === "blockLimit" ? v : Number(v) }));

  const save = () =>
    start(async () => {
      const res = await saveRouterRegulation(routerId, form);
      if ("error" in res && res.error) setMsg({ ok: false, text: res.error });
      else {
        setMsg({ ok: true, text: form.enabled ? "Seuils enregistrés — n8n les applique au prochain passage (≤ 15 min)." : "Seuils enregistrés, régulation désactivée." });
        setView(await readRouterRegulation(routerId));
      }
    });

  const state = view && "state" in view ? view.state : null;
  const events = (view && "events" in view && view.events) || [];
  const usedPct = state && form.softCapGo > 0 ? Math.min(999, (state.monthBytes / (form.softCapGo * 1024 ** 3)) * 100) : null;

  return (
    <section className="border border-line bg-paper p-4 rounded-xl">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-base font-bold text-ink">
            <Bot aria-hidden="true" className="h-5 w-5" /> Bridage automatique (n8n)
          </h3>
          <p className="mt-1 text-sm text-ink-soft">
            Toutes les 15 min, le workflow n8n lit ces seuils, relève le WAN et les sessions, puis lisse le
            débit sur le mois et bloque les téléchargeurs abusifs. Les seuils vivent ici, pas dans n8n.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 text-sm font-medium text-ink">
          <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))} className="h-4 w-4" />
          Activé
        </label>
      </div>

      {state && (
        <div className="mt-4 grid gap-2 border border-line bg-clay p-3 text-sm rounded-lg sm:grid-cols-4">
          <div><span className="block text-[11px] text-ink-soft">Décision</span><strong>{DECISION_LABEL[state.decision] ?? state.decision}</strong></div>
          <div><span className="block text-[11px] text-ink-soft">Débit appliqué</span><strong>{state.limit}</strong></div>
          <div><span className="block text-[11px] text-ink-soft">Ce cycle</span><strong>{(state.monthBytes / 1024 ** 3).toFixed(1)} Go{usedPct != null ? ` (${usedPct.toFixed(0)} %)` : ""}</strong></div>
          <div><span className="block text-[11px] text-ink-soft">Dernier passage</span><strong>{new Date(state.at).toLocaleString("fr-FR")}</strong></div>
        </div>
      )}

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Field label="Cible mensuelle (Go)" hint="4608 = 4,5 To" value={form.softCapGo} onChange={set("softCapGo")} />
        <Field label="Plafond absolu (Go)" hint="jamais dépassé" value={form.hardCapGo} onChange={set("hardCapGo")} />
        <Field label="Débit plancher (up/down)" hint="format RouterOS, ex. 64k/64k" type="text" value={form.blockLimit} onChange={set("blockLimit")} />
        <Field label="Marge de sécurité" hint="part du budget du jour réellement dépensable" step={0.01} value={form.safety} onChange={set("safety")} />
        <Field label="Avance tolérée" hint="1,10 = 10 % au-dessus du budget du jour avant de freiner" step={0.01} min={1} value={form.dayCriticalRatio} onChange={set("dayCriticalRatio")} />
        <Field label="Téléchargement abusif (Go / 15 min)" step={0.1} value={form.abuseThresholdGo} onChange={set("abuseThresholdGo")} />
        <Field label="Durée du blocage (min)" value={form.abuseBlockMinutes} onChange={set("abuseBlockMinutes")} />
        <Field label="Avertissements avant blocage définitif" min={1} value={form.abuseMaxOffenses} onChange={set("abuseMaxOffenses")} />
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="flex items-center gap-2 rounded-lg bg-ink px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-60">
          {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          Enregistrer les seuils
        </button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ink" : "text-err"}`}>{msg.text}</p>
        )}
      </div>

      {events.length > 0 && (
        <ul className="mt-5 divide-y divide-line border border-line text-sm rounded-lg">
          {events.map((e) => {
            const p = e.payload as Record<string, unknown>;
            return (
              <li key={e.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                <span className="text-ink-soft">{new Date(e.at).toLocaleString("fr-FR")}</span>
                {e.kind === "decision" ? (
                  <span>Décision : {String(p.previous)} → <strong>{String(p.decision)}</strong> ({String(p.limit)})</span>
                ) : (
                  <span>
                    {e.kind === "permanent_block" ? "Blocage définitif" : "Blocage"} : {String(p.user)} ({String(p.address)}) — {String(p.deltaGB)} Go
                    {p.unblockAt ? `, jusqu'à ${new Date(String(p.unblockAt)).toLocaleString("fr-FR")}` : ""}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
