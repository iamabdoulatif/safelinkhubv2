"use client";

import { useState } from "react";
import type { DetectedRouter } from "@/lib/mikrotik/device-detect";
import DetectedModelBadge from "./DetectedModelBadge";
import WifiSetupCard from "./WifiSetupCard";
import ContainerSetupCard from "./ContainerSetupCard";

export default function AutoSetupExtras({ routerId }: { routerId: string }) {
  const [detected, setDetected] = useState<DetectedRouter | null>(null);

  // Container needs BOTH the hardware to support it (architecture) AND the
  // device-mode "container" flag to be on — that flag is off by default in
  // every mode except ROSE, even on capable hardware (see
  // DetectedModelBadge's unlock flow). Before detection resolves, assume
  // true so the form isn't disabled needlessly while we wait.
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
        supportsContainers={containerReady}
        containerBlockedReason={containerBlockedReason}
      />
    </>
  );
}
