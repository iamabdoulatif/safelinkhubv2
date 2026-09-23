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
import { ArrowLeft, Rocket, Split } from "lucide-react";
import { provisionHotspotStack } from "@/lib/mikrotik/container-setup";
import { getAutoSetupGateStatus } from "@/lib/billing/auto-setup-authorization-actions";
import { detectRouterModel, type DetectedRouter } from "@/lib/mikrotik/device-detect";
import { startDualWanAfterAutoSetup } from "@/lib/mikrotik/dualwan-actions";
import { STARLINK_PAIRS, starlinkPair, type DualWanForm } from "@/lib/mikrotik/dualwan-defaults";
import { getSerialUnlockStatus } from "@/lib/mikrotik/serial-unlock-actions";
import SerialUnlockRequestModal from "@/components/mikrotik/SerialUnlockRequestModal";
import FancyLoader from "@/components/FancyLoader";
import ConfigAuditBanner from "./ConfigAuditBanner";
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

  return (
    <div className="mt-6 sm:mt-8 border border-line bg-paper p-4 sm:p-6 rounded-xl">
      <div className="flex items-center gap-2">
        <Rocket className="h-5 w-5 shrink-0 text-ink" />
        <h2 className="font-display text-lg sm:text-xl font-extrabold tracking-tight text-ink">
          Étape 4 : Installation
        </h2>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft max-w-3xl">
        Plus rien à faire : la configuration saisie à l&apos;étape précédente s&apos;installe
        automatiquement sur le routeur dès que le paiement est confirmé.
      </p>

      {phase === "checking" && (
        <div className="mt-6 flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-md border border-line bg-paper p-8">
          <FancyLoader variant="wifi-signal" size="lg" color="brand" />
          <p className="text-center text-sm font-medium text-ink animate-pulse">
            Vérification du paiement et du matériel…
          </p>
        </div>
      )}

      {phase === "no-snapshot" && (
        <div className="mt-5 rounded-md border border-warn/30 bg-clay p-4 sm:p-5">
          <p className="text-sm font-medium text-warn">Aucune configuration en attente.</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Les paramètres saisis à l&apos;étape 3 sont introuvables dans ce navigateur (retour de
            paiement dans un autre onglet, ou étape jamais remplie). Revenez à la configuration,
            vérifiez le récapitulatif et relancez — rien n&apos;a été installé.
          </p>
        </div>
      )}

      {phase === "denied" && (
        <div className="mt-5 rounded-md border border-warn/30 bg-clay p-4 sm:p-5">
          <p className="text-sm font-medium text-warn">
            Paiement pas encore confirmé — nouvelle vérification automatique…
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Si vous venez de payer, la confirmation arrive dans quelques secondes et
            l&apos;installation démarre toute seule. Si vous avez annulé le paiement, revenez à
            l&apos;étape précédente pour réessayer.
          </p>
        </div>
      )}

      {phase === "running" && (
        <div className="mt-6 flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-md border border-line bg-paper p-8">
          <FancyLoader variant="router-orbit" size="lg" color="brand" />
          <p className="text-center text-sm font-medium text-ink animate-pulse">
            Configuration en cours sur le routeur…
          </p>
          <p className="text-center text-xs text-ink-soft">
            Hotspot, portail captif, profils voucher et règles NAT sont en cours de déploiement.
            Ne fermez pas cette page.
          </p>
        </div>
      )}

      {phase === "done" && result?.error && (
        <div className="mt-4 rounded-md bg-err-soft px-3 py-2 text-sm text-err">
          <p>{result.error}</p>
          {result.serialLocked && result.serial && (
            <button
              type="button"
              onClick={async () => {
                const serial = result.serial!;
                const status = await getSerialUnlockStatus(serial).catch(() => ({
                  latestStatus: null,
                }));
                setUnlockModal({ serial, latestStatus: status.latestStatus });
              }}
              className="mt-2 inline-flex items-center rounded-md bg-brand-deep px-3 py-1.5 text-xs font-medium text-white hover:opacity-90"
            >
              Demander le déblocage
            </button>
          )}
          {result.log && (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-err/80">
              {result.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
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

      {phase === "done" && result?.firmwareUpdating && (
        <p className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-warn">{result.message}</p>
      )}

      {phase === "done" && result?.success && (
        <div className="mt-4 rounded-md bg-clay px-3 py-2 text-sm text-ok">
          <p className="font-medium">
            {result.containerPending
              ? "Configuration appliquée. MikHmon continue de se télécharger sur le routeur ; vérifiez son état dans une minute."
              : "Configuration appliquée. Le routeur redémarre — patientez ~1 minute avant de joindre le portail."}
          </p>
          {result.log && (
            <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-ok/80">
              {result.log.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Suivi du dual-WAN enchaîné (choix fait à l'étape 3). */}
      {phase === "done" && result?.success && dualStatus && (
        <div className="mt-4 rounded-md border border-line-soft bg-paper p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Split className="h-4 w-4 shrink-0" />
            Dual WAN — {starlinkPair(dualStatus.cas)?.label ?? "PCC"} (
            {starlinkPair(dualStatus.cas)?.ratio ?? "PCC"})
          </p>
          {dualStatus.phase === "running" && (
            <p className="mt-1.5 flex items-center gap-2 text-sm text-ink-soft">
              <FancyLoader variant="spinner-slice" size="sm" color="brand" className="inline-flex" />
              Envoi de la répartition PCC au routeur…
            </p>
          )}
          {dualStatus.phase === "started" && (
            <p className="mt-1.5 text-sm text-ok">
              Répartition PCC lancée — suivez son application dans la fiche routeur, onglet{" "}
              <Link href={`/admin/router/${routerId}?tab=services`} className="font-medium underline">
                Configurer les services
              </Link>
              .
            </p>
          )}
          {dualStatus.phase === "error" && (
            <p className="mt-1.5 text-sm text-warn">
              Le dual WAN n&apos;a pas pu démarrer automatiquement : {dualStatus.message} Vous
              pourrez le lancer depuis la fiche routeur, onglet{" "}
              <Link href={`/admin/router/${routerId}?tab=services`} className="font-medium underline">
                Configurer les services
              </Link>
              .
            </p>
          )}
        </div>
      )}

      {/* Sur une carte sans conteneur, le parcours ne se termine pas à
          l'auto-setup : son MikHmon reste à créer, sur le relais. */}
      {phase === "done" && result?.success && !archSupportsContainers && (
        <MikhmonCloudOutcome routerId={routerId} />
      )}

      {phase === "done" && result?.success && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-medium text-ink-soft">
            Vérification en direct sur le routeur (relisez l&apos;état réel une fois qu&apos;il
            a redémarré, avec le bouton « Réessayer » si besoin) :
          </p>
          <ConfigAuditBanner routerId={routerId} />
        </div>
      )}

      {(phase === "no-snapshot" || phase === "denied" || phase === "done") && (
        <div className="mt-6 flex justify-start">
          <button
            type="button"
            onClick={onBack}
            className="flex items-center justify-center gap-1.5 rounded-lg border border-line-soft px-4 py-3 sm:py-2.5 text-sm font-medium text-ink-soft hover:bg-clay transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour à la configuration
          </button>
        </div>
      )}
    </div>
  );
}
