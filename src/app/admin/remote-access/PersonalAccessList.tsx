"use client";

import { useState, useTransition } from "react";
import { Copy, Laptop2, ShieldOff } from "lucide-react";
import { revokePersonalVpnAccess } from "@/lib/mikrotik/personal-access";

export type PersonalAccessRow = {
  id: string;
  label: string;
  method: string;
  username: string | null;
  password: string | null;
  vpnIp: string | null;
  remoteHost: string;
  remotePort: number;
  displayPort: number | null;
  status: string;
  autoRenew: boolean;
  createdAt: Date;
  expiresAt: Date | null;
};

function formatDate(date: Date | null) {
  if (!date) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function RevokeButton({ id }: { id: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Révoquer cet accès ?</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await revokePersonalVpnAccess(id);
              if (result?.error) setError(result.error);
              else setConfirming(false);
            })
          }
          className="rounded-md bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
        >
          Confirmer
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => setConfirming(false)}
          className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Annuler
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
      >
        <ShieldOff className="h-3.5 w-3.5" />
        Révoquer
      </button>
    </div>
  );
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="text-xs text-slate-400">{label}</p>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="flex items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
        title="Copier"
      >
        {value}
        <Copy className="h-3 w-3 text-slate-400" />
        {copied && <span className="text-xs text-emerald-600">Copié</span>}
      </button>
    </div>
  );
}

export default function PersonalAccessList({ rows }: { rows: PersonalAccessRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-slate-200 px-4 py-6 text-center text-sm text-slate-400">
        Aucun accès VPN personnel pour le moment.
      </p>
    );
  }

  return (
    <div className="mt-4 space-y-3">
      {rows.map((r) => {
        const active = r.status === "active";
        return (
          <div
            key={r.id}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Laptop2 className="h-4 w-4 text-slate-400" />
                <span className="text-sm font-semibold text-slate-800">{r.label}</span>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
                  {r.method === "wireguard" ? "WireGuard" : "OpenVPN"}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    active
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {active ? "Active" : "Révoqué"}
                </span>
              </div>
              {active && <RevokeButton id={r.id} />}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {r.username && <CopyableField label="Identifiant VPN" value={r.username} />}
              {r.password && <CopyableField label="Mot de passe VPN" value={r.password} />}
              <CopyableField label="IP VPN" value={r.vpnIp ?? "—"} />
              <CopyableField
                label="URL Remote"
                value={
                  r.displayPort
                    ? `${r.remoteHost}:${r.displayPort} <-> 8291`
                    : `${r.remoteHost}:${r.remotePort}`
                }
              />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-400">
              <span>Créé le {formatDate(r.createdAt)}</span>
              <span>Expire le {formatDate(r.expiresAt)}</span>
              <span>Renouvellement auto : {r.autoRenew ? "actif" : "inactif"}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
