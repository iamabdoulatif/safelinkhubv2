"use client";

import { useEffect, useState, useTransition } from "react";
import { Bot, Loader2 } from "lucide-react";
import { readRouterRegulation, saveRouterRegulation } from "@/lib/mikrotik/regulation-actions";
import { REGULATION_DEFAULTS, type RegulationForm } from "@/lib/mikrotik/regulation-defaults";
import { buttonClass } from "@/components/ui/Button";

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
      <span className="text-[13px] font-medium text-ink">{label}</span>
      <input
        type={type}
        step={step}
        min={min}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="field mt-1"
      />
      {hint && <span className="mt-0.5 block text-xs text-ink-soft">{hint}</span>}
    </label>
  );
}

/**
 * Bridage automatique : ici on ÉDITE les seuils, on ACTIVE ou DÉSACTIVE la
 * régulation, et on LIT ce que le passage régulier a décidé. Rien n'est envoyé
 * au routeur depuis cet écran : /api/cron/regulation, toutes les 5 min,
 * applique — ou, régulation coupée, LIBÈRE le routeur (files de bridage,
 * clients bloqués, profils réduits).
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
    setForm((f) => ({
      ...f,
      [k]: k === "blockLimit" || k === "abuseThrottleLimit" ? v : Number(v),
    }));

  // Bascule immédiate, sans passer par « Enregistrer les seuils » : couper la
  // régulation ne doit jamais dépendre d'un second clic.
  const basculer = (enabled: boolean) =>
    start(async () => {
      const res = await saveRouterRegulation(routerId, { ...form, enabled });
      if ("error" in res && res.error) setMsg({ ok: false, text: res.error });
      else {
        setForm((f) => ({ ...f, enabled }));
        setMsg({
          ok: true,
          text: enabled
            ? "Régulation activée — appliquée au prochain passage (≤ 5 min)."
            : "Régulation désactivée — le routeur sera libéré au prochain passage (≤ 5 min).",
        });
        setView(await readRouterRegulation(routerId));
      }
    });

  const save = () =>
    start(async () => {
      const res = await saveRouterRegulation(routerId, form);
      if ("error" in res && res.error) setMsg({ ok: false, text: res.error });
      else {
        setMsg({ ok: true, text: form.enabled ? "Seuils enregistrés — appliqués au prochain passage (≤ 5 min)." : "Seuils enregistrés, régulation toujours désactivée." });
        setView(await readRouterRegulation(routerId));
      }
    });

  const state = view && "state" in view ? view.state : null;
  // L'état ENREGISTRÉ (pas la saisie en cours) : c'est lui que le passage lit.
  const enregistre = Boolean(view && "form" in view && view.form?.enabled);
  const configured = Boolean(view && "configured" in view && view.configured);
  const events = (view && "events" in view && view.events) || [];
  const usedPct = state && form.softCapGo > 0 ? Math.min(999, (state.monthBytes / (form.softCapGo * 1024 ** 3)) * 100) : null;

  return (
    <section className="rounded-xl border border-line bg-paper p-4 sm:p-5">
      <h3 className="flex items-center gap-2 text-base font-semibold text-ink">
        <Bot aria-hidden="true" className="h-5 w-5" /> Régulation du débit (bridage automatique)
      </h3>
      <p className="mt-1 text-sm text-ink-soft">
        Toutes les 5 min, la plateforme relève le WAN et les sessions, lisse le débit sur le mois
        et bride ou bloque les téléchargeurs abusifs, selon les seuils ci-dessous.
      </p>

      {/* L'état et l'interrupteur, en tête et sans ambiguïté : la case
          « Activé » d'avant, perdue dans un coin, ne prenait effet qu'après
          « Enregistrer les seuils ». */}
      {view && (
        <div
          className={`mt-4 flex flex-wrap items-center gap-3 rounded-xl border px-4 py-3 ${
            enregistre ? "border-ok/30 bg-ok-soft" : "border-line bg-clay/60"
          }`}
        >
          <span
            className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold ${
              enregistre ? "bg-paper text-ok" : "bg-paper text-ink-soft"
            }`}
          >
            <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${enregistre ? "bg-ok" : "bg-line-strong"}`} />
            {enregistre ? "Régulation active" : "Régulation désactivée"}
          </span>
          <p className="min-w-0 flex-1 text-[13px] text-ink-soft">
            {enregistre
              ? "Le débit de ce routeur est régulé ; les téléchargeurs abusifs peuvent être bridés ou bloqués."
              : state?.released
                ? `Routeur libéré le ${new Date(state.released).toLocaleString("fr-FR")} : aucune file de bridage, aucun client bloqué.`
                : configured
                  ? "Libération en attente : le routeur sera nettoyé au prochain passage, dès qu'il est joignable."
                  : "Aucun bridage ni blocage n'est appliqué à ce routeur."}
          </p>
          <button
            type="button"
            onClick={() => basculer(!enregistre)}
            disabled={pending}
            className={buttonClass({ variant: enregistre ? "outline" : "secondary", size: "sm" })}
          >
            {pending && <Loader2 aria-hidden="true" className="h-3.5 w-3.5 animate-spin" />}
            {enregistre ? "Désactiver la régulation" : "Activer la régulation"}
          </button>
        </div>
      )}

      {state && (
        <div className="mt-4 grid gap-2 border border-line bg-clay p-3 text-sm rounded-lg sm:grid-cols-4">
          <div><span className="block text-xs text-ink-soft">Décision</span><strong>{DECISION_LABEL[state.decision] ?? state.decision}</strong></div>
          <div><span className="block text-xs text-ink-soft">Débit appliqué</span><strong>{state.limit}</strong></div>
          <div><span className="block text-xs text-ink-soft">Ce cycle</span><strong>{(state.monthBytes / 1024 ** 3).toFixed(1)} Go{usedPct != null ? ` (${usedPct.toFixed(0)} %)` : ""}</strong></div>
          <div><span className="block text-xs text-ink-soft">Dernier passage</span><strong>{new Date(state.at).toLocaleString("fr-FR")}</strong></div>
        </div>
      )}

      {/* Dix seuils à plat ne se relisent pas : ils sont regroupés par QUESTION
          — combien de budget, quand freiner, que faire du contrevenant —
          chacune avec son intitulé. L'ordre des champs ne change pas au sein
          de leur groupe (audit UI/UX du 22/09/2026). */}
      <fieldset className="mt-5">
        <legend className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          Budget du mois
        </legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Cible mensuelle (Go)" hint="4608 = 4,5 To" value={form.softCapGo} onChange={set("softCapGo")} />
          <Field label="Plafond absolu (Go)" hint="jamais dépassé" value={form.hardCapGo} onChange={set("hardCapGo")} />
          <Field label="Marge de sécurité" hint="part du budget du jour réellement dépensable" step={0.01} value={form.safety} onChange={set("safety")} />
          <Field label="Avance tolérée" hint="1,10 = 10 % au-dessus du budget du jour avant de freiner" step={0.01} min={1} value={form.dayCriticalRatio} onChange={set("dayCriticalRatio")} />
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          Téléchargeurs abusifs
        </legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Téléchargement abusif (Go / 5 min)" step={0.1} value={form.abuseThresholdGo} onChange={set("abuseThresholdGo")} />
          <Field label="Débit du contrevenant bridé" hint="1er dépassement : la navigation passe, le téléchargement n'aboutit pas" type="text" value={form.abuseThrottleLimit} onChange={set("abuseThrottleLimit")} />
          <Field label="Durée du blocage (min)" value={form.abuseBlockMinutes} onChange={set("abuseBlockMinutes")} />
          <Field label="Avertissements avant blocage définitif" min={1} value={form.abuseMaxOffenses} onChange={set("abuseMaxOffenses")} />
        </div>
      </fieldset>

      <fieldset className="mt-5">
        <legend className="text-xs font-bold uppercase tracking-wider text-ink-soft">
          En dernier recours
        </legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <Field label="Débit plancher (up/down)" hint="format RouterOS, ex. 64k/64k — quand le plafond absolu est atteint" type="text" value={form.blockLimit} onChange={set("blockLimit")} />
          <Field label="Bridage des forfaits pendant un freinage (%)" hint="0 = forfaits intacts ; 50 = chaque forfait à la moitié de son débit, rétabli au retour à la normale" min={0} value={form.profileThrottlePct} onChange={set("profileThrottlePct")} />
        </div>
      </fieldset>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={pending} className="btn btn-md btn-secondary flex items-center gap-2">
          {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
          Enregistrer les seuils
        </button>
        {msg && (
          <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-ink" : "text-err"}`}>{msg.text}</p>
        )}
      </div>

      {events.length > 0 && (
        <>
          <h4 className="mt-6 text-xs font-bold uppercase tracking-wider text-ink-soft">
            Journal des décisions
          </h4>
          <ul className="mt-2 divide-y divide-line border border-line text-sm rounded-lg">
          {events.map((e) => {
            const p = e.payload as Record<string, unknown>;
            return (
              <li key={e.id} className="flex flex-wrap gap-x-3 px-3 py-2">
                <span className="text-ink-soft">{new Date(e.at).toLocaleString("fr-FR")}</span>
                {e.kind === "decision" ? (
                  <span>Décision : {String(p.previous)} → <strong>{String(p.decision)}</strong> ({String(p.limit)})</span>
                ) : e.kind === "notice" ? (
                  /* Le SEUL endroit où l'on voit qu'un client n'a PAS pu être
                     prévenu : sans numéro (code vendu par un agent), il se
                     présentera au guichet sans savoir pourquoi son code est mort. */
                  <span className={p.notified ? "" : "text-warn"}>
                    {Number(p.remaining) > 0 ? "Avertissement" : "Suspension définitive"} :{" "}
                    <strong>{String(p.user)}</strong>{" "}
                    {p.notified
                      ? `— client prévenu par SMS au ${String(p.phone)}`
                      : "— CLIENT NON PRÉVENU : aucun numéro connu (code vendu hors portail)"}
                  </span>
                ) : e.kind === "throttle" ? (
                  <span>
                    Bridage : {String(p.user)} ({String(p.address)}) — {String(p.deltaGB)} Go en 5 min, débit ramené à {String(p.limit)}
                  </span>
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
        </>
      )}
    </section>
  );
}
