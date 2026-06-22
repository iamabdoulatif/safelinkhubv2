"use client";

import { useActionState, useEffect, useState } from "react";
import { Download, Laptop } from "lucide-react";
import {
  generatePersonalOpenvpnAccess,
  generatePersonalWireguardAccess,
} from "@/lib/mikrotik/personal-access";

type AccessState =
  | { success: boolean; fileName: string; content: string; error?: undefined }
  | { error: string; success?: undefined; fileName?: undefined; content?: undefined }
  | undefined;

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
  const action =
    method === "wireguard" ? generatePersonalWireguardAccess : generatePersonalOpenvpnAccess;
  const [state, formAction, pending] = useActionState<AccessState, FormData>(
    action,
    undefined,
  );

  useEffect(() => {
    if (state && "success" in state && state.success) {
      downloadFile(state.fileName, state.content);
    }
  }, [state]);

  return (
    <form action={formAction} className="space-y-3">
      {state && "error" in state && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-600">{state.error}</p>
      )}
      {state && "success" in state && state.success && (
        <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Fichier {state.fileName} téléchargé. Importez-le dans votre client{" "}
          {method === "wireguard" ? "WireGuard" : "OpenVPN"} pour vous connecter
          depuis cet ordinateur, où que vous soyez.
        </p>
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

export default function PersonalAccessSection() {
  const [method, setMethod] = useState<"wireguard" | "openvpn">("wireguard");

  return (
    <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Laptop className="h-5 w-5 text-slate-700" />
        <h2 className="font-semibold text-slate-900">Accès VPN personnel</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Générez un fichier de configuration client pour rejoindre le VPN
        SafeLinkHub depuis n&apos;importe quel ordinateur (pas seulement le
        relais) et accéder directement à vos routeurs MikroTik &mdash; par
        exemple pour ouvrir WinBox ou SSH sans passer par l&apos;application.
      </p>

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

      <div className="mt-4">
        <PersonalAccessForm method={method} />
      </div>

      <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
        Chaque routeur connecté reste joignable sur son IP de tunnel (
        10.66.0.0/24 pour WireGuard, 10.67.0.0/24 pour OpenVPN) une fois ce
        VPN actif sur votre machine. Conservez ces fichiers en lieu sûr : ils
        donnent un accès réseau direct à vos routeurs.
      </p>
    </div>
  );
}
