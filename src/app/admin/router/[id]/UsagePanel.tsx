"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Gauge, Loader2, RefreshCw, Save, Satellite, Cable, Radio, ShieldCheck, TriangleAlert } from "lucide-react";
import {
  readRouterUsage,
  setRouterLink,
  setZoneUsage,
} from "@/lib/mikrotik/link-usage-actions";
import {
  applyRouterQuotaGuard,
  buildRouterQuotaGuardScript,
  readRouterQuotaGuard,
  removeRouterQuotaGuard,
  type QuotaGuardView,
} from "@/lib/mikrotik/quota-guard-actions";
import { LINK_TYPES, formatBytes, type LinkType } from "@/lib/mikrotik/link-usage";
import type { RouterUsage, ZoneUsage } from "@/lib/mikrotik/link-usage-reader";

const LINK_ICON: Record<LinkType, typeof Cable> = { fibre: Cable, starlink: Satellite, autre: Radio };

const STATE_TONE: Record<string, { bar: string; text: string; label: string }> = {
  unlimited: { bar: "bg-ink-soft", text: "text-ink-soft", label: "Illimité" },
  ok: { bar: "bg-ok", text: "text-ok", label: "Sous le quota" },
  warn: { bar: "bg-warn", text: "text-warn", label: "Approche du quota" },
  over: { bar: "bg-err", text: "text-err", label: "Quota dépassé" },
};

function QuotaBar({ pct, state }: { pct: number; state: string }) {
  const tone = STATE_TONE[state] ?? STATE_TONE.ok;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-clay">
      <div className={`h-full ${tone.bar} transition-all`} style={{ width: `${Math.min(100, Math.max(2, pct))}%` }} />
    </div>
  );
}

/** Champ Mo avec conversion Go affichée. */
function MbField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const gb = Number(value) > 0 ? (Number(value) / 1024).toFixed(1) : null;
  return (
    <label className="block">
      <span className="text-xs font-bold text-ink-soft">{label}</span>
      <input
        type="number"
        min={0}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
      />
      <span className="mt-0.5 block text-[11px] text-ink-soft">{gb ? `≈ ${gb} Go` : "vide = illimité"}</span>
    </label>
  );
}

