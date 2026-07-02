"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Wrench, XCircle } from "lucide-react";
import { auditRouterConfig, type ConfigAuditItem } from "@/lib/mikrotik/config-audit";
import { repairRouterConfig } from "@/lib/mikrotik/container-setup";

const STATUS_STYLES: Record<ConfigAuditItem["status"], { icon: typeof CheckCircle2; pill: string; text: string }> = {
  ok: { icon: CheckCircle2, pill: "bg-clay text-ok", text: "text-ok" },
  incomplete: { icon: AlertTriangle, pill: "bg-clay text-warn", text: "text-warn" },
  missing: { icon: XCircle, pill: "bg-red-50 text-red-600", text: "text-red-600" },
};

/**
 * Reads the router's *live* state (not just SafeLinkHub's DB) so a device
 * that already had partial configuration before being connected here —
 * manually, or from an interrupted previous auto-setup run — gets called
 * out by name instead of silently looking fine.
 */
export default function ConfigAuditBanner({
  routerId,
  onItemsChange,
}: {
  routerId: string;
  // Lets a parent step gate its own "next/done" action on a specific item's
  // live status (e.g. "portal" must be "ok") without this banner needing to
  // know anything about that gating logic itself.
  onItemsChange?: (items: ConfigAuditItem[]) => void;
}) {
  const [state, setState] = useState<
    | { loading: true }
    | { loading: false; items?: ConfigAuditItem[]; canRepair?: boolean; error?: string }
  >({ loading: true });
  const [refreshing, setRefreshing] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairResult, setRepairResult] = useState<{
    success?: boolean;
    error?: string;
    log?: string[];
    firmwareUpdating?: boolean;
    message?: string;
  } | null>(null);

  function runAudit(onComplete?: () => void) {
    auditRouterConfig(routerId).then((res) => {
      if (res?.error) setState({ loading: false, error: res.error });
      else if (res?.items) {
        setState({ loading: false, items: res.items, canRepair: res.canRepair });
        onItemsChange?.(res.items);
      }
      onComplete?.();
    });
  }

  useEffect(() => {
    runAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routerId]);

  function refresh() {
    setRefreshing(true);
    runAudit(() => setRefreshing(false));
  }

  function repair() {
    setRepairing(true);
    setRepairResult(null);
    repairRouterConfig(routerId).then((res) => {
      setRepairResult(res);
      setRepairing(false);
      if (res && "success" in res && res.success) runAudit();
    });
  }

  if (state.loading) {
    return (
      <p className="mb-4 flex items-center gap-2 text-sm text-ink-soft">
        <Loader2 className="h-4 w-4 animate-spin" />
        Vérification de la configuration existante sur le routeur...
      </p>
    );
  }

  if (state.error || !state.items) {
    // Visible and retryable instead of silently disappearing — most
    // common right after the auto-setup's own reboot, while the router is
    // still coming back up and briefly unreachable.
    return state.error ? (
      <div className="mb-4 flex items-center justify-between gap-2 rounded-md bg-clay px-3 py-2 text-xs text-warn">
        <span>{state.error}</span>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          className="flex shrink-0 items-center gap-1 rounded-md border border-warn bg-paper px-2 py-1 font-medium hover:bg-clay disabled:opacity-50"
        >
          <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
          Réessayer
        </button>
      </div>
    ) : null;
  }

  const issues = state.items.filter((i) => i.status !== "ok");

  return (
    <div className="animate-fade-slide-up mb-4 rounded-md border border-line-soft bg-clay px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-ink-soft">
          Configuration détectée sur le routeur
          {issues.length === 0 && (
            <span className="ml-1.5 text-ok">— tout est en ordre</span>
          )}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          title="Revérifier"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-ink-soft hover:bg-clay hover:text-ink-soft disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </button>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        {state.items.map((item) => {
          const { icon: Icon, pill } = STATUS_STYLES[item.status];
          return (
            <span
              key={item.key}
              title={item.detail}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${pill}`}
            >
              <Icon className="h-3 w-3" />
              {item.label}
            </span>
          );
        })}
      </div>

      {issues.length > 0 && (
        <ul className="mt-2 space-y-1">
          {issues.map((item) => (
            <li key={item.key} className={`text-xs ${STATUS_STYLES[item.status].text}`}>
              <span className="font-medium">{item.label}</span>
              {item.detail ? ` — ${item.detail}` : item.status === "missing" ? " — absent." : " — incomplet."}
            </li>
          ))}
        </ul>
      )}

      {issues.length > 0 && (
        <div className="mt-2.5 border-t border-line-soft pt-2.5">
          {state.canRepair ? (
            <>
              <button
                type="button"
                onClick={repair}
                disabled={repairing}
                className="flex items-center gap-1.5 rounded-md bg-ink px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3A362F] disabled:opacity-60"
              >
                {repairing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wrench className="h-3.5 w-3.5" />
                )}
                {repairing ? "Réparation en cours..." : "Continuer l'auto-setup"}
              </button>
              <p className="mt-1.5 text-[11px] text-ink-soft">
                Rejoue la même configuration que le dernier auto-setup — ne touche que ce qui
                est manquant ci-dessus, le reste est laissé tel quel.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-ink-soft">
              Lancez d&apos;abord l&apos;assistant complet (Configuration routeur) une fois pour
              pouvoir réparer une étape manquante depuis ici.
            </p>
          )}

          {repairResult && (
            <div
              className={`mt-2 rounded-md px-2.5 py-2 text-xs ${
                repairResult.success
                  ? "bg-clay text-ok"
                  : repairResult.firmwareUpdating
                    ? "bg-clay text-warn"
                    : "bg-red-50 text-red-600"
              }`}
            >
              {repairResult.success ? (
                <p>Réparation terminée — relancez la vérification pour confirmer.</p>
              ) : repairResult.firmwareUpdating ? (
                <p>{repairResult.message}</p>
              ) : (
                <p>{repairResult.error ?? "Échec de la réparation."}</p>
              )}
              {repairResult.log && repairResult.log.length > 0 && (
                <ul className="mt-1 space-y-0.5 text-[11px] text-ink-soft">
                  {repairResult.log
                    .filter((line) => line.startsWith("SKIP"))
                    .map((line, i) => (
                      <li key={i}>{line}</li>
                    ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
