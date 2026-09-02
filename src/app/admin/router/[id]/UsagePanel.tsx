"use client";

import { useEffect, useState, useTransition } from "react";
import { Gauge, Loader2, RefreshCw, Save, Satellite, Cable, Radio, TriangleAlert } from "lucide-react";
import {
  readRouterUsage,
  setRouterLink,
  setZoneUsage,
} from "@/lib/mikrotik/link-usage-actions";
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
