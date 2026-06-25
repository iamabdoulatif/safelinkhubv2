"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Loader2, Smartphone } from "lucide-react";
import QRCode from "qrcode";
import { enableBackToHome } from "@/lib/mikrotik/back-to-home";

type RouterRow = { id: string; name: string; status: string };

type BthResult =
  | { error: string }
  | { success: true; ready: false; ddnsName: string | null; message: string }
  | {
      success: true;
      ready: true;
      ddnsName: string | null;
      wgConfig: string;
      wgQrCode: string | null;
    }
  | null;

function RouterBackToHome({ router }: { router: RouterRow }) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<BthResult>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);

  async function handleEnable() {
    setPending(true);
    const res = await enableBackToHome(router.id);
    setPending(false);
    setResult(res as BthResult);
  }

  // RouterOS's own "vpn-wireguard-client-config-qrcode" field is an
  // ASCII/text rendering meant for a terminal, not a real PNG — rendering
  // it as <img src="data:image/png;base64,..."> just produces a broken,
  // invisible image. Generate a real scannable QR code ourselves from the
  // WireGuard config text instead.
  useEffect(() => {
    if (result && "success" in result && result.ready) {
      QRCode.toDataURL(result.wgConfig, { width: 200, margin: 1 })
        .then(setQrDataUrl)
        .catch(() => setQrDataUrl(null));
    } else {
      setQrDataUrl(null);
    }
  }, [result]);

  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">{router.name}</span>
        <button
          type="button"
          onClick={handleEnable}
          disabled={pending || router.status !== "online"}
          className="flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Activation..." : "Activer Back To Home"}
        </button>
      </div>

      {router.status !== "online" && (
        <p className="mt-1 text-xs text-slate-400">
          Le routeur doit être en ligne pour activer cette fonctionnalité.
        </p>
      )}

      {result && "error" in result && (
        <p className="mt-2 text-xs text-red-600">{result.error}</p>
      )}

      {result && "success" in result && !result.ready && (
        <p className="mt-2 text-xs text-amber-600">{result.message}</p>
      )}

      {result && "success" in result && result.ready && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-emerald-700">
            Back To Home activé{result.ddnsName ? ` (${result.ddnsName})` : ""}. Scannez le
            QR code ci-dessous avec l&apos;app WireGuard (ou Back To Home) sur Android/iPhone.
          </p>
          {qrDataUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qrDataUrl}
              alt="QR code Back To Home"
              width={160}
              height={160}
              className="rounded border border-slate-100"
            />
          )}
          <div className="relative">
            <pre className="overflow-x-auto rounded bg-slate-900 p-2 pr-8 text-[10px] text-emerald-300">
              {result.wgConfig}
            </pre>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(result.wgConfig);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
              className="absolute right-1 top-1 rounded bg-slate-800 p-1 text-slate-300 hover:bg-slate-700"
            >
              {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function BackToHomeSection({ routers }: { routers: RouterRow[] }) {
  if (routers.length === 0) return null;

  return (
    <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <Smartphone className="h-5 w-5 text-slate-700" />
        <h2 className="font-semibold text-slate-900">MikroTik Back To Home</h2>
      </div>
      <p className="mt-1 text-sm text-slate-500">
        Fonctionnalité officielle MikroTik : l&apos;app gratuite &quot;Back To
        Home&quot; (Android/iPhone) utilise le relais cloud de MikroTik,
        indépendamment du VPN SafeLinkHub. On active automatiquement le
        réglage côté routeur ; la toute première liaison de l&apos;app doit
        ensuite se faire une fois, en étant connecté au Wi-Fi du routeur, en
        saisissant son IP locale, l&apos;identifiant et le mot de passe dans
        l&apos;app.
      </p>

      <div className="mt-4 space-y-3">
        {routers.map((r) => (
          <RouterBackToHome key={r.id} router={r} />
        ))}
      </div>

      <p className="mt-4 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-700">
        Nécessite un routeur à processeur ARM/ARM64/TILE avec RouterOS 7.12
        ou plus récent. La configuration WireGuard générée fonctionne aussi
        directement avec l&apos;app WireGuard classique, sans passer par
        l&apos;app Back To Home.
      </p>
    </div>
  );
}
