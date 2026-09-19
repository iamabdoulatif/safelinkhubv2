"use client";

/*
 * Tableau de bord VIVANT d'une restauration : l'ancien boîtier à gauche, le
 * rechange à droite (photos produit, mises en scène en 3D CSS), et entre les
 * deux ce qui est déjà passé — tickets, profils, recettes, portail — compté en
 * direct depuis le job sondé par BackupsManager.
 *
 * Remplace RestoreTopology pendant et après une restauration RÉELLE : le
 * schéma « prévu / bloqué » a fait son travail au scan ; ici on regarde les
 * chiffres monter. Pas de couleur en dur, les jetons de thème suivent.
 */

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Ban, Check, Loader2 } from "lucide-react";

export type LiveReport = { section: string; created: number; updated: number; skipped: number; failed: { name: string; error: string }[] };
export type LiveProgress = {
  phase?: string;
  reports?: LiveReport[];
  ticketsDone?: number;
  ticketsTotal?: number;
  salesDone?: number;
  salesTotal?: number;
  portal?: { installed: boolean; templateName?: string | null; error?: string };
};
export type LiveStatus = "running" | "done" | "cancelled" | "error";

const PHASES: { key: string; label: string }[] = [
  { key: "remodel", label: "Préparation" },
  { key: "hotspotUserProfiles", label: "Profils" },
  { key: "hotspotTargetBindings", label: "Liaison pool" },
  { key: "hotspotUsers", label: "Tickets" },
  { key: "hotspotRestoreVerification", label: "Vérification" },
  { key: "activeSessionHandover", label: "Sessions" },
  { key: "mikhmonSales", label: "Recettes" },
  { key: "walledGarden", label: "Walled-garden" },
  { key: "done", label: "Portail" },
];
// Phases secondaires qui se rangent sous une étape affichée.
const PHASE_ALIAS: Record<string, string> = {
  purgeTarget: "remodel",
  hotspotUserProfileLinks: "hotspotUserProfiles",
  mikhmonSchedulers: "activeSessionHandover",
  walledGardenIp: "walledGarden",
};

const nf = new Intl.NumberFormat("fr-FR");

/** Photo produit par modèle RouterOS ; null ⇒ silhouette générique. */
export function deviceImage(model: string | null | undefined): string | null {
  // board-name RouterOS : « L009UiGS-2HaxD », « RB4011iGS+5HacQ2HnD », « hAP ax lite »
  // (L41G-2axD), « hAP ax lite LTE6 » (L41G-2axD&FG621-EA), « hAP ax^2 » (C52iG…),
  // « hAP ax^3 » (C53UiG…). L'ordre compte : LTE6 avant ax lite, ax lite avant ax².
  const m = (model ?? "").toLowerCase();
  if (m.includes("l009")) return "/mikrotik/l009.webp";
  if (m.includes("4011")) return "/mikrotik/rb4011.webp";
  if (m.includes("5009")) return "/mikrotik/rb5009.webp";
  if (/rb260|css106/.test(m)) return "/mikrotik/rb260gs.webp";
  if (/l41g|ax[ -]?lite/.test(m)) return /lte6|fg621/.test(m) ? "/mikrotik/hap-ax-lite-lte6.webp" : "/mikrotik/hap-ax-lite.webp";
  if (/c52|ax\^?2\b/.test(m)) return "/mikrotik/hap-ax2.webp";
  if (/c53|ax\^?3\b/.test(m)) return "/mikrotik/hap-ax3.webp";
  if (m.includes("chateau") || m.includes("chato")) return "/mikrotik/chato.webp";
  return null;
}

/** Compteur qui glisse vers sa cible (≈ 500 ms) plutôt que de sauter. */
function useCountUp(target: number) {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    const start = from.current;
    if (start === target) return;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / 500);
      const eased = 1 - (1 - k) ** 3;
      const v = Math.round(start + (target - start) * eased);
      setValue(v);
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);
  return value;
}

