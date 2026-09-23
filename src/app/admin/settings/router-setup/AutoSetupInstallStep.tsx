"use client";

/**
 * Étape 4 : Installation. Écran dédié au LANCEMENT de l'auto-setup, séparé du
 * formulaire de l'étape 3 pour que le retour de paiement (GeniusPay renvoie
 * vers ?etape=4) n'ait plus rien à re-saisir ni à re-cliquer : au montage,
 * l'écran restaure l'instantané sessionStorage écrit par l'étape 3, vérifie
 * que la porte de monétisation est passée (paiement confirmé, superadmin ou
 * solde), puis appelle provisionHotspotStack TOUT SEUL.
 *
 * Trois garde-fous plutôt qu'un lancement à l'aveugle :
 * - pas d'instantané (retour dans un autre onglet/navigateur) → message clair
 *   et bouton retour, jamais une config par défaut installée en silence ;
 * - paiement pas encore confirmé (webhook en retard, ou checkout annulé) →
 *   re-vérification automatique toutes les 5 s pendant ~30 s, puis bouton
 *   retour vers l'étape 3 pour repayer ;
 * - le serveur revérifie de toute façon (needsAuthorization) — l'UI n'est
 *   qu'un raccourci.
 *
 * Si l'admin a choisi « Dual-WAN » à l'étape 3, la configuration dual-WAN
 * (PCC + failover, via n8n) est enchaînée automatiquement après le succès du
 * hotspot — sans attendre un second clic. Le prérequis SSH distant n'étant
 * pas toujours actif à ce stade, un échec est affiché avec le lien vers
 * l'onglet « Configurer les services » plutôt que de bloquer le parcours.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Box,
  Check,
  Clock,
  Network,
  Power,
  Router as RouterIcon,
  Server,
  Split,
  Ticket,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import { provisionHotspotStack } from "@/lib/mikrotik/container-setup";
import { getAutoSetupGateStatus } from "@/lib/billing/auto-setup-authorization-actions";
import { detectRouterModel, type DetectedRouter } from "@/lib/mikrotik/device-detect";
import { startDualWanAfterAutoSetup } from "@/lib/mikrotik/dualwan-actions";
import { STARLINK_PAIRS, starlinkPair, type DualWanForm } from "@/lib/mikrotik/dualwan-defaults";
import { getSerialUnlockStatus } from "@/lib/mikrotik/serial-unlock-actions";
import SerialUnlockRequestModal from "@/components/mikrotik/SerialUnlockRequestModal";
import ConfigAuditBanner from "./ConfigAuditBanner";
import { formatElapsed, summarizeSetupLog } from "./setup-log";
import MikhmonCloudOutcome from "./MikhmonCloudOutcome";
import {
  classForPrefix,
  CLASS_DEFAULT_PREFIX,
  CLASS_PREFIX_OPTIONS,
  GATEWAY_IP_PRESETS,
} from "@/lib/net/subnet";
import type { VoucherProfile } from "@/lib/mikrotik/voucher-profiles";

// Même clé que l'étape 3 : c'est elle qui écrit l'instantané avant le
// checkout, c'est ici qu'on le lit au retour.
type Snapshot = {
  hotspotName?: string;
  ssid?: string;
  dnsName?: string;
  hasUsbStorage?: boolean;
  skipMikhmon?: boolean;
  installCaptivePortal?: boolean;
  adminPortalUser?: string;
  adminPortalPassword?: string;
  selectedTemplateId?: string;
  selectedTemplateName?: string | null;
  customProfiles?: VoucherProfile[];
  customProfileMeta?: {
    name: string;
    priceCents: number;
    durationValue: number;
    durationUnit: string;
    uploadMbps?: number;
    downloadMbps?: number;
  }[];
  portalSupportWhatsapp?: string;
  portalSupportPhone?: string;
  portalVendors?: { name: string; location: string; phone: string }[];
  wanMode?: "uni" | "dual";
  starlinkCas?: DualWanForm["cas"];
};

type Phase = "checking" | "no-snapshot" | "denied" | "running" | "done";

type RunResult = {
  success?: boolean;
  error?: string;
  log?: string[];
  firmwareUpdating?: boolean;
  message?: string;
  containerPending?: boolean;
  serialLocked?: boolean;
  serial?: string | null;
};

// Le webhook GeniusPay peut arriver quelques secondes APRÈS la redirection :
// on re-vérifie la porte pendant ~30 s avant de conclure à un paiement manqué.
const GATE_RECHECK_INTERVAL_MS = 5000;
const GATE_RECHECK_MAX = 6;

export default function AutoSetupInstallStep({
  onBack,
  routerId,
  hotspotBridge,
  savedHotspotNames,
}: {
  onBack: () => void;
  routerId: string;
  hotspotBridge: { gatewayIp: string; subnetBits: number } | null;
  savedHotspotNames: { serverName: string | null };
}) {
  const [phase, setPhase] = useState<Phase>("checking");
  // Les paramètres lus dans l'instantané sont gardés pour être AFFICHÉS
  // pendant l'installation : l'attente montre ce qui est en train d'être posé.
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [finishedAt, setFinishedAt] = useState<number | null>(null);
  const [detected, setDetected] = useState<DetectedRouter | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [dualStatus, setDualStatus] = useState<
    | { phase: "running"; cas: DualWanForm["cas"] }
    | { phase: "started"; cas: DualWanForm["cas"] }
    | { phase: "error"; message: string; cas: DualWanForm["cas"] }
    | null
  >(null);
  const [unlockModal, setUnlockModal] = useState<{
    serial: string;
    latestStatus: string | null;
  } | null>(null);

  const persistKey = `slh:autosetup:${routerId}`;
  const startedRef = useRef(false);

  // Réseau du hotspot : dérivé du bridge de l'étape 2 (même règle que
  // l'étape 3 — l'étape 2 reste la seule source de vérité).
  const savedPrefixBits = hotspotBridge?.subnetBits ?? 24;
  const initialClass = classForPrefix(savedPrefixBits);
  const hotspotAddress =
    hotspotBridge?.gatewayIp && hotspotBridge.gatewayIp !== "Not configured"
      ? hotspotBridge.gatewayIp
      : GATEWAY_IP_PRESETS[0];
  const hotspotPrefixBits = CLASS_PREFIX_OPTIONS[initialClass].includes(savedPrefixBits)
    ? savedPrefixBits
    : CLASS_DEFAULT_PREFIX[initialClass];

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;
    let recheckTimer: number | null = null;

    function readSnapshot(): Snapshot | null {
      try {
        const raw = sessionStorage.getItem(persistKey);
        return raw ? (JSON.parse(raw) as Snapshot) : null;
      } catch {
        return null;
      }
    }

    function clearSnapshot() {
      try {
        sessionStorage.removeItem(persistKey);
      } catch {
        /* best-effort */
      }
    }

    async function launch(snapshot: Snapshot, device: DetectedRouter | null) {
      if (cancelled) return;
      setStartedAt(Date.now());
      setFinishedAt(null);
      setPhase("running");
      const hasWifi = device?.hasWifi ?? true;
      const archSupportsContainers = device?.supportsContainers ?? true;
      const mikhmonIncluded = archSupportsContainers && !snapshot.skipMikhmon;
      const installCaptivePortal = snapshot.installCaptivePortal !== false;

      const res = await provisionHotspotStack(routerId, {
        hotspotAddress,
        hotspotPrefixBits,
        hotspotName: snapshot.hotspotName ?? "",
        dnsName: snapshot.dnsName ?? "",
        ssid: hasWifi ? snapshot.ssid?.trim() || undefined : undefined,
        defaultHotspotUsers: snapshot.adminPortalUser?.trim()
          ? [
              {
                name: snapshot.adminPortalUser.trim(),
                password: snapshot.adminPortalPassword?.trim() || undefined,
              },
            ]
          : [],
        hasUsbStorage: snapshot.hasUsbStorage ?? false,
        hasLargeOnboardStorage: device?.hasLargeOnboardStorage ?? false,
        hasEmmcStorage: device?.hasEmmcStorage ?? false,
        routerSupportsContainers: device?.supportsContainers,
        supportsContainers: mikhmonIncluded,
        reboot: true,
        voucherProfiles: snapshot.customProfiles ?? [],
        packagesToSync: snapshot.customProfileMeta ?? [],
        portalSupportWhatsapp: snapshot.portalSupportWhatsapp?.trim() ?? "",
        portalSupportPhone: snapshot.portalSupportPhone?.trim() ?? "",
        portalVendors: snapshot.portalVendors ?? [],
        installCaptivePortal,
        captiveTemplateId: installCaptivePortal
          ? (snapshot.selectedTemplateId ?? undefined)
          : undefined,
        serverName: savedHotspotNames.serverName ?? undefined,
      });
      if (cancelled) return;

      // Verrou serveur : autorisation expirée/consommée entre-temps → on
      // repasse en attente de paiement plutôt qu'en erreur brute.
      if (res && "needsAuthorization" in res && res.needsAuthorization) {
        waitForAuthorization(snapshot, device);
        return;
      }

      setResult(res);
      setFinishedAt(Date.now());
      setPhase("done");
      if (!res?.success) return;

      clearSnapshot();

      // Choix « dual WAN » de l'étape 3 : on enchaîne sans attendre — la
      // répartition PCC part vers n8n dès que le hotspot est posé. L'option
      // étant payante, le serveur revérifie qu'elle figure bien dans le
      // montant réglé (le superadmin en est exempté).
      if (snapshot.wanMode === "dual") {
        const cas = STARLINK_PAIRS.find((p) => p.cas === snapshot.starlinkCas)?.cas ?? "cas1";
        setDualStatus({ phase: "running", cas });
        const dw = await startDualWanAfterAutoSetup(routerId, cas);
        if (cancelled) return;
        setDualStatus(
          "error" in dw
            ? { phase: "error", message: dw.error ?? "cause inconnue.", cas }
            : { phase: "started", cas },
        );
      }
    }

    // Paiement pas (encore) confirmé : re-vérification automatique — le
    // webhook GeniusPay débloque la porte avec quelques secondes de retard
    // sur la redirection, et l'installation démarre alors toute seule.
    function waitForAuthorization(snapshot: Snapshot, device: DetectedRouter | null) {
      setPhase("denied");
      let attempts = 0;
      recheckTimer = window.setInterval(() => {
        attempts += 1;
        if (attempts > GATE_RECHECK_MAX || cancelled) {
          if (recheckTimer !== null) window.clearInterval(recheckTimer);
          return;
        }
        getAutoSetupGateStatus(routerId).then((g) => {
          if (cancelled) return;
          if (g.superadmin || g.authorized) {
            if (recheckTimer !== null) window.clearInterval(recheckTimer);
            void launch(snapshot, device);
          }
        });
      }, GATE_RECHECK_INTERVAL_MS);
    }

    async function boot() {
      const snapshot = readSnapshot();
      setSnap(snapshot);
      // Rien à installer : retour dans un autre onglet/navigateur, ou étape 3
      // jamais passée. On ne lance JAMAIS une config par défaut en silence.
      if (!snapshot || !snapshot.hotspotName?.trim() || !hotspotBridge) {
        setPhase("no-snapshot");
        return;
      }
      const [detection, gate] = await Promise.all([
        detectRouterModel(routerId),
        getAutoSetupGateStatus(routerId),
      ]);
      if (cancelled) return;
      const device = detection?.detected ?? null;
      setDetected(device);
      if (!gate.superadmin && !gate.authorized) {
        waitForAuthorization(snapshot, device);
        return;
      }
      await launch(snapshot, device);
    }

    void boot();

    return () => {
      cancelled = true;
      if (recheckTimer !== null) window.clearInterval(recheckTimer);
    };
    // routerId/hotspotBridge stables pour la durée de vie du composant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerId]);

  const archSupportsContainers = detected?.supportsContainers ?? true;
  const hasWifi = detected?.hasWifi ?? true;
  const mikhmonIncluded = archSupportsContainers && !snap?.skipMikhmon;
  const installCaptivePortal = snap?.installCaptivePortal !== false;
  const summary = summarizeSetupLog(result?.log);
  const succeeded = phase === "done" && Boolean(result?.success);
  const failed = phase === "done" && Boolean(result?.error);

  const now = useTicker(phase === "running");
  const elapsed =
    startedAt === null ? null : formatElapsed(((finishedAt ?? now) - startedAt) / 1000);

  // Fermer l'onglet pendant l'envoi coupe la réponse du serveur : l'opérateur
  // ne saurait plus si le routeur a été configuré. Le navigateur demande donc
  // confirmation, uniquement pendant l'installation.
  useEffect(() => {
    if (phase !== "running") return;
    const retenir = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", retenir);
    return () => window.removeEventListener("beforeunload", retenir);
  }, [phase]);

  const plan = snap
    ? buildPlan(snap, {
        gateway: `${hotspotAddress}/${hotspotPrefixBits}`,
        hasWifi,
        mikhmonIncluded,
        installCaptivePortal,
      })
    : [];
  const stepState: StepState = succeeded ? "ok" : "pending";
  const routerLabel = detected?.boardName ?? "Routeur";
  const dualPair = snap?.wanMode === "dual" ? starlinkPair(snap.starlinkCas ?? "cas1") : null;

  const backButton = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-line bg-paper px-4 text-sm font-semibold text-ink transition-colors hover:bg-clay"
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      Retour à la configuration
    </button>
  );

  return (
    <div className="mt-6 sm:mt-8">
      <h2 className="text-lg font-semibold tracking-tight text-ink">Étape 4 : Installation</h2>
      <p className="mt-1 max-w-3xl text-sm text-ink-soft">
        La configuration saisie à l&apos;étape précédente s&apos;installe automatiquement sur le
        routeur dès que le paiement est confirmé.
      </p>

      {phase === "no-snapshot" ? (
        <div className="mt-5 flex flex-col gap-4 rounded-xl border border-line bg-paper p-4 sm:p-6">
          <div role="alert" className="flex gap-3 rounded-xl border border-warn/30 bg-warn-soft p-4">
            <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-warn" />
            <div>
              <p className="text-sm font-semibold text-warn">Aucune configuration en attente.</p>
              <p className="mt-1 text-sm text-ink-soft">
                Les paramètres saisis à l&apos;étape 3 sont introuvables dans ce navigateur (retour
                de paiement dans un autre onglet, ou étape jamais remplie). Revenez à la
                configuration, vérifiez le récapitulatif et relancez — rien n&apos;a été installé.
              </p>
            </div>
          </div>
          <div>{backButton}</div>
        </div>
      ) : (
        <div className="mt-5 grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="flex min-w-0 flex-col gap-5 rounded-xl border border-line bg-paper p-4 sm:p-6">
            {/* ── En-tête d'état : une seule zone dit où l'on en est ───── */}
            <div className="flex flex-col gap-3 border-b border-line-soft pb-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                      succeeded ? "bg-ok-soft" : failed ? "bg-err-soft" : "bg-slate-deep"
                    }`}
                  >
                    {succeeded ? (
                      <Check className="h-5 w-5 text-ok" strokeWidth={2.5} />
                    ) : failed ? (
                      <X className="h-5 w-5 text-err" strokeWidth={2.5} />
                    ) : (
                      <RouterIcon className="h-5 w-5 text-brand" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-ink" aria-live="polite">
                      {phase === "checking" && "Vérification du paiement et du routeur"}
                      {phase === "denied" && "Paiement en attente de confirmation"}
                      {phase === "running" && "Installation en cours"}
                      {succeeded && "Configuration appliquée"}
                      {failed && "L’installation s’est arrêtée"}
                      {phase === "done" && !result?.success && !result?.error && "Installation interrompue"}
                    </p>
                    <p className="truncate text-sm text-ink-soft">
                      {succeeded
                        ? result?.containerPending
                          ? `${routerLabel} · MikHmon termine son téléchargement`
                          : `${routerLabel} redémarre · portail joignable dans ~1 min`
                        : routerLabel}
                    </p>
                  </div>
                </div>
                {elapsed && (
                  <span className="inline-flex items-center gap-1.5 text-sm font-semibold tabular-nums text-ink">
                    <Clock aria-hidden="true" className="h-4 w-4 text-ink-soft" />
                    {phase === "running" ? elapsed : `en ${elapsed}`}
                    <span className="sr-only">{phase === "running" ? " écoulées" : ""}</span>
                  </span>
                )}
              </div>

              {phase === "running" && (
                <>
                  <div
                    role="progressbar"
                    aria-label="Installation en cours"
                    aria-valuetext="En cours"
                    className="h-1.5 overflow-hidden rounded-full bg-line-soft"
                  >
                    <div className="progress-indeterminate h-full rounded-full bg-slate-deep" />
                  </div>
                  <p className="flex items-start gap-2 text-xs text-ink-soft">
                    <AlertTriangle aria-hidden="true" className="mt-px h-3.5 w-3.5 shrink-0" />
                    Gardez cette page ouverte. Le routeur confirme toutes les étapes en une fois, à
                    la fin, puis redémarre.
                  </p>
                </>
              )}

              {phase === "checking" && (
                <ul className="flex flex-col gap-2 text-sm">
                  <li className="flex items-center gap-3">
                    <StepIcon state="ok" />
                    Paramètres de l&apos;étape 3 retrouvés
                  </li>
                  <li className="flex items-center gap-3">
                    <StepIcon state="busy" />
                    Lecture du modèle de routeur…
                  </li>
                  <li className="flex items-center gap-3">
                    <StepIcon state="busy" />
                    Confirmation du paiement…
                  </li>
                </ul>
              )}

              {phase === "denied" && (
                <div className="rounded-xl border border-warn/30 bg-warn-soft p-4">
                  <p className="text-sm font-semibold text-warn">
                    Nouvelle vérification automatique toutes les 5 secondes.
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    Si vous venez de payer, la confirmation arrive dans quelques secondes et
                    l&apos;installation démarre toute seule. Rien n&apos;a encore été modifié sur le
                    routeur. Si vous avez annulé le paiement, revenez à l&apos;étape précédente.
                  </p>
                </div>
              )}

              {failed && (
                <div role="alert" className="flex gap-3 rounded-xl border border-err/30 bg-err-soft p-4">
                  <AlertTriangle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-err" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-err">{result?.error}</p>
                    {result?.serialLocked && result.serial && (
                      <button
                        type="button"
                        onClick={async () => {
                          const serial = result.serial!;
                          const status = await getSerialUnlockStatus(serial).catch(() => ({
                            latestStatus: null,
                          }));
                          setUnlockModal({ serial, latestStatus: status.latestStatus });
                        }}
                        className="mt-3 inline-flex h-8 items-center rounded-full bg-slate-deep px-3 text-xs font-semibold text-white hover:bg-slate-deep-line"
                      >
                        Demander le déblocage
                      </button>
                    )}
                  </div>
                </div>
              )}

              {phase === "done" && result?.firmwareUpdating && (
                <p className="rounded-xl border border-info/30 bg-info-soft p-4 text-sm text-info">
                  {result.message}
                </p>
              )}

              {phase === "done" && summary.failures.length > 0 && (
                <div className="rounded-xl border border-warn/30 bg-warn-soft p-4">
                  <p className="text-sm font-semibold text-warn">
                    {summary.failures.length === 1
                      ? "1 point à vérifier"
                      : `${summary.failures.length} points à vérifier`}
                  </p>
                  <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink-soft">
                    {summary.failures.map((f, i) => (
                      <li key={i}>
                        <span className="font-semibold text-ink">{f.label}</span> — {f.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* ── Le plan : chaque étape avec les valeurs qu'elle pose ──── */}
            {plan.length > 0 && (
              <div>
                <h3 className="sr-only">Ce qui s&apos;installe</h3>
                <ol className="flex flex-col">
                  {plan.map((step, i) => (
                    <li key={step.key} className="relative flex gap-4 pb-5 last:pb-0">
                      {i < plan.length - 1 && (
                        <span
                          aria-hidden="true"
                          className="absolute bottom-0 left-[8.25px] top-6 w-px bg-line-strong/50"
                        />
                      )}
                      <span className="relative mt-0.5">
                        <StepIcon state={stepState} />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col gap-2">
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                          <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                            <step.icon aria-hidden="true" className="h-4 w-4 text-brand-deep" />
                            {step.title}
                          </span>
                          <span className="text-xs text-ink-soft">{step.hint}</span>
                        </div>
                        {step.facts.length > 0 && (
                          <dl className="flex flex-wrap gap-1.5">
                            {step.facts.map((f) => (
                              <div
                                key={f.label}
                                className="flex max-w-full items-baseline gap-1.5 rounded-lg bg-clay px-2.5 py-1 text-[13px]"
                              >
                                <dt className="text-ink-soft">{f.label}</dt>
                                <dd className={`truncate font-semibold text-ink ${f.mono ? "font-mono" : ""}`}>
                                  {f.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {step.packages && (
                          <ul className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 xl:grid-cols-4">
                            {step.packages.map((p, j) => (
                              <li
                                key={`${p.name}-${j}`}
                                className="flex flex-col rounded-lg border border-line px-2.5 py-2 text-[13px]"
                              >
                                <span className="font-semibold text-ink">{p.name}</span>
                                <span className="tabular-nums text-ink">
                                  {p.price > 0 ? `${p.price.toLocaleString("fr-FR")} FCFA` : "Gratuit"}
                                </span>
                                {p.speed && <span className="text-xs text-ink-soft">{p.speed}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}

            {/* Sur une carte sans conteneur, le parcours ne se termine pas à
                l'auto-setup : son MikHmon reste à créer, sur le relais. */}
            {phase === "done" && result?.success && !archSupportsContainers && (
              <MikhmonCloudOutcome routerId={routerId} />
            )}

            {succeeded && (
              <div>
                <p className="mb-2 text-xs font-medium text-ink-soft">
                  Vérification en direct sur le routeur (relisez l&apos;état réel une fois qu&apos;il
                  a redémarré, avec le bouton « Réessayer » si besoin) :
                </p>
                <ConfigAuditBanner routerId={routerId} />
              </div>
            )}

            {phase === "done" && result?.log && result.log.length > 0 && (
              <details className="group rounded-xl border border-line">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-ink">
                  Journal technique · {result.log.length} lignes
                  <span className="text-xs font-medium text-ink-soft">pour le support</span>
                </summary>
                <ul className="max-h-64 space-y-0.5 overflow-y-auto border-t border-line-soft px-4 py-3 font-mono text-xs text-ink-soft">
                  {result.log.map((line, i) => (
                    <li key={i} className={line.startsWith("FAIL") ? "text-err" : undefined}>
                      {line}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </section>

          <aside className="flex flex-col gap-4">
            {succeeded && (
              <section className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-5">
                <h3 className="mb-1 text-sm font-semibold text-ink">Et maintenant</h3>
                <Link
                  href={`/admin/router/${routerId}`}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-brand-deep/20 bg-brand px-4 text-sm font-semibold text-ink hover:bg-brand/80"
                >
                  Ouvrir la fiche du routeur
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
                <Link
                  href="/admin/vouchers"
                  className="inline-flex h-10 items-center justify-center rounded-full border border-line bg-paper px-4 text-sm font-semibold text-ink hover:bg-clay"
                >
                  Générer des tickets
                </Link>
              </section>
            )}

            {/* Double WAN : annoncé AVANT (il fait partie de ce qui a été
                payé), puis suivi une fois enchaîné après le hotspot. */}
            {dualPair && (
              <section className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-5">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                  <Split aria-hidden="true" className="h-4 w-4 text-brand-deep" />
                  {dualStatus ? "Double WAN" : "Ensuite, automatiquement : double WAN"}
                </h3>
                <p className="text-xs text-ink-soft">
                  {dualPair.label} · répartition {dualPair.ratio}
                </p>
                {!dualStatus && !failed && (
                  <p className="text-sm text-ink-soft">Démarre dès que le hotspot est posé.</p>
                )}
                {dualStatus?.phase === "running" && (
                  <p className="flex items-center gap-2 text-sm text-ink-soft">
                    <StepIcon state="busy" />
                    Envoi de la répartition PCC au routeur…
                  </p>
                )}
                {dualStatus?.phase === "started" && (
                  <p className="text-sm text-ink-soft">
                    <span className="font-semibold text-ok">Répartition PCC lancée.</span> Suivez
                    son application dans la fiche routeur, onglet{" "}
                    <Link href={`/admin/router/${routerId}?tab=services`} className="font-semibold text-brand-deep underline">
                      Configurer les services
                    </Link>
                    .
                  </p>
                )}
                {dualStatus?.phase === "error" && (
                  <p className="text-sm text-warn">
                    Le double WAN n&apos;a pas pu démarrer automatiquement : {dualStatus.message}{" "}
                    Vous pourrez le lancer depuis la fiche routeur, onglet{" "}
                    <Link href={`/admin/router/${routerId}?tab=services`} className="font-semibold underline">
                      Configurer les services
                    </Link>
                    .
                  </p>
                )}
              </section>
            )}

            {(phase === "running" || phase === "checking") && (
              <section className="flex flex-col gap-2 rounded-xl border border-line bg-paper p-5">
                <h3 className="text-sm font-semibold text-ink">Pendant l&apos;attente</h3>
                <p className="text-sm text-ink-soft">
                  Rien à faire de votre côté. Une coupure du Wi-Fi est normale quand le routeur
                  redémarre à la fin.
                </p>
              </section>
            )}

            {failed && (
              <section className="flex flex-col gap-3 rounded-xl border border-line bg-paper p-5">
                <h3 className="text-sm font-semibold text-ink">Que faire</h3>
                <p className="text-sm text-ink-soft">
                  Corrigez le point signalé à l&apos;étape concernée, puis relancez. Le journal
                  technique ci-contre aide le support à diagnostiquer.
                </p>
                {backButton}
              </section>
            )}

            {(phase === "denied" || (phase === "done" && !failed)) && <div>{backButton}</div>}
          </aside>
        </div>
      )}

      {unlockModal && (
        <SerialUnlockRequestModal
          open
          serial={unlockModal.serial}
          routerId={routerId}
          latestStatus={unlockModal.latestStatus}
          onClose={() => setUnlockModal(null)}
        />
      )}
    </div>
  );
}

/* ── Plan d'installation ─────────────────────────────────────────────────── */

type StepState = "ok" | "pending" | "busy";

type PlanStep = {
  key: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  facts: { label: string; value: string; mono?: boolean }[];
  packages?: { name: string; price: number; speed: string | null }[];
};

/** Les étapes que provisionHotspotStack déroule, chacune avec les valeurs
 * saisies qu'elle pose. Seules les étapes réellement demandées apparaissent :
 * pas de ligne Wi-Fi sur une carte filaire, pas de portail s'il est décoché. */
function buildPlan(
  snap: Snapshot,
  o: { gateway: string; hasWifi: boolean; mikhmonIncluded: boolean; installCaptivePortal: boolean },
): PlanStep[] {
  const fact = (label: string, value: string | undefined | null, mono = false) =>
    value?.trim() ? [{ label, value: value.trim(), mono }] : [];
  const packages = (snap.customProfileMeta ?? []).map((p) => ({
    name: p.name,
    price: p.priceCents,
    speed:
      p.downloadMbps && p.uploadMbps ? `↓ ${p.downloadMbps} / ↑ ${p.uploadMbps} Mbit/s` : null,
  }));
  const vendors = snap.portalVendors?.filter((v) => v.name.trim()).length ?? 0;
  const ssid = snap.ssid?.trim();

  const steps: (PlanStep | false)[] = [
    {
      key: "network",
      icon: Network,
      title: "Réseau du hotspot",
      hint: "Bridge · DHCP · NAT",
      facts: [...fact("Nom", snap.hotspotName), ...fact("Passerelle", o.gateway, true)],
    },
    {
      key: "hotspot",
      icon: Server,
      title: "Serveur hotspot",
      hint: "Profil · walled-garden",
      facts: [...fact("DNS", snap.dnsName, true), ...fact("Admin portail", snap.adminPortalUser, true)],
    },
    o.hasWifi &&
      Boolean(ssid) && {
        key: "wifi",
        icon: Wifi,
        title: "Wi-Fi",
        hint: "Réseau diffusé",
        facts: fact("SSID", ssid, true),
      },
    packages.length > 0 && {
      key: "packages",
      icon: Ticket,
      title: packages.length === 1 ? "1 forfait" : `${packages.length} forfaits`,
      hint: "Profils voucher et prix",
      facts: [],
      packages,
    },
    {
      key: "portal",
      icon: RouterIcon,
      title: o.installCaptivePortal ? "Portail captif" : "Page de connexion RouterOS",
      hint: o.installCaptivePortal ? (snap.selectedTemplateName ?? "Portail par défaut") : "Sans portail SafeLinkHub",
      facts: o.installCaptivePortal
        ? [
            ...fact("WhatsApp", snap.portalSupportWhatsapp),
            ...fact("Téléphone", snap.portalSupportPhone),
            ...(vendors > 0 ? [{ label: "Points de vente", value: String(vendors) }] : []),
          ]
        : [],
    },
    o.mikhmonIncluded && {
      key: "mikhmon",
      icon: Box,
      title: "MikHmon",
      hint: "Conteneur",
      facts: [{ label: "Stockage", value: snap.hasUsbStorage ? "Clé USB" : "Mémoire interne" }],
    },
    {
      key: "reboot",
      icon: Power,
      title: "Redémarrage",
      hint: "~1 min après la fin",
      facts: [],
    },
  ];
  return steps.filter((s): s is PlanStep => Boolean(s));
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "ok") {
    return (
      <span className="flex h-[18px] w-[18px] items-center justify-center rounded-full bg-ok">
        <Check aria-hidden="true" className="h-3 w-3 text-white" strokeWidth={3} />
        <span className="sr-only">Appliqué</span>
      </span>
    );
  }
  if (state === "busy") {
    return (
      <span
        aria-hidden="true"
        className="block h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-line border-t-slate-deep motion-reduce:animate-none"
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className="block h-[18px] w-[18px] shrink-0 rounded-full border-[1.5px] border-dashed border-line-strong bg-paper"
    />
  );
}

/** Horloge d'une seconde, active seulement quand on l'affiche. */
function useTicker(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}
