"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Laptop2, Pencil, ShieldOff, Trash2 } from "lucide-react";
import {
  deletePersonalVpnAccess,
  revokePersonalVpnAccess,
  updatePersonalVpnAccess,
} from "@/lib/mikrotik/personal-access";

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

function toDateInputValue(date: Date | null) {
  if (!date) return "";
  return date.toISOString().slice(0, 10);
}

function RevokeButton({ id }: { id: string }) {
  const router = useRouter();
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
              else {
                setConfirming(false);
                router.refresh();
              }
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
        className="flex items-center gap-1.5 rounded-md border border-amber-200 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50"
      >
        <ShieldOff className="h-3.5 w-3.5" />
        Révoquer
      </button>
    </div>
  );
}

function DeleteButton({ id }: { id: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-500">Supprimer définitivement ?</span>
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await deletePersonalVpnAccess(id);
              if (result?.error) setError(result.error);
              else router.refresh();
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
        <Trash2 className="h-3.5 w-3.5" />
        Supprimer
      </button>
    </div>
  );
}

function EditForm({ row, onClose }: { row: PersonalAccessRow; onClose: () => void }) {
  const router = useRouter();
  const [label, setLabel] = useState(row.label);
  const [autoRenew, setAutoRenew] = useState(row.autoRenew);
  const [expiresAt, setExpiresAt] = useState(toDateInputValue(row.expiresAt));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mt-3 space-y-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">Nom</label>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Date d&apos;expiration
          </label>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="w-full rounded-md border border-slate-300 px-2.5 py-1.5 text-sm focus:border-slate-400 focus:outline-none"
          />
        </div>
        <div className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            id={`auto-renew-${row.id}`}
            checked={autoRenew}
            onChange={(e) => setAutoRenew(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          <label htmlFor={`auto-renew-${row.id}`} className="text-sm text-slate-600">
            Renouvellement automatique
          </label>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await updatePersonalVpnAccess(row.id, {
                label,
                autoRenew,
                expiresAt: expiresAt || null,
              });
              if (result?.error) setError(result.error);
              else {
                onClose();
                router.refresh();
              }
            })
          }
          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Enregistrement..." : "Enregistrer"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={onClose}
          className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
        >
          Annuler
        </button>
      </div>
    </div>
  );
}

function CopyableField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-400">{label}</p>
      <button
        type="button"
        onClick={() => {
          navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        title={copied ? "Copié" : `Copier : ${value}`}
        className="flex w-full items-center gap-1.5 text-sm font-medium text-slate-700 hover:text-slate-900"
      >
        <span className="truncate" title={value}>
          {value}
        </span>
        <Copy className="h-3 w-3 flex-shrink-0 text-slate-400" />
        {copied && <span className="flex-shrink-0 text-xs text-emerald-600">Copié</span>}
      </button>
    </div>
  );
}

export default function PersonalAccessList({ rows }: { rows: PersonalAccessRow[] }) {
  const [editingId, setEditingId] = useState<string | null>(null);

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
        const editing = editingId === r.id;
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
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setEditingId(editing ? null : r.id)}
                  className="flex items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Modifier
                </button>
                {active && <RevokeButton id={r.id} />}
                <DeleteButton id={r.id} />
              </div>
            </div>

            {editing && (
              <EditForm row={r} onClose={() => setEditingId(null)} />
            )}

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {r.username && <CopyableField label="Identifiant VPN" value={r.username} />}
              {r.password && <CopyableField label="Mot de passe VPN" value={r.password} />}
              <CopyableField label="IP VPN" value={r.vpnIp ?? "—"} />
              <CopyableField label="Serveur VPN" value={`${r.remoteHost}:${r.remotePort}`} />
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Une fois connecté à ce VPN, joignez un routeur directement via son IP tunnel
              (ex. 10.66.0.x:8291 pour WinBox) — pas via un port public séparé.
            </p>

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