export default function UsagePanel({ routerId }: { routerId: string }) {
  const [usage, setUsage] = useState<RouterUsage | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [isReading, startRead] = useTransition();
  const [isSaving, startSave] = useTransition();

  // Config du lien
  const [linkType, setLinkType] = useState<LinkType | "">("");
  const [quotaMb, setQuotaMb] = useState("");
  const [cycleDay, setCycleDay] = useState("1");
  const [throttleMbps, setThrottleMbps] = useState("");

  function refresh() {
    startRead(async () => {
      setErr(null);
      const res = await readRouterUsage(routerId);
      if ("error" in res) return setErr(res.error);
      setUsage(res.usage);
      if (res.usage.linkType) setLinkType(res.usage.linkType as LinkType);
      if (res.usage.wan.quotaMb != null) setQuotaMb(String(res.usage.wan.quotaMb));
      if (res.usage.wan.throttleKbps != null) setThrottleMbps(String(res.usage.wan.throttleKbps / 1000));
    });
  }

  useEffect(refresh, [routerId]);

  function saveLink() {
    startSave(async () => {
      setMsg(null);
      const res = await setRouterLink(routerId, {
        linkType: linkType || null,
        wanQuotaMb: quotaMb ? Number(quotaMb) : null,
        billingCycleDay: Number(cycleDay) || 1,
        wanThrottleKbps: throttleMbps ? Math.round(Number(throttleMbps) * 1000) : null,
      });
      if ("error" in res && res.error) return setErr(res.error);
      setMsg("Réglages du lien enregistrés.");
      refresh();
    });
  }

  const wan = usage?.wan;
  const wanTone = STATE_TONE[wan?.state ?? "unlimited"];

  return (
    <div className="space-y-6">
      {/* ── Type de lien + quota total ── */}
      <div className="border border-line bg-paper p-5 rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-base font-bold text-ink">Lien montant (WAN)</h3>
          <button
            type="button"
            disabled={isReading}
            onClick={refresh}
            className="flex items-center gap-1.5 border border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink hover:bg-clay disabled:opacity-60 rounded-xl"
          >
            <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isReading ? "animate-spin" : ""}`} />
            Relire la conso
          </button>
        </div>

        {/* Sélecteur de type d'uplink */}
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          {LINK_TYPES.map((t) => {
            const Icon = LINK_ICON[t.value];
            const on = linkType === t.value;
            return (
              <button
                key={t.value}
                type="button"
                onClick={() => setLinkType(on ? "" : t.value)}
                className={`flex items-start gap-2 border p-3 text-left transition-colors rounded-xl ${
                  on ? "border-ink bg-brand text-slate-deep" : "border-line bg-paper text-ink hover:bg-clay"
                }`}
              >
                <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  <span className="block text-sm font-bold">{t.label}</span>
                  <span className={`mt-0.5 block text-[11px] ${on ? "text-slate-deep/80" : "text-ink-soft"}`}>{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Jauge de conso */}
        {wan && (
          <div className="mt-5">
            <div className="flex items-end justify-between gap-2">
              <span className="font-display text-2xl font-extrabold text-ink">{formatBytes(wan.usedBytes)}</span>
              <span className={`text-sm font-bold ${wanTone.text}`}>
                {wan.quotaMb != null ? `${wan.pct.toFixed(0)} % de ${(wan.quotaMb / 1024).toFixed(0)} Go` : wanTone.label}
              </span>
            </div>
            <div className="mt-2">
              <QuotaBar pct={wan.pct} state={wan.state} />
            </div>
            <p className="mt-1.5 text-[11px] text-ink-soft">
              {wan.interface ? `Interface ${wan.interface}` : "WAN non identifié"}
              {wan.throttled && <span className="ml-2 font-bold text-err">· débit bridé (quota atteint)</span>}
              {wan.cycleStartedAt && ` · cycle depuis le ${new Date(wan.cycleStartedAt).toLocaleDateString("fr-FR")}`}
            </p>
          </div>
        )}

        {/* Réglages du quota */}
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MbField label="Quota mensuel (Mo)" value={quotaMb} onChange={setQuotaMb} placeholder="ex. 1000000 (1 To)" />
          <label className="block">
            <span className="text-xs font-bold text-ink-soft">Jour de remise à zéro</span>
            <input
              type="number"
              min={1}
              max={28}
              value={cycleDay}
              onChange={(e) => setCycleDay(e.target.value)}
              className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
            />
            <span className="mt-0.5 block text-[11px] text-ink-soft">1–28 du mois</span>
          </label>
          <label className="block">
            <span className="text-xs font-bold text-ink-soft">Bridage au dépassement (Mbps)</span>
            <input
              type="number"
              min={0}
              step="0.5"
              value={throttleMbps}
              onChange={(e) => setThrottleMbps(e.target.value)}
              className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
            />
            <span className="mt-0.5 block text-[11px] text-ink-soft">vide = alerte seule</span>
          </label>
        </div>

        <button
          type="button"
          disabled={isSaving}
          onClick={saveLink}
          className="mt-4 inline-flex items-center gap-2 border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60 rounded-full"
        >
          {isSaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Save aria-hidden="true" className="h-4 w-4" />}
          Enregistrer le lien
        </button>
      </div>

      {/* ── Garde-fou quota autonome (sur le routeur) ── */}
      <QuotaGuardCard routerId={routerId} onError={setErr} onMsg={(m) => { setMsg(m); refresh(); }} />

      {/* ── Zones (VLAN) ── */}
      <div>
        <h3 className="font-display text-base font-bold text-ink">Zones WiFi (VLAN)</h3>
        {!usage ? (
          <p className="mt-2 text-sm text-ink-soft">Lecture en cours…</p>
        ) : usage.zones.length === 0 ? (
          <p className="mt-2 text-sm text-ink-soft">
            Aucune zone (bridge hotspot) sur ce routeur — les quotas par zone s&apos;appliquent aux bridges provisionnés.
          </p>
        ) : (
          <div className="mt-3 space-y-3">
            {usage.zones.map((z) => (
              <ZoneCard key={z.bridgeId} routerId={routerId} zone={z} onSaved={(m) => { setMsg(m); refresh(); }} onError={setErr} />
            ))}
          </div>
        )}
      </div>

      {err && (
        <p role="alert" className="border border-err bg-err/10 px-4 py-3 text-sm text-err rounded-xl">
          <TriangleAlert aria-hidden="true" className="mr-1.5 inline h-4 w-4" />
          {err}
        </p>
      )}
      {msg && !err && (
        <p role="status" className="border border-ok bg-ok/10 px-4 py-3 text-sm text-ink rounded-xl">{msg}</p>
      )}
    </div>
  );
}

function ZoneCard({
  routerId,
  zone,
  onSaved,
  onError,
}: {
  routerId: string;
  zone: ZoneUsage;
  onSaved: (msg: string) => void;
  onError: (e: string) => void;
}) {
  const [quota, setQuota] = useState(zone.quotaMb != null ? String(zone.quotaMb) : "");
  const [cap, setCap] = useState(zone.capKbps != null ? String(zone.capKbps / 1000) : "");
  const [perClient, setPerClient] = useState(zone.perClientKbps != null ? String(zone.perClientKbps / 1000) : "");
  const [isSaving, startSave] = useTransition();
  const tone = STATE_TONE[zone.state] ?? STATE_TONE.ok;

  function save() {
    startSave(async () => {
      const res = await setZoneUsage(routerId, zone.bridgeId, {
        zoneQuotaMb: quota ? Number(quota) : null,
        zoneCapKbps: cap ? Math.round(Number(cap) * 1000) : null,
        zonePerClientKbps: perClient ? Math.round(Number(perClient) * 1000) : null,
      });
      if ("error" in res && res.error) return onError(res.error);
      onSaved(`Zone ${zone.name} enregistrée.`);
    });
  }

  return (
    <div className="border border-line bg-paper p-4 rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-mono text-sm font-bold text-ink">{zone.name}</span>
        <span className={`text-xs font-bold ${tone.text}`}>
          {formatBytes(zone.usedBytes)}
          {zone.quotaMb != null && ` · ${zone.pct.toFixed(0)} %`}
          {zone.throttled && " · bridée"}
        </span>
      </div>
      <div className="mt-2">
        <QuotaBar pct={zone.pct} state={zone.state} />
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <MbField label="Quota (Mo)" value={quota} onChange={setQuota} placeholder="illimité" />
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Débit max du VLAN (Mbps)</span>
          <input
            type="number"
            min={0}
            step="0.5"
            value={cap}
            onChange={(e) => setCap(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
          />
          <span className="mt-0.5 block text-[11px] text-ink-soft">plafond partagé par toute la zone</span>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Débit par client (Mbps)</span>
          <input
            type="number"
            min={0}
            step="0.5"
            value={perClient}
            onChange={(e) => setPerClient(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
          />
          <span className="mt-0.5 block text-[11px] text-ink-soft">plafond de CHAQUE appareil (PCQ)</span>
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          disabled={isSaving}
          onClick={save}
          className="inline-flex items-center gap-2 border border-line bg-brand px-4 py-2 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60 rounded-full"
        >
          {isSaving ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Gauge aria-hidden="true" className="h-4 w-4" />}
          Appliquer
        </button>
      </div>
    </div>
  );
}

/**
 * GARDE-FOU QUOTA AUTONOME — le routeur se bride seul quand le quota WAN du
 * mois est atteint, même si la plateforme est hors ligne (script + scheduler
 * posés sur le routeur). C'est le complément du suivi côté plateforme : celui-
 * ci trace et alerte, le garde-fou tient sans réseau.
 */
function QuotaGuardCard({
  routerId,
  onError,
  onMsg,
}: {
  routerId: string;
  onError: (e: string) => void;
  onMsg: (m: string) => void;
}) {
  const [view, setView] = useState<QuotaGuardView | null>(null);
  const [capGo, setCapGo] = useState("");
  const [throttle, setThrottle] = useState("10");
  const [iface, setIface] = useState("");
  const [script, setScript] = useState<string | null>(null);
  const [busy, startBusy] = useTransition();
  const [isReading, startRead] = useTransition();
  // Hydratation des champs depuis le mémo UNE SEULE FOIS (au 1er chargement) —
  // dans le callback de lecture, pas dans un effet (setState en effet = renders
  // en cascade).
  const hydrated = useRef(false);

  function refresh() {
    startRead(async () => {
      const next = await readRouterQuotaGuard(routerId);
      setView(next);
      const saved = next.saved;
      if (!hydrated.current && saved) {
        hydrated.current = true;
        if (saved.capMb > 0) setCapGo(String(Math.round((saved.capMb / 1024) * 100) / 100));
        if (saved.throttleKbps > 0) setThrottle(String(saved.throttleKbps / 1000));
        if (saved.wanInterface) setIface(saved.wanInterface);
      }
    });
  }

  useEffect(refresh, [routerId]);

  const installed = view?.state?.installed ?? false;
  const throttled = view?.state?.throttled ?? false;
  const used = view?.state?.usedBytes ?? null;
  const pct = view?.pct ?? null;

  function apply() {
    startBusy(async () => {
      setScript(null);
      const res = await applyRouterQuotaGuard(routerId, {
        capGo: Number(capGo),
        throttleMbps: Number(throttle),
        wanInterface: iface.trim() || undefined,
      });
      if ("error" in res && res.error) return onError(res.error);
      onMsg(res.summary ?? "Garde-fou posé.");
      refresh();
    });
  }

  function remove() {
    startBusy(async () => {
      setScript(null);
      const res = await removeRouterQuotaGuard(routerId);
      if ("error" in res && res.error) return onError(res.error);
      onMsg(res.summary ?? "Garde-fou retiré.");
      refresh();
    });
  }

  function showScript() {
    startBusy(async () => {
      const res = await buildRouterQuotaGuardScript(routerId, {
        capGo: Number(capGo),
        throttleMbps: Number(throttle),
        wanInterface: iface.trim(),
      });
      if ("error" in res && res.error) return onError(res.error);
      setScript(res.script ?? null);
    });
  }

  return (
    <div className="border border-line bg-paper p-5 rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-base font-bold text-ink">
          Garde-fou quota (autonome sur le routeur)
        </h3>
        <span
          className={`border px-3 py-1 text-xs font-bold rounded-full ${
            installed
              ? throttled
                ? "border-err bg-err/10 text-err"
                : "border-ok bg-ok/10 text-ok"
              : "border-line bg-clay text-ink-soft"
          }`}
        >
          {installed ? (throttled ? "Quota atteint — lien bridé" : "Actif sur le routeur") : "Non posé"}
        </span>
      </div>
      <p className="mt-1.5 text-[12px] text-ink-soft">
        Le routeur vérifie sa propre consommation toutes les 15 min et brise le lien au débit choisi
        quand le quota mensuel est atteint — même si SafeLinkHub est injoignable. Le suivi ci-dessus
        trace et alerte ; celui-ci tient sans réseau.
      </p>

      {/* Conso vue par le routeur */}
      {installed && used != null && (
        <div className="mt-4">
          <div className="flex items-end justify-between gap-2">
            <span className="font-display text-2xl font-extrabold text-ink">{formatBytes(used)}</span>
            <span className="text-sm font-bold text-ink-soft">
              {pct != null ? `${pct.toFixed(0)} % du quota (cycle « ${view?.state?.cycleMonth ?? "—"} »)` : "cycle en cours"}
            </span>
          </div>
          <div className="mt-2">
            <QuotaBar pct={pct ?? 0} state={pct == null ? "unlimited" : pct >= 100 ? "over" : pct >= 80 ? "warn" : "ok"} />
          </div>
        </div>
      )}
      {installed && view?.error && (
        <p className="mt-3 text-[12px] text-ink-soft">Détail du routeur indisponible : {view.error}</p>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Quota mensuel (Go)</span>
          <input
            type="number"
            min={1}
            value={capGo}
            placeholder="ex. 3000 (3 To)"
            onChange={(e) => setCapGo(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
          />
          <span className="mt-0.5 block text-[11px] text-ink-soft">ex. 3000 Go = 3 To — un Starlink classique</span>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Débit de bride (Mbps)</span>
          <input
            type="number"
            min={0.064}
            step="0.5"
            value={throttle}
            onChange={(e) => setThrottle(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
          />
          <span className="mt-0.5 block text-[11px] text-ink-soft">débit survivant partagé quand le quota tombe</span>
        </label>
        <label className="block">
          <span className="text-xs font-bold text-ink-soft">Interface WAN (optionnel)</span>
          <input
            type="text"
            value={iface}
            placeholder="auto (détectée)"
            onChange={(e) => setIface(e.target.value)}
            className="mt-1 w-full border border-line bg-paper px-3 py-2 text-sm text-ink rounded-lg"
          />
          <span className="mt-0.5 block text-[11px] text-ink-soft">ex. ether1 — laisser vide = détection auto</span>
        </label>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy || !capGo}
          onClick={apply}
          className="inline-flex items-center gap-2 border border-line bg-brand px-5 py-2.5 text-sm font-bold text-slate-deep hover:bg-ink hover:text-paper disabled:opacity-60 rounded-full"
        >
          {busy ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <ShieldCheck aria-hidden="true" className="h-4 w-4" />}
          {installed ? "Re-appliquer le garde-fou" : "Activer le garde-fou"}
        </button>
        {installed && (
          <button
            type="button"
            disabled={busy}
            onClick={remove}
            className="inline-flex items-center gap-2 border border-err bg-paper px-5 py-2.5 text-sm font-bold text-err hover:bg-err hover:text-paper disabled:opacity-60 rounded-full"
          >
            Retirer
          </button>
        )}
        <button
          type="button"
          disabled={busy || !capGo}
          onClick={showScript}
          className="inline-flex items-center gap-2 border border-line bg-paper px-5 py-2.5 text-sm font-bold text-ink hover:bg-clay disabled:opacity-60 rounded-full"
        >
          Script à coller
        </button>
        {isReading && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin text-ink-soft" />}
      </div>

      {script && (
        <pre className="mt-3 max-h-64 overflow-auto border border-line bg-clay p-3 text-[11px] text-ink rounded-lg whitespace-pre-wrap">
          {script}
        </pre>
      )}
    </div>
  );
}
