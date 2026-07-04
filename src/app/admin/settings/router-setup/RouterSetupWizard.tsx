"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import TopologyBuilder from "./TopologyBuilder";
import AutoSetupStep from "./AutoSetupStep";
import RouterResetButton from "./RouterResetButton";
import StepIndicator from "./StepIndicator";

type SavedBridge = {
  id: string;
  name: string;
  gatewayIp: string;
  subnetBits: number;
  ports: string[];
  hotspotEnabled: boolean;
};

// 1 = connexion (gérée par la page quand le routeur est hors ligne),
// 2 = topologie, 3 = configuration automatique complète.
type Step = 2 | 3;

// Durée du loader intermédiaire affiché entre deux étapes — juste assez
// long pour lire le libellé et laisser l'animation d'entrée respirer.
const STEP_TRANSITION_MS = 550;

export default function RouterSetupWizard({
  routerId,
  routerName,
  initialBridges,
  savedHotspotNames,
}: {
  routerId: string;
  routerName: string;
  initialBridges: SavedBridge[];
  savedHotspotNames: { serverName: string | null };
}) {
  const [step, setStep] = useState<Step>(2);
  const [direction, setDirection] = useState<"forward" | "back">("forward");
  const [transitioning, setTransitioning] = useState(false);
  const transitionTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (transitionTimer.current !== null) window.clearTimeout(transitionTimer.current);
    },
    [],
  );

  function goToStep(next: Step) {
    if (transitioning || next === step) return;
    setDirection(next > step ? "forward" : "back");
    setTransitioning(true);
    transitionTimer.current = window.setTimeout(() => {
      setStep(next);
      setTransitioning(false);
    }, STEP_TRANSITION_MS);
  }

  const hotspotBridge =
    initialBridges
      .filter((b) => b.hotspotEnabled)
      .map((b) => ({ gatewayIp: b.gatewayIp, subnetBits: b.subnetBits }))[0] ?? null;

  return (
    <div>
      <StepIndicator steps={[1, 2, 3]} currentStep={step} />

      {transitioning ? (
        <div className="animate-fade-in mt-8 flex min-h-[280px] flex-col items-center justify-center gap-3 border-2 border-line bg-paper p-6">
          <Loader2 className="h-8 w-8 animate-spin text-ink" />
          <p className="text-sm font-medium text-ink-soft">
            {direction === "forward"
              ? "Préparation de la configuration automatique…"
              : "Retour à la topologie réseau…"}
          </p>
        </div>
      ) : step === 2 ? (
        <div
          key="step-2"
          className={`${direction === "back" ? "animate-slide-in-left" : "animate-fade-slide-up"} mt-8 border-2 border-line bg-paper p-6`}
        >
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-ink">
              Étape 2 : Topologie réseau
            </h2>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-sm text-ok">
                <span className="relative h-2 w-2 rounded-full bg-ok animate-pulse-ring" />
                {routerName} connecté
              </span>
              <RouterResetButton
                routerId={routerId}
                label="Supprimer l'appareil"
                confirmLabel="Supprimer cet appareil et sa configuration"
              />
            </div>
          </div>

          <div className="mt-4">
            <TopologyBuilder routerId={routerId} initialBridges={initialBridges} />
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="button"
              onClick={() => goToStep(3)}
              disabled={initialBridges.length === 0}
              title={
                initialBridges.length === 0
                  ? "Configurez au moins un bridge avant de continuer"
                  : undefined
              }
              className="rounded-lg bg-ink px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#3A362F] disabled:cursor-not-allowed disabled:opacity-50"
            >
              Suivant : Configuration automatique
            </button>
          </div>
        </div>
      ) : (
        <div key="step-3" className="animate-slide-in-right">
          <AutoSetupStep
            onBack={() => goToStep(2)}
            routerId={routerId}
            hotspotBridge={hotspotBridge}
            savedHotspotNames={savedHotspotNames}
          />
        </div>
      )}
    </div>
  );
}
