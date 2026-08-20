"use client";

import { useEffect, useRef, useState } from "react";
import FancyLoader from "@/components/FancyLoader";
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
  initialStep = 2,
}: {
  routerId: string;
  routerName: string;
  initialBridges: SavedBridge[];
  savedHotspotNames: { serverName: string | null };
  // "?etape=3" : revenir directement sur la configuration automatique —
  // utilisé par le retour d'import de portail captif pour reprendre
  // l'auto-setup là où l'admin s'était arrêté.
  initialStep?: Step;
}) {
  const [step, setStep] = useState<Step>(
    initialStep === 3 && initialBridges.length > 0 ? 3 : 2,
  );
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
      <StepIndicator
        steps={[1, 2, 3]}
        currentStep={step}
        // Navigation libre entre les étapes 2 (topologie) et 3 (auto-config) —
        // les données de chaque étape survivent (bridges en DB, champs de
        // l'étape 3 en sessionStorage). L'étape 1 (connexion) reste passée.
        // L'étape 3 n'est atteignable que si au moins un bridge existe.
        onStepClick={(s) => {
          if (s === 2 || s === 3) goToStep(s);
        }}
        clickableSteps={initialBridges.length > 0 ? [2, 3] : [2]}
      />

      {transitioning ? (
        <div className="animate-fade-in mt-6 sm:mt-8 flex min-h-[200px] sm:min-h-[280px] flex-col items-center justify-center gap-4 border border-line bg-paper p-4 sm:p-6 rounded-xl">
          <FancyLoader
            variant={direction === "forward" ? "wifi-signal" : "router-orbit"}
            size="lg"
            color="brand"
          />
          <p className="text-sm font-medium text-ink animate-pulse text-center px-4">
            {direction === "forward"
              ? "Préparation de la configuration automatique…"
              : "Retour à la topologie réseau…"}
          </p>
        </div>
      ) : step === 2 ? (
        <div
          key="step-2"
          className={`${direction === "back" ? "animate-slide-in-left" : "animate-fade-slide-up"} mt-6 sm:mt-8 border border-line bg-paper p-4 sm:p-6`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="font-display text-xl sm:text-2xl font-extrabold tracking-tight text-ink">
              Étape 2 : Topologie réseau
            </h2>
            <div className="flex flex-wrap items-center gap-2 sm:gap-4">
              <span className="flex items-center gap-1.5 text-xs sm:text-sm text-ok">
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
              className="w-full sm:w-auto rounded-lg bg-ink px-5 py-3 sm:py-2.5 text-sm font-medium text-white transition-colors hover:bg-slate-deep-line disabled:cursor-not-allowed disabled:opacity-50"
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