function Device({
  name,
  model,
  side,
  active,
}: {
  name: string;
  model: string | null;
  side: "source" | "target";
  active: boolean;
}) {
  const src = deviceImage(model);
  // Boucle vidéo (rendu Higgsfield) si elle est déposée à côté de la photo ;
  // sinon, ou si elle manque (404), la photo animée en CSS prend le relais.
  const [video, setVideo] = useState<string | null>(src ? src.replace(/\.webp$/, ".mp4") : null);
  return (
    <div className={`rl-device rl-device-${side}${active ? " is-active" : ""}`}>
      <div className="rl-stage">
        {video && src ? (
          <video
            className="rl-photo rl-video"
            src={video}
            poster={src}
            autoPlay
            muted
            loop
            playsInline
            aria-label={model ?? name}
            onError={() => setVideo(null)}
          />
        ) : src ? (
          <Image src={src} alt={model ?? name} width={220} height={220} className="rl-photo" priority />
        ) : (
          <div className="rl-photo rl-photo-generic">
            <Image src="/logo-mikrotik.webp" alt="MikroTik" width={72} height={24} />
          </div>
        )}
        <span className="rl-floor" aria-hidden="true" />
      </div>
      <p className="mt-2 truncate text-sm font-bold text-ink">{name}</p>
      <p className="truncate text-xs text-ink-soft">{model ?? "modèle inconnu"}</p>
    </div>
  );
}

