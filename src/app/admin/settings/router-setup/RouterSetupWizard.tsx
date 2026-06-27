"use client";

import { useState } from "react";
import TopologyBuilder from "./TopologyBuilder";
import AutoSetupSteps from "./AutoSetupSteps";
import ConnectionTestStep from "./ConnectionTestStep";
import PortalPreviewStep from "./PortalPreviewStep";
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

type Step = 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export default function RouterSetupWizard({
  routerId,
  routerName,
  initialBridges,
  savedHotspotNames,
}: {
  routerId: string;
  routerName: string;
  initialBridges: SavedBridge[];
  savedHotspotNames: { bridgeName: string | null; serverName: string | null };
}) {
  const [step, setStep] = useState<Step>(2);

  const hotspotBridge =
    initialBridges
      .filter((b) => b.hotspotEnabled)
      .map((b) => ({ gatewayIp: b.gatewayIp, subnetBits: b.subnetBits }))[0] ?? null;

  return (
    <div>
      <StepIndicator steps={[1, 2, 3, 4, 5, 6, 7, 8, 9]} currentStep={step} />

      {step === 2 ? (
        <div className="animate-fade-slide-up mt-8 rounded-xl border border-slate-200 bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900">
              Étape 2 : Topologie réseau
            </h2>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5 text-sm text-emerald-600">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
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
              onClick={() => setStep(3)}
              disabled={initialBridges.length === 0}
              title={
                initialBridges.length === 0
                  ? "Configurez au moins un bridge avant de continuer"
                  : undefined
              }
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Suivant : Configuration automatique
            </button>
          </div>
        </div>
      ) : step === 3 || step === 4 || step === 5 || step === 6 || step === 7 ? (
        <AutoSetupSteps
          step={step}
          onStepChange={setStep}
          routerId={routerId}
          hotspotBridge={hotspotBridge}
          savedHotspotNames={savedHotspotNames}
        />
      ) : step === 8 ? (
        <ConnectionTestStep
          routerId={routerId}
          routerName={routerName}
          onBack={() => setStep(7)}
          onNext={() => setStep(9)}
        />
      ) : (
        <PortalPreviewStep
          bridges={initialBridges}
          onBack={() => setStep(8)}
        />
      )}
    </div>
  );
}
