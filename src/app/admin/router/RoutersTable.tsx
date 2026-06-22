"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Link2, Search } from "lucide-react";
import RouterRowActions from "./RouterRowActions";

export type RouterRow = {
  id: string;
  name: string;
  model: string | null;
  status: string;
  cpuLoad: number | null;
  memoryUsage: string | null;
  connectionMethod: string;
};

function ProvisioningBadge({ status }: { status: string }) {
  if (status === "online") {
    return (
      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
        Provisionné
      </span>
    );
  }
  if (status === "installing" || status === "pending") {
    return (
      <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
        En cours
      </span>
    );
  }
  return (
    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500">
      Hors service
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const online = status === "online";
  return (
    <span
      className={`flex items-center gap-1.5 text-sm font-medium ${
        online ? "text-emerald-600" : "text-red-500"
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`} />
      {online ? "En ligne" : "Hors ligne"}
    </span>
  );
}

function ConnectionBadge({ connectionMethod }: { connectionMethod: string }) {
  const isVpn = connectionMethod === "vpn";
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-medium ${
        isVpn ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {isVpn ? "WireGuard" : "Direct"}
    </span>
  );
}

function RemoteAccessToggle({ enabled }: { enabled: boolean }) {
  return (
    <span
      title={
        enabled
          ? "Accès distant actif via le tunnel WireGuard"
          : "Aucun tunnel d'accès distant (connexion directe)"
      }
      className={`relative inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors ${
        enabled ? "bg-emerald-500" : "bg-slate-200"
      }`}
    >
      <span
        className={`absolute h-4.5 w-4.5 rounded-full bg-white shadow transition-transform ${
          enabled ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </span>
  );
}

export default function RoutersTable({ routers }: { routers: RouterRow[] }) {
  const [filter, setFilter] = useState<"all" | "online" | "offline">("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(
    () => ({
      all: routers.length,
      online: routers.filter((r) => r.status === "online").length,
      offline: routers.filter((r) => r.status !== "online").length,
    }),
    [routers],
  );

  const filtered = routers.filter((r) => {
    if (filter === "online" && r.status !== "online") return false;
    if (filter === "offline" && r.status === "online") return false;
    if (query && !r.name.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  });

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Routeurs MikroTik</h1>
          <p className="mt-1 text-sm text-slate-500">
            Pour commencer, ajoutez un routeur MikroTik en cliquant sur le
            bouton &quot;Lier un MikroTik&quot;.
          </p>
        </div>
        <Link
          href="/admin/settings/router-setup"
          className="flex items-center gap-2 rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-600"
        >
          <Link2 className="h-4 w-4" />
          Lier un MikroTik
        </Link>
      </div>

      <div className="mt-6 flex w-fit items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
        {([
          ["all", "Tous"],
          ["online", "En ligne"],
          ["offline", "Hors ligne"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={`flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium ${
              filter === key
                ? "bg-slate-100 text-slate-900"
                : "text-slate-500 hover:text-slate-700"
            }`}
          >
            {label}
            <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-500">
              {counts[key]}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex items-center justify-end border-b border-slate-100 p-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher"
              className="w-full rounded-md border border-slate-300 py-1.5 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
            />
          </div>
        </div>

        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-100 text-xs font-medium text-slate-500">
            <tr>
              <th className="px-4 py-3">Nom</th>
              <th className="px-4 py-3">Provisionnement</th>
              <th className="px-4 py-3">CPU</th>
              <th className="px-4 py-3">Mémoire</th>
              <th className="px-4 py-3">Statut</th>
              <th className="px-4 py-3">Connexion</th>
              <th className="px-4 py-3">Accès distant</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-400">
                  Aucun routeur à afficher.
                </td>
              </tr>
            ) : (
              filtered.map((r) => (
                <tr key={r.id} className="border-b border-slate-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-slate-700">{r.name}</td>
                  <td className="px-4 py-3">
                    <ProvisioningBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">{r.cpuLoad ?? 0}%</td>
                  <td className="px-4 py-3 text-slate-600">{r.memoryUsage ?? "0"}%</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3">
                    <ConnectionBadge connectionMethod={r.connectionMethod} />
                  </td>
                  <td className="px-4 py-3">
                    <RemoteAccessToggle enabled={r.connectionMethod === "vpn"} />
                  </td>
                  <td className="px-4 py-3">
                    <RouterRowActions routerId={r.id} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-sm text-slate-500">
          <span>Affichage de {filtered.length} résultat(s)</span>
        </div>
      </div>
    </div>
  );
}
