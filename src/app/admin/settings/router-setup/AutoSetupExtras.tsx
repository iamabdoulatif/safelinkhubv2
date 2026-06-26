"use client";

import { useState } from "react";
import type { DetectedRouter } from "@/lib/mikrotik/device-detect";
import DetectedModelBadge from "./DetectedModelBadge";
import WifiSetupCard from "./WifiSetupCard";
import ContainerSetupCard from "./ContainerSetupCard";

export default function AutoSetupExtras({
  routerId,
  hotspotBridge,
}: {
  routerId: string;
  // The hotspot-enabled bridge's gateway IP/subnet, as configured in Étape
  // 2 (Topologie réseau / TopologyBuilder) — the auto-setup card below
  // reuses this instead of asking for the address a second time, so there's
  // a single source of truth for the hotspot's gateway IP.
  hotspotBridge: { gatewayIp: string; subnetBits: number } | null;
}) {
  const [detected, setDetected] = useState<DetectedRouter | null>(null);

  // Whether the hardware itself can run RouterOS Container — architecture
  // only, never changes across refreshes/detections for a given router.
  // This is what decides whether the whole MikHmon section (including the
  // "clé USB branchée" checkbox) renders at all; it must NOT depend on the
  // device-mode lock flag below, or the section visibly appears/disappears
  // every time that flag is (re-)read, which is confusing and was the
  // actual bug here — the lock state only changes whether MikHmon can run
  // yet, not whether the hardware is capable of it.
  const archSupportsContainers = detected?.supportsContainers ?? true;

  // Container needs BOTH the hardware to support it (architecture) AND the
  // device-mode "container" flag to be on — that flag is off by default in
  // every mode except ROSE, even on capable hardware (see
  // DetectedModelBadge's unlock flow). Used only to decide which warning
  // (if any) to show — never to hide the MikHmon section itself.
  const containerReady =
    detected === null
      ? true
      : detected.supportsContainers && detected.containerFeatureEnabled !== false;

  // Surfaced in ContainerSetupCard so the unlock command is visible right
  // where the admin clicks "Lancer l'auto-setup complet", not only further
  // down in DetectedModelBadge.
  const containerBlockedReason: "architecture" | "device-mode" | null =
    detected === null || containerReady
      ? null
      : !detected.supportsContainers
        ? "architecture"
        : "device-mode";

  return (
    <>
      <DetectedModelBadge routerId={routerId} onDetected={setDetected} />
      <WifiSetupCard routerId={routerId} dualBand={detected?.dualBand ?? true} />
      <ContainerSetupCard
        routerId={routerId}
        defaultHasUsbStorage={detected?.hasUsbStorage ?? false}
        supportsContainers={archSupportsContainers}
        containerBlockedReason={containerBlockedReason}
        requiresUsbForContainer={detected?.requiresUsbForContainer ?? false}
        hotspotBridge={hotspotBridge}
      />
    </>
  );
}
