"use client";

import { useState, useTransition } from "react";
import {
  Stethoscope,
  Loader2,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  Info,
  Wrench,
  RefreshCw,
} from "lucide-react";
import {
  runRouterAudit,
  optimizeRouterWifi,
  optimizeRouterThroughput,
  setRouterBandwidthCap,
  repairMikhmonStorage,
  reconfigureMikhmonSession,
} from "@/lib/mikrotik/actions";
import type { AuditFinding, AuditSeverity, RouterAudit } from "@/lib/mikrotik/router-audit";
import NetworkGuide from "./NetworkGuide";

const SEV: Record<
  AuditSeverity,
  { label: string; icon: typeof Info; text: string; bg: string; border: string }
> = {
  error: { label: "Critique", icon: AlertOctagon, text: "text-err", bg: "bg-err/10", border: "border-err" },
  warn: { label: "À corriger", icon: AlertTriangle, text: "text-warn", bg: "bg-warn/10", border: "border-warn" },
  info: { label: "Info", icon: Info, text: "text-ink-soft", bg: "bg-clay", border: "border-line" },
  ok: { label: "OK", icon: CheckCircle2, text: "text-ok", bg: "bg-ok/10", border: "border-ok" },
};

const FIX_LABEL: Record<NonNullable<AuditFinding["fix"]>, string> = {
  wifi: "Optimiser le WiFi",
  throughput: "Optimiser le débit",
  cap: "Plafonner à 450 Mbps",
  mikhmon: "Déplacer sur la flash",
  "mikhmon-session": "Reconfigurer la session",
};

function scoreTone(score: number) {
  if (score >= 80) return { text: "text-ok", bar: "bg-ok", label: "Bon état" };
  if (score >= 50) return { text: "text-warn", bar: "bg-warn", label: "À améliorer" };
  return { text: "text-err", bar: "bg-err", label: "Défauts importants" };
}

