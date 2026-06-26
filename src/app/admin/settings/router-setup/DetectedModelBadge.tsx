"use client";

import { useState, useTransition, useEffect } from "react";
import { Check, ChevronDown, Copy, Cpu, Loader2, RefreshCw, Unlock } from "lucide-react";
import {
  detectRouterModel,
  requestDeviceModeUnlock,
  type DetectedRouter,
} from "@/lib/mikrotik/device-detect";
import { architectureLabel } from "@/lib/mikrotik/device-catalog";

export default function DetectedModelBadge({
  routerId,
  onDetected,
}: {
  routerId: string;
  onDetected?: (detected: DetectedRouter) => void;
}) {
  const [state, setState] = useState<
    { loading: true } | { loading: false; detected?: DetectedRouter; error?: string }
  >({ loading: true });
  const [refreshing, setRefreshing] = useState(false);

  function runDetection(onComplete?: () => void) {
    detectRouterModel(routerId).then((res) => {
      if (res?.error) {
        setState({ loading: false, error: res.error });
      } else if (res?.detected) {
        setState({ loading: false, detected: res.detected });
        onDetected?.(res.detected);
      }
      onComplete?.();
    });
  }

  useEffect(() => {
    runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerId]);

  function refresh() {
    setRefreshing(true);
    runDetection(() => setRefreshing(false));
  }

  if (state.loading) {
    return (
      <p className="mt-4 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Détection du modèle de routeur...
      </p>
    );
  }

  if (state.error || !state.detected) {
    return null;
  }

  const { detected } = state;
  const archLabel = detected.architecture
    ? architectureLabel(detected.architecture)
    : detected.architectureName || "architecture inconnue";

  // Container needs BOTH the hardware to support it AND the device-mode
  // "container" flag turned on — that flag is off by default in every mode
  // except ROSE, even on capable hardware.
  const needsUnlock =
    detected.supportsContainers &&
    detected.deviceMode !== null &&
    detected.deviceMode !== "rose" &&
    detected.containerFeatureEnabled === false;

  return (
    <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-slate-400" />
        <span>
          Modèle détecté : <span className="font-medium text-slate-800">{detected.boardName || "inconnu"}</span>
          {" "}
          ({archLabel}, Wi-Fi{" "}
          {detected.dualBand ? "2,4 + 5 GHz" : detected.model?.wifiBands === "none" ? "aucune (filaire)" : "2,4 GHz seul"})
          {!detected.model && (
            <span className="text-amber-600">
              {" "}
              — absent du catalogue SafeLinkHub, mais les capacités ont été détectées
              directement sur l&apos;appareil (fiable malgré tout).
            </span>
          )}
          {detected.hasUsbStorage && (
            <span className="text-emerald-600"> · clé USB détectée</span>
          )}
        </span>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          title="Revérifier l'état du routeur"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-slate-500">
        <span>
          RouterOS {detected.routerosVersion || "version inconnue"}
          {detected.deviceMode && <> · Mode : {detected.deviceMode}</>}
          {detected.supportsContainers && detected.containerFeatureEnabled !== null && (
            <>
              {" "}
              · Container :{" "}
              {detected.containerFeatureEnabled && (
                <span className="text-emerald-600">activé</span>
              )}
            </>
          )}
        </span>
        {detected.supportsContainers && detected.containerFeatureEnabled === false && (
          <button
            type="button"
            onClick={() => {
              try {
                navigator.clipboard?.writeText(
                  "/system/device-mode/update mode=advanced container=yes",
                );
              } catch {
                // clipboard can fail (older browser, no HTTPS, denied
                // permission) — the command is still shown below for the
                // admin to copy by hand, so this is non-fatal.
              }
              document
                .getElementById("device-mode-unlock")
                ?.scrollIntoView({ behavior: "smooth", block: "center" });
            }}
            className="flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-200"
          >
            désactivé — copier la commande pour l&apos;activer
            <ChevronDown className="h-3 w-3" />
          </button>
        )}
      </p>

      {!detected.supportsContainers && (
        <p className="mt-2 text-amber-700">
          Cette architecture ({archLabel}) ne supporte pas RouterOS Container (réservé à ARM, ARM64
          et Tile) — l&apos;étape MikHmon sera automatiquement ignorée ; seul le hotspot/Wi-Fi sera
          configuré.
        </p>
      )}

      {needsUnlock && <DeviceModeUnlock routerId={routerId} />}
    </div>
  );
}

const UNLOCK_COMMAND = "/system/device-mode/update mode=advanced container=yes";

function DeviceModeUnlock({ routerId }: { routerId: string }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  function run() {
    setResult(null);
    startTransition(async () => {
      const res = await requestDeviceModeUnlock(routerId);
      setResult(res);
    });
  }

  function copyCommand() {
    navigator.clipboard.writeText(UNLOCK_COMMAND);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div id="device-mode-unlock" className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-amber-800">
      <p className="font-medium">
        Container désactivé par le mode RouterOS — le matériel le supporte, mais la fonctionnalité
        est verrouillée par défaut (vrai pour tous les modes sauf ROSE).
      </p>
      <p className="mt-1">
        Le déverrouillage nécessite une <span className="font-medium">confirmation physique</span> :
        appuyer sur le bouton reset de l&apos;appareil, ou le débrancher/rebrancher, dans les 5
        minutes suivant la demande. Aucun script — le nôtre ou un autre — ne peut contourner cette
        étape ; c&apos;est une protection volontaire de MikroTik contre un déverrouillage à distance
        non autorisé.
      </p>

      <p className="mt-2 text-xs font-medium text-amber-700">
        Option 1 — coller cette commande vous-même dans le terminal Winbox/SSH :
      </p>
      <div className="relative mt-1">
        <pre className="overflow-x-auto rounded-md bg-slate-900 px-3 py-2 pr-10 text-xs text-emerald-300">
          {UNLOCK_COMMAND}
        </pre>
        <button
          type="button"
          onClick={copyCommand}
          title="Copier la commande"
          className="absolute right-1.5 top-1.5 rounded-md bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      </div>

      {result?.error && <p className="mt-2 text-red-700">{result.error}</p>}
      {result?.success && <p className="mt-2 text-emerald-700">{result.message}</p>}

      <p className="mt-2 text-xs font-medium text-amber-700">
        Option 2 — laisser SafeLinkHub l&apos;envoyer pour vous :
      </p>
      <button
        type="button"
        disabled={pending}
        onClick={run}
        className="mt-1 flex items-center gap-2 rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 disabled:opacity-60"
      >
        {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
        {pending ? "Envoi de la demande..." : "Envoyer la demande de déverrouillage"}
      </button>
      <p className="mt-1 text-[11px] text-amber-600">
        Dans les deux cas, la confirmation physique reste obligatoire. Une fois confirmé, le
        routeur redémarre seul — attendez ~1 minute, puis cliquez sur l&apos;icône{" "}
        <RefreshCw className="inline h-3 w-3" /> en haut de cet encart pour revérifier l&apos;état
        sans recharger toute la page.
      </p>
    </div>
  );
}
