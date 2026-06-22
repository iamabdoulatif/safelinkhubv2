"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { Check, Copy, Download, Laptop, Router as RouterIcon } from "lucide-react";
import {
  generatePersonalOpenvpnAccess,
  generatePersonalWireguardAccess,
} from "@/lib/mikrotik/personal-access";
import PersonalAccessList, { type PersonalAccessRow } from "./PersonalAccessList";

type AccessState =
  | {
      success: boolean;
      fileName: string;
      content: string;
      command?: string;
      error?: undefined;
    }
  | { error: string; success?: undefined; fileName?: undefined; content?: undefined }
  | undefined;

type ReachableRouter = {
  name: string;
  tunnelIp: string;
  method: string;
  status: string;
};

function downloadFile(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function PersonalAccessForm({ method }: { method: "wireguard" | "openvpn" }) {
  const router = useRouter();
  const action =
    method === "wireguard" ? generatePersonalWireguardAccess : generatePersonalOpenvpnAccess;
  const [state, formAction, pending] = useActionState<AccessState, FormData>(
    action,
    undefined,
  );
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (state && "success" in state && state.success) {
      downloadFile(state.fileName, state.content);
      router.refresh();
      if (method === "wireguard") {
        QRCode.toDataURL(state.content, { width: 220, margin: 1 })
          .then(setQrDataUrl)
          .catch(() => setQrDataUrl(null));
      }
    }
  }, [state, router, method]);

  return (
    <form action={formAction} className="space-y-3">
      {state && "error" in state && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      {state && "success" in state && state.success && (
        <div className="space-y-3">
          <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
            Fichier {state.fileName} téléchargé. Sur PC (Windows/macOS/Linux),
            importez-le dans l&apos;app WireGuard ou OpenVPN. Sur Android ou
            iPhone, transférez ce fichier sur le téléphone (AirDrop, e-mail,
            Drive...) puis ouvrez-le avec l&apos;app correspondante.
          </p>

          {method === "wireguard" && qrDataUrl && (
            <div className="flex flex-col items-start gap-2 rounded-md border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">
                Ou scannez ce QR code directement depuis l&apos;app WireGuard
                sur Android / iPhone (bouton &quot;+&quot; → &quot;Scanner depuis le
                code QR&quot;) :
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrDataUrl}
                alt="QR code de configuration WireGuard"
                width={220}
                height={220}
                className="rounded-md border border-slate-100"
              />
            </div>
          )}

          {state.command && (
            <div>
              <p className="text-sm font-medium text-slate-700">
                MikroTik — script équivalent (au cas où vous préférez connecter le
                routeur lui-même à ce même accès) :
              </p>
              <div className="relative mt-2">
                <pre className="overflow-x-auto rounded-md bg-slate-900 p-3 pr-10 text-[11px] text-emerald-300">
                  {state.command}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(state.command!);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="absolute right-2 top-2 rounded-md bg-slate-800 p-1.5 text-slate-300 hover:bg-slate-700"
                  title="Copier la commande"
                >
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      <div>
        <label className="mb-1 block text-sm font-medium text-slate-700">
          Nom de cet accès
        </label>
        <input
          name="label"
          required
          placeholder="laptop-amadou"
          className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
        />
      </div>

      <button
        type="submit"
        disabled={pending}
        className="flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        {pending ? "Génération..." : "Générer et télécharger"}
      </button>
    </form>
  );
}

function ReachableRoutersList({ routers }: { routers: ReachableRouter[] }) {
  if (routers.length === 0) return null;

  return (
    <div className="mt-4 rounded-md border border-slate-200 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
        <RouterIcon className="h-4 w-4 text-slate-400" />
        Une fois connecté, vos routeurs sont joignables sur :
      </p>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        {routers.map((r) => (
          <li key={r.name} className="flex items-center justify-between">
            <span>{r.name}</span>
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
              {r.tunnelIp}
            </code>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-slate-400">
        Utilisez cette IP dans WinBox (PC) ou un client SSH (PC, Android,
        iPhone) une fois le VPN actif sur votre appareil.
      </p>
    </div>
  );
}

export default function PersonalAccessSection({
  rows,
  reachableRouters,
}: {
  rows: PersonalAccessRow[];
  reachableRouters: ReachableRouter[];
}) {
  const [method, setMethod] = useState<"wireguard" | "openvpn">("wireguard");

  return (
    <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Laptop className="h-5 w-5 text-slate-700" />
        <h2 className="font-semibold text-slate-900">Accès VPN personnel</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Générez un fichier de configuration client pour rejoindre le VPN
        SafeLinkHub depuis n&apos;importe quel ordinateur, téléphone Android
        ou iPhone (pas seulement le relais) et accéder directement à vos
        routeurs MikroTik &mdash; par exemple pour ouvrir WinBox ou SSH sans
        passer par l&apos;application.
      </p>

      <ReachableRoutersList routers={reachableRouters} />

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setMethod("wireguard")}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            method === "wireguard"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          WireGuard
        </button>
        <button
          type="button"
          onClick={() => setMethod("openvpn")}
          className={`rounded-full px-3 py-1 text-sm font-medium ${
            method === "openvpn"
              ? "bg-slate-900 text-white"
              : "bg-slate-100 text-slate-500 hover:bg-slate-200"
          }`}
        >
          OpenVPN
        </button>
      </div>

      <p className="mt-2 text-xs text-slate-400">
        {method === "wireguard"
          ? "Compatible avec l'app WireGuard officielle sur Windows, macOS, Linux, Android et iOS."
          : "Compatible avec OpenVPN Connect (ou tout client OpenVPN) sur Windows, macOS, Linux, Android et iOS."}
      </p>

      <div className="mt-4">
        <PersonalAccessForm method={method} />
      </div>

      <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Chaque routeur connecté reste joignable sur son IP de tunnel (
        10.66.0.0/24 pour WireGuard, 10.67.0.0/24 pour OpenVPN) une fois ce
        VPN actif sur votre appareil. Conservez ces fichiers en lieu sûr : ils
        donnent un accès réseau direct à vos routeurs.
      </p>

      <h3 className="mt-6 text-sm font-semibold text-slate-700">
        Accès existants
      </h3>
      <PersonalAccessList rows={rows} />
    </div>
  );
}