export default function AuditPanel({ routerId }: { routerId: string }) {
  const [audit, setAudit] = useState<RouterAudit | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAnalyzing, startAnalyze] = useTransition();
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [isFixing, startFix] = useTransition();
  const [fixMsg, setFixMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  function analyze() {
    startAnalyze(async () => {
      setError(null);
      setFixMsg(null);
      const res = await runRouterAudit(routerId);
      if (res?.error) {
        setError(res.error);
        return;
      }
      if (res?.audit) setAudit(res.audit);
    });
  }

  function applyFix(finding: AuditFinding) {
    if (!finding.fix) return;
    setFixingId(finding.id);
    startFix(async () => {
      setFixMsg(null);
      const res =
        finding.fix === "wifi"
          ? await optimizeRouterWifi(routerId)
          : finding.fix === "throughput"
            ? await optimizeRouterThroughput(routerId)
            : finding.fix === "mikhmon"
              ? await repairMikhmonStorage(routerId)
              : finding.fix === "mikhmon-session"
                ? await reconfigureMikhmonSession(routerId)
                : await setRouterBandwidthCap(routerId, 450);
      setFixingId(null);
      if (res?.error) {
        setFixMsg({ id: finding.id, ok: false, text: res.error });
        return;
      }
      setFixMsg({ id: finding.id, ok: true, text: res?.summary ?? "Correctif appliqué." });
      // Ré-analyse auto pour refléter l'état corrigé — sauf la migration MikHmon,
      // longue et lancée en arrière-plan : l'utilisateur ré-analyse après ~2 min.
      if (finding.fix !== "mikhmon") {
        const fresh = await runRouterAudit(routerId);
        if (fresh?.audit) setAudit(fresh.audit);
      }
    });
  }

  // ── État initial : appel à l'action ──────────────────────────────────────
  if (!audit) {
    return (
      <div className="border-2 border-line bg-paper px-6 py-12 text-center">
        <Stethoscope aria-hidden="true" className="mx-auto h-9 w-9 text-ink-soft" />
        <h2 className="mt-3 font-display text-lg font-bold text-ink">Diagnostic du routeur</h2>
        <p className="mx-auto mt-1 max-w-md text-sm text-ink-soft">
          Analyse la configuration au regard des bonnes pratiques de l&apos;auto-setup :
          débit, WiFi, ports, MikHmon, réseau. Les défauts corrigeables se réparent en un clic.
        </p>
        {error && (
          <p role="alert" className="mx-auto mt-4 max-w-md border-2 border-err bg-err/10 px-3 py-2 text-sm font-medium text-err">
            {error}
          </p>
        )}
        <button
          type="button"
          disabled={isAnalyzing}
          onClick={analyze}
          className="mt-5 inline-flex items-center gap-2 border-2 border-line bg-brand px-5 py-2.5 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper disabled:opacity-60"
        >
          {isAnalyzing ? (
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
          ) : (
            <Stethoscope aria-hidden="true" className="h-4 w-4" />
          )}
          {isAnalyzing ? "Analyse en cours…" : "Lancer l'analyse"}
        </button>
      </div>
    );
  }

  const tone = scoreTone(audit.score);
  const actionable = audit.findings.filter((f) => f.severity === "error" || f.severity === "warn");
  const passed = audit.findings.filter((f) => f.severity === "ok");
  const infos = audit.findings.filter((f) => f.severity === "info");

  return (
    <div className="space-y-6">
      {/* ── En-tête : score de santé ── */}
      <div className="flex flex-col gap-4 border-2 border-line bg-paper p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-4">
          <div className="flex flex-col items-center">
            <span className={`font-display text-4xl font-extrabold tabular-nums ${tone.text}`}>{audit.score}</span>
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-soft">/ 100</span>
          </div>
          <div>
            <p className={`font-display text-lg font-bold ${tone.text}`}>{tone.label}</p>
            <p className="text-sm text-ink-soft">
              {audit.board} · RouterOS {audit.version} · uptime {audit.uptime}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5 text-[11px] font-mono font-semibold uppercase">
              <span className="border border-err px-1.5 py-0.5 text-err">{audit.counts.error} critique(s)</span>
              <span className="border border-warn px-1.5 py-0.5 text-warn">{audit.counts.warn} à corriger</span>
              <span className="border border-ok px-1.5 py-0.5 text-ok">{audit.counts.ok} OK</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          disabled={isAnalyzing}
          onClick={analyze}
          className="flex shrink-0 items-center gap-1.5 self-start border-2 border-line bg-paper px-3 py-1.5 text-sm font-bold text-ink transition-colors duration-150 hover:bg-clay disabled:opacity-60"
        >
          <RefreshCw aria-hidden="true" className={`h-4 w-4 ${isAnalyzing ? "animate-spin" : ""}`} />
          {isAnalyzing ? "Analyse…" : "Ré-analyser"}
        </button>
      </div>

      {/* ── Constats à traiter ── */}
      {actionable.length === 0 ? (
        <div className="flex items-center gap-3 border-2 border-ok bg-ok/10 px-4 py-4">
          <CheckCircle2 aria-hidden="true" className="h-6 w-6 shrink-0 text-ok" />
          <p className="text-sm font-medium text-ink">
            Aucun défaut bloquant détecté — la configuration suit les bonnes pratiques.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <h3 className="font-display text-base font-bold text-ink">
            Défauts détectés ({actionable.length})
          </h3>
          {actionable.map((f) => {
            const s = SEV[f.severity];
            const Icon = s.icon;
            const busy = isFixing && fixingId === f.id;
            const msg = fixMsg?.id === f.id ? fixMsg : null;
            return (
              <div key={f.id} className={`border-2 ${s.border} bg-paper`}>
                <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-3">
                    <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${s.text}`} />
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[11px] font-mono font-semibold uppercase tracking-wide ${s.text}`}>
                          {s.label}
                        </span>
                        <span className="border border-line-soft bg-clay px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
                          {f.area}
                        </span>
                      </div>
                      <p className="mt-1 font-bold text-ink">{f.title}</p>
                      <p className="mt-0.5 text-sm text-ink-soft">{f.detail}</p>
                    </div>
                  </div>
                  {f.fix && (
                    <button
                      type="button"
                      disabled={isFixing}
                      onClick={() => applyFix(f)}
                      className="flex shrink-0 items-center gap-1.5 self-start border-2 border-line bg-brand px-3 py-1.5 text-sm font-bold text-[#1C1917] transition-colors duration-150 hover:bg-ink hover:text-paper disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                      ) : (
                        <Wrench aria-hidden="true" className="h-4 w-4" />
                      )}
                      {busy ? "Correction…" : (FIX_LABEL[f.fix] ?? "Corriger")}
                    </button>
                  )}
                </div>
                {msg && (
                  <p
                    className={`border-t-2 px-4 py-2 text-sm font-medium ${
                      msg.ok ? "border-ok bg-ok/10 text-ok" : "border-err bg-err/10 text-err"
                    }`}
                  >
                    {msg.text}
                  </p>
                )}
                {!f.fix && (
                  <p className="border-t border-line-soft bg-clay px-4 py-1.5 text-[12px] text-ink-soft">
                    À traiter manuellement (souvent physique : câble, appareil, ou relance de l&apos;auto-setup).
                  </p>
                )}
                {f.id === "eth-100m" && <NetworkGuide />}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Contrôles OK + infos ── */}
      {(passed.length > 0 || infos.length > 0) && (
        <details className="border-2 border-line bg-paper">
          <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-ink">
            Contrôles conformes &amp; informations ({passed.length + infos.length})
          </summary>
          <ul className="divide-y divide-line-soft border-t-2 border-line">
            {[...passed, ...infos].map((f) => {
              const s = SEV[f.severity];
              const Icon = s.icon;
              return (
                <li key={f.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Icon aria-hidden="true" className={`mt-0.5 h-4 w-4 shrink-0 ${s.text}`} />
                  <div>
                    <span className="text-sm font-medium text-ink">{f.title}</span>
                    <span className="ml-2 text-sm text-ink-soft">{f.detail}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </div>
  );
}
