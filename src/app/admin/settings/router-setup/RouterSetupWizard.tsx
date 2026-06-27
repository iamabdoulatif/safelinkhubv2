"use client";

import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import TopologyBuilder from "./TopologyBuilder";
import AutoSetupExtras from "./AutoSetupExtras";
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

export default function RouterSetupWizard({
  routerId,
  routerName,
  initialBridges,
}: {
  routerId: string;
  routerName: string;
  initialBridges: SavedBridge[];
}) {
  const [step, setStep] = useState<2 | 3 | 4 | 5>(2);

  const hotspotBridge =
    initialBridges
      .filter((b) => b.hotspotEnabled)
      .map((b) => ({ gatewayIp: b.gatewayIp, subnetBits: b.subnetBits }))[0] ?? null;

  return (
    <div>
      <StepIndicator steps={[1, 2, 3, 4, 5]} currentStep={step} />

      {step === 2 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
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
      ) : step === 3 ? (
        <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
          <h2 className="font-semibold text-slate-900">
            Étape 3 : Configuration automatique
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Détection du modèle, Wi-Fi, hotspot, portail captif et MikHmon — tout en un clic, à
            partir de l&apos;adresse IP du bridge configuré à l&apos;étape précédente.
          </p>

          <AutoSetupExtras routerId={routerId} hotspotBridge={hotspotBridge} />

          <div className="mt-6 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Précédent
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className="rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
            >
              Suivant : Tester la connexion
            </button>
          </div>
        </div>
      ) : step === 4 ? (
        <ConnectionTestStep
          routerId={routerId}
          routerName={routerName}
          onBack={() => setStep(3)}
          onNext={() => setStep(5)}
        />
      ) : (
        <PortalPreviewStep
          bridges={initialBridges}
          onBack={() => setStep(4)}
        />
      )}
    </div>
  );
}
