"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, Users, WifiOff, XCircle } from "lucide-react";
import { testHotspotConfig } from "@/lib/mikrotik/bridges";
import ConfigAuditBanner from "./ConfigAuditBanner";
import type { ConfigAuditItem } from "@/lib/mikrotik/config-audit";

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
  routerId,
  bridges,
  onBack,
}: {
  routerId: string;
  bridges: Bridge[];
  onBack: () => void;
}) {
  const hotspotBridges = bridges.filter((b) => b.hotspotEnabled);
  const [results, setResults] = useState<Record<string, BridgeResult>>({});
  const [auditItems, setAuditItems] = useState<ConfigAuditItem[] | null>(null);
  const portalItem = auditItems?.find((item) => item.key === "portal");
  // "Terminé" used to be reachable even when the hotspot service tested as
  // "running" but the actual login.html upload had silently failed (the
  // exact bug this session's audit feature exists to catch) — block it
  // until the live portal-file check confirms "ok", or there's no portal
  // item at all (e.g. captive portal install was deliberately skipped).
  const portalBlocking = portalItem !== undefined && portalItem.status !== "ok";

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
    // runTests makes network calls to verify each hotspot bridge; there is
    // no render-time equivalent for "test the portal config on mount".
    // eslint-disable-next-line react-hooks/set-state-in-effect
    runTests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="animate-fade-slide-up mt-8 border-2 border-line bg-paper p-6">
      <h2 className="font-semibold text-ink">
        Étape 9 : Aperçu et test du portail captif
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        Vérification que le portail captif (hotspot) est bien actif sur
        chaque bridge où il a été configuré.
      </p>

      {hotspotBridges.length === 0 ? (
        <div className="mt-6 flex items-center gap-2 rounded-md bg-clay px-4 py-3 text-sm text-warn">
          <WifiOff className="h-4 w-4 shrink-0" />
          Aucun bridge n&apos;a le hotspot activé. Retournez à l&apos;étape 2 pour en
          configurer un si vous souhaitez utiliser le portail captif.
        </div>
      ) : (
        <div className="mt-6 space-y-3">
          {hotspotBridges.map((bridge) => {
            const result = results[bridge.id];
            return (
              <div
                key={bridge.id}
                className="flex items-center justify-between rounded-lg border border-line-soft px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{bridge.name}</p>
                  {result?.state === "done" && (
                    <p className="mt-0.5 text-xs text-ink-soft">
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
                    <span className="flex items-center gap-1 text-xs text-ink-soft">
                      <Users className="h-3.5 w-3.5" />
                      {result.activeUsers ?? 0} connecté(s)
                    </span>
                  )}

                  {!result || result.state === "testing" ? (
                    <span className="flex items-center gap-1.5 text-sm text-ink-soft">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Test...
                    </span>
                  ) : result.state === "error" || !result.running ? (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-red-600">
                      <XCircle className="h-4 w-4" />
                      Inactif
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-sm font-medium text-ok">
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

      <div className="mt-6">
        <p className="mb-2 text-xs font-medium text-ink-soft">
          Vérification en direct du portail captif sur le routeur :
        </p>
        <ConfigAuditBanner routerId={routerId} onItemsChange={setAuditItems} />
      </div>

      {portalBlocking && (
        <p className="mt-2 flex items-center gap-1.5 rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Le portail captif n&apos;est pas confirmé installé sur le routeur (voir le détail
          ci-dessus) — le bouton &quot;Terminé&quot; reste désactivé tant que ce n&apos;est pas
          résolu, pour éviter de quitter l&apos;assistant en pensant que le portail est prêt
          alors qu&apos;il ne l&apos;est pas.
        </p>
      )}

      <div className="mt-4 flex items-center justify-center gap-3">
        <button
          type="button"
          onClick={onBack}
          className="rounded-lg border border-line-soft px-5 py-2.5 text-sm font-medium text-ink-soft hover:bg-clay"
        >
          Retour
        </button>
        {hotspotBridges.length > 0 && (
          <button
            type="button"
            onClick={runTests}
            className="rounded-lg border border-line-soft px-5 py-2.5 text-sm font-medium text-ink-soft hover:bg-clay"
          >
            Tester à nouveau
          </button>
        )}
        {portalBlocking ? (
          <button
            type="button"
            disabled
            title="Le portail captif n'est pas confirmé installé sur le routeur"
            className="rounded-lg bg-line-soft px-5 py-2.5 text-sm font-medium text-white cursor-not-allowed"
          >
            Terminé — Aller au tableau de bord
          </button>
        ) : (
          <a
            href="/admin/router"
            className="rounded-lg bg-brand-deep px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-deep"
          >
            Terminé — Aller au tableau de bord
          </a>
        )}
      </div>
    </div>
  );
}
