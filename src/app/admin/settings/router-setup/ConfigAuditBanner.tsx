"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, XCircle } from "lucide-react";
import { auditRouterConfig, type ConfigAuditItem } from "@/lib/mikrotik/config-audit";

const STATUS_STYLES: Record<ConfigAuditItem["status"], { icon: typeof CheckCircle2; pill: string; text: string }> = {
  ok: { icon: CheckCircle2, pill: "bg-emerald-50 text-emerald-700", text: "text-emerald-700" },
  incomplete: { icon: AlertTriangle, pill: "bg-amber-50 text-amber-700", text: "text-amber-700" },
  missing: { icon: XCircle, pill: "bg-red-50 text-red-600", text: "text-red-600" },
};

/**
 * Reads the router's *live* state (not just SafeLinkHub's DB) so a device
 * that already had partial configuration before being connected here —
 * manually, or from an interrupted previous auto-setup run — gets called
 * out by name instead of silently looking fine.
 */
export default function ConfigAuditBanner({ routerId }: { routerId: string }) {
  const [state, setState] = useState<
    { loading: true } | { loading: false; items?: ConfigAuditItem[]; error?: string }
  >({ loading: true });
  const [refreshing, setRefreshing] = useState(false);

  function runAudit(onComplete?: () => void) {
    auditRouterConfig(routerId).then((res) => {
      if (res?.error) setState({ loading: false, error: res.error });
      else if (res?.items) setState({ loading: false, items: res.items });
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

  if (state.loading) {
    return (
      <p className="mb-4 flex items-center gap-2 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" />
        Vérification de la configuration existante sur le routeur...
      </p>
    );
  }

  if (state.error || !state.items) return null;

  const issues = state.items.filter((i) => i.status !== "ok");

  return (
    <div className="animate-fade-slide-up mb-4 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-600">
          Configuration détectée sur le routeur
          {issues.length === 0 && (
            <span className="ml-1.5 text-emerald-600">— tout est en ordre</span>
          )}
        </p>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing}
          title="Revérifier"
          className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-50"
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
    </div>
  );
}
