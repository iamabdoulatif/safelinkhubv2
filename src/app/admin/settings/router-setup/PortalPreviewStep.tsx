"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Loader2, Users, WifiOff, XCircle } from "lucide-react";
import { testHotspotConfig } from "@/lib/mikrotik/bridges";

type Bridge = { id: string; name: string; hotspotEnabled: boolean };

type BridgeResult =
  | { state: "testing" }
  | { state: "error"; error: string }
  | {
      state: "done";
      running: boolean;
      message?: string;
      gatewayIp?: string;
      hotspotAddress?: string;
      activeUsers?: number;
    };

export default function PortalPreviewStep({
  bridges,
  onBack,
}: {
  bridges: Bridge[];
  onBack: () => void;
}) {
  const hotspotBridges = bridges.filter((b) => b.hotspotEnabled);
  const [results, setResults] = useState<Record<string, BridgeResult>>({});

  const runTests = useCallback(async () => {
    for (const bridge of hotspotBridges) {
      setResults((prev) => ({ ...prev, [bridge.id]: { state: "testing" } }));
      const result = await testHotspotConfig(bridge.id);
      setResults((prev) => ({
        ...prev,
        [bridge.id]:
          result && "error" in result && result.error
            ? { state: "error", error: result.error }
            : {
                state: "done",
                running: Boolean(result?.running),
                message: result?.message,
                gatewayIp: result?.gatewayIp,
                hotspotAddress: result?.hotspotAddress,
                activeUsers: result?.activeUsers,
              },
      }));
    }
  }, [hotspotBridges]);

  useEffect(() => {
    runTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mt-8 rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="font-semibold text-slate-900">
        Étape 4 : Aperçu et test du portail captif
      </h2>
      <p className="mt-1 text-sm text-slate-500">
        Vérification que le portail captif (hotspot) est bien actif sur
        chaque bridge où il a été configuré.
      </p>

      {hotspotBridges.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-700">
          <WifiOff className="h-4 w-4 shrink-0" />
          Aucun bridge n'a le hotspot activé. Retournez à l'étape 2 pour en
          configurer un si vous souhaitez utiliser le portail captif.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {hotspotBridges.map((bridge) => {
            const result = results[bridge.id];
            return (
              <div
                key={bridge.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-slate-700">{bridge.name}</p>
                  {result?.state === "done" && (
                    <p className="mt-0.5 text-xs text-slate-500">
                      {result.message ??
                        `Passerelle ${result.gatewayIp} · adresse hotspot ${result.hotspotAddress}`}
                    </p>
                  )}
                  {result?.state === "error" && (
                    <p className="mt-0.5 text-xs text-red-600">{result.error}</p>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {result?.state === "done" && result.running && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Users className="h-3.5 w-3.5" />
                      {result.activeUsers ?? 0} connecté(s)
                    </span>
                  )}

                  {!result || result.state === "testing" ? (
                    <span className="flex items-center gap-1.5 text-sm text-slate-400">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Test...
                    </span>
                  ) : result.state === "error" || !result.running ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                      <XCircle className="h-4 w-4" />
                      Inactif
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                      <CheckCircle2 className="h-4 w-4" />
                      Actif
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-8 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
        >
          Retour
        </button>
        {hotspotBridges.length > 0 && (
          <button
            type="button"
            onClick={runTests}
            className="rounded-lg border border-slate-300 px-5 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50"
          >
            Tester à nouveau
          </button>
        )}
        <a
          href="/admin/router"
          className="rounded-lg bg-emerald-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Terminé — Aller au tableau de bord
        </a>
      </div>
    </div>
  );
}
