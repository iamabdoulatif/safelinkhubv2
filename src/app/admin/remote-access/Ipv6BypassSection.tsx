"use client";

import { useState } from "react";
import { Globe, Loader2, ArrowRightLeft, Search } from "lucide-react";
import {
  enableIpv6Bypass,
  disableIpv6Bypass,
  detectIspIpv6,
} from "@/lib/mikrotik/ipv6-bypass";

type DiagResult = {
  recommended: boolean;
  verdict: string;
} | null;

type RouterRow = {
  id: string;
  name: string;
  status: string;
  connectionMethod: string;
  ipv6BypassEnabled: boolean;
};

function RouterBypass({
  router,
  relayHost,
}: {
  router: RouterRow;
  relayHost: string;
}) {
  const [pending, setPending] = useState(false);
  const [enabled, setEnabled] = useState(router.ipv6BypassEnabled);
  const [error, setError] = useState<string | null>(null);
  const [diagPending, setDiagPending] = useState(false);
  const [diag, setDiag] = useState<DiagResult>(null);

  const isVpn = router.connectionMethod === "vpn";
  const online = router.status === "online";

  async function handleDiagnose() {
    setDiagPending(true);
    setError(null);
    const res = await detectIspIpv6(router.id);
    setDiagPending(false);
    if (res && "error" in res && res.error) {
      setError(res.error);
      return;
    }
    if (res && "verdict" in res && typeof res.verdict === "string") {
      setDiag({ recommended: !!res.recommended, verdict: res.verdict });
    }
  }

  async function handleToggle() {
    setPending(true);
    setError(null);
    const res = enabled
      ? await disableIpv6Bypass(router.id)
      : await enableIpv6Bypass(router.id);
    setPending(false);
    if (res && "error" in res && res.error) {
      setError(res.error);
      return;
    }
    setEnabled(!enabled);
  }

  return (
    <div className="rounded-lg border border-line-soft p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-ink">{router.name}</span>
          {enabled && (
            <span className="rounded-full bg-ok/10 px-2 py-0.5 text-[10px] font-medium text-ok">
              Actif
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleDiagnose}
            disabled={diagPending || !online}
            className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink hover:bg-clay disabled:opacity-50"
          >
            {diagPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Search className="h-3.5 w-3.5" />
            )}
            {diagPending ? "Analyse..." : "Vérifier mon FAI"}
          </button>
          <button
            type="button"
            onClick={handleToggle}
            disabled={pending || !isVpn || !online}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-50 ${
              enabled
                ? "border border-line text-ink hover:bg-clay"
                : "bg-ink text-white hover:bg-slate-deep-line"
            }`}
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {pending
              ? enabled
                ? "Désactivation..."
                : "Activation..."
              : enabled
                ? "Désactiver"
                : "Activer le Bypass IPv6"}
          </button>
        </div>
      </div>

      {diag && (
        <p
          className={`mt-2 text-xs ${diag.recommended ? "text-warn" : "text-ok"}`}
        >
          {diag.verdict}
        </p>
      )}

      {!isVpn && (
        <p className="mt-1 text-xs text-ink-soft">
          Nécessite un tunnel WireGuard SafeLinkHub sur ce routeur (installez-le
          depuis « Installer un tunnel »).
        </p>
      )}

      {isVpn && !online && (
        <p className="mt-1 text-xs text-ink-soft">
          Le routeur doit être en ligne pour modifier ce réglage.
        </p>
      )}

      {isVpn && enabled && (
        <p className="mt-1 text-xs text-ok">
          Le trafic des clients hotspot sort désormais via l&apos;IPv4 publique du
          VPS{relayHost ? ` (${relayHost})` : ""}.
        </p>
      )}

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}

export default function Ipv6BypassSection({
  routers,
  relayHost,
}: {
  routers: RouterRow[];
  relayHost: string;
}) {
  if (routers.length === 0) return null;

  return (
    <div className="border border-line bg-paper p-6 rounded-xl">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5 text-ink" />
        <h2 className="font-semibold text-ink">Bypass IPv6</h2>
      </div>
      <p className="mt-1 text-sm text-ink-soft">
        Si votre FAI ne fournit que de l&apos;IPv6 avec CGNAT / DS-Lite (pas
        d&apos;IPv4 publique utilisable), ou si certains services fonctionnent mal
        en IPv6, activez ce mode pour faire sortir le trafic de vos clients hotspot
        par l&apos;IPv4 publique du VPS SafeLinkHub, via le tunnel WireGuard déjà
        installé.
      </p>

      <div className="mt-3 flex items-center gap-2 rounded-md bg-clay px-3 py-2 text-xs text-ink">
        <ArrowRightLeft aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
        <span>
          Clients → MikroTik → tunnel WireGuard → VPS (IPv4 publique) → Internet.
          Seul le trafic des clients hotspot est concerné ; le routeur lui-même
          reste sur la connexion FAI.
        </span>
      </div>

      <div className="mt-4 space-y-3">
        {routers.map((r) => (
          <RouterBypass key={r.id} router={r} relayHost={relayHost} />
        ))}
      </div>
    </div>
  );
}