function Counter({ label, done, total, state }: { label: string; done: number; total: number; state: "idle" | "running" | "done" | "failed" }) {
  const shown = useCountUp(done);
  const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : state === "done" ? 100 : 0;
  return (
    <div className={`rl-counter is-${state}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">{label}</span>
        <span className="font-mono text-sm tabular-nums text-ink">
          <b className="text-base">{nf.format(shown)}</b>
          {total > 0 && <span className="text-ink-soft"> / {nf.format(total)}</span>}
        </span>
      </div>
      <div className="rl-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <span className="rl-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function RestoreLive({
  source,
  target,
  counts,
  progress,
  status,
  startedAt,
  onCancel,
  cancelling,
}: {
  source: { name: string; model: string | null };
  target: { name: string; model: string | null };
  /** Compteurs de la sauvegarde : les totaux attendus avant que le moteur ne les confirme. */
  counts: Record<string, number>;
  progress: LiveProgress | null;
  status: LiveStatus;
  startedAt: number;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const running = status === "running";
  const phaseKey = PHASE_ALIAS[progress?.phase ?? ""] ?? progress?.phase ?? "remodel";
  const phaseIdx = status === "done" ? PHASES.length : Math.max(0, PHASES.findIndex((p) => p.key === phaseKey));

  const rowOf = (section: string) => progress?.reports?.find((r) => r.section === section);
  const doneOf = (section: string) => {
    const r = rowOf(section);
    return r ? r.created + r.updated + r.skipped : 0;
  };
  const stateOf = (section: string, idx: number): "idle" | "running" | "done" | "failed" => {
    const r = rowOf(section);
    if (r && r.failed.length > 0) return "failed";
    if (phaseIdx > idx || status === "done") return "done";
    if (phaseIdx === idx && running) return "running";
    return "idle";
  };

  const ticketsDone = progress?.ticketsDone ?? doneOf("hotspotUsers");
  const ticketsTotal = progress?.ticketsTotal ?? counts.hotspotUsers ?? 0;
  const salesDone = progress?.salesDone ?? doneOf("mikhmonSales");
  const salesTotal = progress?.salesTotal ?? counts.mikhmonSales ?? 0;
  const profilesTotal = counts.hotspotUserProfiles ?? 0;

  // Débit et reste à faire, sur la phase longue en cours.
  const [rate, setRate] = useState<{ perSec: number; remaining: number } | null>(null);
  const sample = useRef<{ t: number; n: number } | null>(null);
  const longDone = phaseKey === "mikhmonSales" ? salesDone : ticketsDone;
  const longTotal = phaseKey === "mikhmonSales" ? salesTotal : ticketsTotal;
  useEffect(() => {
    if (!running) return;
    const now = Date.now();
    const prev = sample.current;
    if (prev && longDone > prev.n && now - prev.t > 2000) {
      const perSec = ((longDone - prev.n) / (now - prev.t)) * 1000;
      setRate({ perSec, remaining: Math.max(0, longTotal - longDone) });
    }
    if (!prev || longDone !== prev.n) sample.current = { t: now, n: longDone };
  }, [longDone, longTotal, running]);

  // Horloge : une seconde par tick tant que ça tourne, figée à la fin.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [running]);
  const elapsed = Math.max(0, Math.round((now - startedAt) / 1000));
  const eta = rate && rate.perSec > 0 ? Math.round(rate.remaining / rate.perSec) : null;
  const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, "0")} s` : `${s} s`);

  const portalState: "idle" | "running" | "done" | "failed" = progress?.portal
    ? progress.portal.installed
      ? "done"
      : "failed"
    : status === "running" && phaseKey === "walledGarden"
      ? "running"
      : "idle";

  return (
    <section className={`rl-root is-${status} mt-3`} aria-live="polite">
      <div className="rl-grid">
        <Device name={source.name} model={source.model} side="source" active={running} />

        <div className="rl-lane">
          {/* Convoi de paquets entre les deux boîtiers, uniquement tant que ça écrit. */}
          <svg className="rl-wire" viewBox="0 0 240 24" aria-hidden="true">
            <path d="M 4 12 L 236 12" stroke="var(--line-soft)" strokeWidth="2" fill="none" />
            <path d="M 236 12 l -8 -5 l 0 10 z" fill={running ? "var(--brand)" : "var(--line-soft)"} />
            {running &&
              [0, 0.55, 1.1].map((delay) => (
                <rect
                  key={delay}
                  className="iso-packet"
                  width="8"
                  height="8"
                  x={-4}
                  y={-4}
                  rx="2"
                  fill="var(--brand)"
                  stroke="var(--ink)"
                  strokeWidth="1.5"
                  style={{ offsetPath: "path('M 4 12 L 236 12')", animationDuration: "1.7s", animationDelay: `${delay}s` }}
                />
              ))}
          </svg>

          <div className="rl-counters">
            <Counter label="Profils" done={doneOf("hotspotUserProfiles")} total={profilesTotal} state={stateOf("hotspotUserProfiles", 1)} />
            <Counter label="Tickets" done={ticketsDone} total={ticketsTotal} state={stateOf("hotspotUsers", 3)} />
            {salesTotal > 0 && (
              <Counter label="Recettes MikHmon" done={salesDone} total={salesTotal} state={stateOf("mikhmonSales", 6)} />
            )}
            <div className={`rl-counter is-${portalState}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-soft">Portail captif</span>
                <span className="text-sm text-ink">
                  {portalState === "done"
                    ? progress?.portal?.templateName ?? "réinstallé"
                    : portalState === "failed"
                      ? "échec"
                      : portalState === "running"
                        ? "installation…"
                        : "en attente"}
                </span>
              </div>
              <div className="rl-track"><span className="rl-fill" style={{ width: portalState === "done" ? "100%" : portalState === "running" ? "60%" : "0%" }} /></div>
            </div>
          </div>
        </div>

        <Device name={target.name} model={target.model} side="target" active={running} />
      </div>

      {/* Fil des étapes : un point par phase, celui en cours respire. */}
      <ol className="rl-steps" aria-label="Étapes de la restauration">
        {PHASES.map((p, i) => {
          const s = i < phaseIdx ? "done" : i === phaseIdx && running ? "running" : "idle";
          return (
            <li key={p.key} className={`is-${s}`}>
              <span className="rl-dot" aria-hidden="true">{s === "done" && <Check className="h-2.5 w-2.5" strokeWidth={3} />}</span>
              <span>{p.label}</span>
            </li>
          );
        })}
      </ol>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs text-ink-soft">
          {running ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin text-brand-deep" />
              <span>
                {PHASES[Math.min(phaseIdx, PHASES.length - 1)].label} en cours · {fmt(elapsed)} écoulées
                {rate && longTotal > 0 && (
                  <> · {rate.perSec.toFixed(1)}/s{eta !== null && eta > 0 && <> · reste ≈ {fmt(eta)}</>}</>
                )}
              </span>
            </>
          ) : status === "done" ? (
            <span className="font-medium text-ok">Restauration terminée en {fmt(elapsed)}.</span>
          ) : status === "cancelled" ? (
            <span className="font-medium text-warn">Arrêtée par l&apos;opérateur — ce qui est passé reste sur le rechange.</span>
          ) : (
            <span className="font-medium text-err">Interrompue — voir le détail ci-dessous.</span>
          )}
        </p>
        {running && (
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-semibold text-err hover:border-err disabled:opacity-60"
          >
            <Ban className="h-3.5 w-3.5" />
            {cancelling ? "Arrêt en cours…" : "Annuler la restauration"}
          </button>
        )}
      </div>
    </section>
  );
}
