"use client";

import { useEffect, useRef, useState } from "react";
import FancyLoader from "@/components/FancyLoader";
import TopologyBuilder from "./TopologyBuilder";
import AutoSetupStep from "./AutoSetupStep";
import AutoSetupInstallStep from "./AutoSetupInstallStep";
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
// 2 = topologie, 3 = configuration automatique, 4 = installation (lancement
// automatique — c'est là que le retour de paiement GeniusPay atterrit).
type Step = 2 | 3 | 4;

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
  // l'auto-setup là où l'admin s'était arrêté. "?etape=4" : retour de
  // paiement GeniusPay — l'installation démarre sans nouveau clic.
  initialStep?: Step;
}) {
  const [step, setStep] = useState<Step>(
    initialBridges.length > 0 && (initialStep === 3 || initialStep === 4) ? initialStep : 2,
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
        steps={[1, 2, 3, 4]}
        currentStep={step}
        // Navigation libre entre les étapes 2 (topologie) et 3 (auto-config) —
        // les données de chaque étape survivent (bridges en DB, champs de
        // l'étape 3 en sessionStorage). L'étape 1 (connexion) reste passée et
        // l'étape 4 (installation) ne se visite qu'en lançant — jamais à la
        // main, pour ne pas réinstaller par accident.
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
            {direction === "back"
              ? step === 4
                ? "Retour à la configuration…"
                : "Retour à la topologie réseau…"
              : step === 3
                ? "Lancement de l'installation…"
                : "Préparation de la configuration automatique…"}
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
      ) : step === 3 ? (
        <div key="step-3" className="animate-slide-in-right">
          <AutoSetupStep
            onBack={() => goToStep(2)}
            onLaunch={() => goToStep(4)}
            routerId={routerId}
            hotspotBridge={hotspotBridge}
          />
        </div>
      ) : (
        <div key="step-4" className="animate-slide-in-right">
          <AutoSetupInstallStep
            onBack={() => goToStep(3)}
            routerId={routerId}
            hotspotBridge={hotspotBridge}
            savedHotspotNames={savedHotspotNames}
          />
        </div>
      )}
    </div>
  );
}
