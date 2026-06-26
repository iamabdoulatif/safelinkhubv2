"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, ExternalLink, Globe2, Loader2, ShieldOff } from "lucide-react";
import { disablePortForward, enablePortForward } from "@/lib/mikrotik/port-forward";
import { getRouterResources, type RouterResources } from "@/lib/mikrotik/router-resources";

type RouterRow = {
  id: string;
  name: string;
  status: string;
  connectionMethod: string;
  tunnelIp: string | null;
};

export type ForwardRow = {
  id: string;
  routerId: string;
  service: string;
  publicPort: number;
};

const SERVICE_LABELS: Record<string, string> = {
  winbox: "WinBox",
  webfig: "WebFig (navigateur)",
  ssh: "SSH (SFTP — FileZilla, etc.)",
  mikhmon: "MikHmon (vouchers)",
};

function CopyableAddress({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="flex items-center gap-1.5 rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-200"
      title="Copier"
    >
      {value}
      <Copy className="h-3 w-3 text-slate-400" />
      {copied && <span className="text-emerald-600">Copié</span>}
    </button>
  );
}

function serviceUrl(service: string, address: string) {
  if (service === "webfig" || service === "mikhmon") return `http://${address}`;
  return address;
}

function RouterDirectAccess({
  router,
  forwards,
  relayHost,
}: {
  router: RouterRow;
  forwards: ForwardRow[];
  relayHost: string;
}) {
  const navRouter = useRouter();
  const [pendingService, setPendingService] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [resources, setResources] = useState<RouterResources | null>(null);

  const activeServices = new Set(forwards.map((f) => f.service));
  const hasActiveAccess = activeServices.size > 0;
  const resourcesLoading = hasActiveAccess && resources === null;
  const summary = resources?.accessSummary;

  // Re-fetched on every mount (i.e. every page refresh, and right after a
  // toggle triggers navRouter.refresh()) so an enabled access never goes
  // unnoticed — same idea as WinBox's own Neighbors list, but for routers
  // reachable through the relay rather than local broadcast discovery.
  useEffect(() => {
    if (!hasActiveAccess) return;
    let cancelled = false;
    getRouterResources(router.id).then((res) => {
      if (cancelled) return;
      if (res?.success) setResources(res.resources);
    });
    return () => {
      cancelled = true;
    };
  }, [hasActiveAccess, router.id]);

  function handleEnable(service: string) {
    setPendingService(service);
    setError(null);
    startTransition(async () => {
      const res = await enablePortForward(router.id, service);
      setPendingService(null);
      if (res?.error) setError(res.error);
      else navRouter.refresh();
    });
  }

  function handleDisable(forwardId: string) {
    startTransition(async () => {
      const res = await disablePortForward(forwardId);
      if (res?.error) setError(res.error);
      else navRouter.refresh();
    });
  }

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700">{router.name}</span>
        {router.status !== "online" && (
          <span className="text-xs text-slate-400">Routeur hors ligne</span>
        )}
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <div className="mt-2 space-y-2">
        {(["winbox", "webfig", "ssh", "mikhmon"] as const).map((service) => {
          const forward = forwards.find((f) => f.service === service);
          const isPublic = Boolean(forward);
          const busy = pending && (pendingService === service || (isPublic && pending));
          return (
            <div key={service} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{SERVICE_LABELS[service]}</span>
              <div className="flex items-center gap-2">
                {forward && <CopyableAddress value={`${relayHost}:${forward.publicPort}`} />}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPublic}
                  disabled={busy || (!isPublic && router.status !== "online")}
                  onClick={() =>
                    isPublic ? handleDisable(forward!.id) : handleEnable(service)
                  }
                  className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
                    isPublic ? "bg-red-500" : "bg-slate-300"
                  }`}
                >
                  <span
                    className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                      isPublic ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
                <span
                  className={`flex w-14 items-center gap-1 text-xs font-medium ${
                    isPublic ? "text-red-600" : "text-slate-500"
                  }`}
                >
                  {pendingService === service ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isPublic ? (
                    <Globe2 className="h-3 w-3" />
                  ) : (
                    <ShieldOff className="h-3 w-3 rotate-180" />
                  )}
                  {isPublic ? "Public" : "Privé"}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {hasActiveAccess
          ? "Connectez-vous directement avec ces adresses, sans VPN ni app à installer."
          : "Aucun accès direct actif."}
      </p>

      {hasActiveAccess && (
        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50/60 p-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {forwards.map((forward) => {
              const address = `${relayHost}:${forward.publicPort}`;
              const url = serviceUrl(forward.service, address);
              return (
                <div
                  key={forward.id}
                  className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-white px-2.5 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-slate-700">
                      {SERVICE_LABELS[forward.service] ?? forward.service}
                    </p>
                    <p className="truncate text-slate-500">{address}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <CopyableAddress value={address} />
                    {(forward.service === "webfig" || forward.service === "mikhmon") && (
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded bg-slate-100 p-1.5 text-slate-500 hover:bg-slate-200"
                        title="Ouvrir"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="mt-3 overflow-x-auto rounded-md border border-slate-100 bg-white">
            <table className="w-full min-w-[760px] text-left text-[11px]">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-2 py-1.5 font-medium">MAC WAN</th>
                <th className="px-2 py-1.5 font-medium">IP WAN</th>
                <th className="px-2 py-1.5 font-medium">IP publique</th>
                <th className="px-2 py-1.5 font-medium">IP tunnel</th>
                <th className="px-2 py-1.5 font-medium">Identity</th>
                <th className="px-2 py-1.5 font-medium">Version</th>
                <th className="px-2 py-1.5 font-medium">Board</th>
                <th className="px-2 py-1.5 font-medium">Uptime</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-slate-100">
                <td className="px-2 py-1.5 font-medium text-slate-700">
                  {resourcesLoading && !resources ? (
                    <span className="flex items-center gap-1 text-slate-400">
                      <Loader2 className="h-3 w-3 animate-spin" /> ...
                    </span>
                  ) : (
                    summary?.wanMacAddress || "—"
                  )}
                </td>
                <td className="px-2 py-1.5 text-slate-600">{summary?.wanIpAddress || "—"}</td>
                <td className="px-2 py-1.5 text-slate-600">{relayHost || "—"}</td>
                <td className="px-2 py-1.5 text-slate-600">{summary?.tunnelIp || router.tunnelIp || "—"}</td>
                <td className="px-2 py-1.5 font-medium text-slate-700">
                  {summary?.identity ?? resources?.identity ?? router.name}
                </td>
                <td className="px-2 py-1.5 text-slate-600">{resources?.version ?? "—"}</td>
                <td className="px-2 py-1.5 text-slate-600">{resources?.boardName ?? "—"}</td>
                <td className="px-2 py-1.5 text-slate-600">{resources?.uptime ?? "—"}</td>
              </tr>
            </tbody>
          </table>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DirectAccessSection({
  routers,
  forwardsByRouter,
  relayHost,
}: {
  routers: RouterRow[];
  forwardsByRouter: Record<string, ForwardRow[]>;
  relayHost: string;
}) {
  const eligible = routers.filter((r) => r.connectionMethod !== "direct" && r.tunnelIp);
  if (eligible.length === 0) return null;

  return (
    <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Globe2 className="h-5 w-5 text-slate-700" />
        <h2 className="font-semibold text-slate-900">
          Accès direct sans VPN (WinBox / WebFig)
        </h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Ouvre une adresse publique (relais:port) qui redirige directement
        vers le routeur — aucun client VPN, aucune app à installer sur
        l&apos;appareil qui se connecte. Fonctionne depuis n&apos;importe
        quel PC, téléphone, ou WinBox.
      </p>

      <div className="mt-4 space-y-3">
        {eligible.map((r) => (
          <RouterDirectAccess
            key={r.id}
            router={r}
            forwards={forwardsByRouter[r.id] ?? []}
            relayHost={relayHost}
          />
        ))}
      </div>

      <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
        Attention : ce port devient joignable par quiconque connaît
        l&apos;adresse — seule l&apos;authentification du routeur protège
        l&apos;accès. Utilisez un mot de passe fort sur le routeur avant
        d&apos;activer ceci.
      </p>
    </div>
  );
}
