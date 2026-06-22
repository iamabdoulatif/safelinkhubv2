"use client";

import { useState } from "react";
import TopologyBuilder from "./TopologyBuilder";
import ConnectionTestStep from "./ConnectionTestStep";
import PortalPreviewStep from "./PortalPreviewStep";
import RouterResetButton from "./RouterResetButton";

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
  const [step, setStep] = useState<2 | 3 | 4>(2);

  return (
    <div>
      <div className="mt-6 flex items-center justify-center gap-2">
        {[1, 2, 3, 4].map((n) => (
          <div
            key={n}
            className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-medium ${
              n <= step ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-400"
            }`}
          >
            {n}
          </div>
        ))}
      </div>

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
              Suivant : Tester la connexion
            </button>
          </div>
        </div>
      ) : step === 3 ? (
        <ConnectionTestStep
          routerId={routerId}
          routerName={routerName}
          onBack={() => setStep(2)}
          onNext={() => setStep(4)}
        />
      ) : (
        <PortalPreviewStep
          bridges={initialBridges}
          onBack={() => setStep(3)}
        />
      )}
    </div>
  );
}
