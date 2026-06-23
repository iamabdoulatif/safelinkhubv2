"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Globe2, Loader2, ShieldOff } from "lucide-react";
import { disablePortForward, enablePortForward } from "@/lib/mikrotik/port-forward";

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
  ssh: "SSH",
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

  const activeServices = new Set(forwards.map((f) => f.service));

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
        {(["winbox", "webfig", "ssh"] as const).map((service) => {
          const forward = forwards.find((f) => f.service === service);
          return (
            <div key={service} className="flex items-center justify-between text-sm">
              <span className="text-slate-600">{SERVICE_LABELS[service]}</span>
              {forward ? (
                <div className="flex items-center gap-2">
                  <CopyableAddress value={`${relayHost}:${forward.publicPort}`} />
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => handleDisable(forward.id)}
                    className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <ShieldOff className="h-3.5 w-3.5" />
                    Désactiver
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={pending || router.status !== "online"}
                  onClick={() => handleEnable(service)}
                  className="flex items-center gap-1.5 rounded-md bg-slate-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
                >
                  {pendingService === service && (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  )}
                  Activer
                </button>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        {activeServices.size > 0
          ? "Connectez-vous directement avec ces adresses, sans VPN ni app à installer."
          : "Aucun accès direct actif."}
      </p>
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
