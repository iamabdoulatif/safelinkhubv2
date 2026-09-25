"use client";

import { useEffect, useState } from "react";
import { Check, ChevronDown, Copy, Loader2, Smartphone } from "lucide-react";
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
  // Collapsed by default — auto-opens once activation actually produces
  // something worth seeing (status message, error, or the QR/config),
  // so the admin isn't stuck expanding it manually right after clicking
  // "Activer Back To Home".
  const [open, setOpen] = useState(false);

  async function handleEnable() {
    setPending(true);
    const res = await enableBackToHome(router.id);
    setPending(false);
    setResult(res as BthResult);
    setOpen(true);
  }

  // RouterOS's own "vpn-wireguard-client-config-qrcode" field is an
  // ASCII/text rendering meant for a terminal, not a real PNG — rendering
  // it as <img src="data:image/png;base64,..."> just produces a broken,
  // invisible image. Generate a real scannable QR code ourselves from the
  // WireGuard config text instead.
  useEffect(() => {
    if (result && "success" in result && result.ready) {
      let cancelled = false;
      QRCode.toDataURL(result.wgConfig, { width: 200, margin: 1 })
        .then((url) => {
          if (!cancelled) setQrDataUrl(url);
        })
        .catch(() => {
          if (!cancelled) setQrDataUrl(null);
        });
      return () => {
        cancelled = true;
      };
    }
    // Resetting the QR derived from `result` back to null when there's
    // nothing to render is the actual "no QR" state, not a cascading-render
    // hazard.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQrDataUrl(null);
  }, [result]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={handleEnable}
          disabled={pending || router.status !== "online"}
          className="btn btn-sm btn-secondary flex items-center gap-1.5"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Activation..." : "Activer Back To Home"}
        </button>
        {result && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className="inline-flex items-center gap-1 text-xs font-medium text-ink-soft hover:text-ink"
          >
            {open ? "Masquer le résultat" : "Voir le résultat"}
            <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        )}
      </div>

      {router.status !== "online" && (
        <p className="mt-2 text-xs text-ink-soft">
          Le routeur doit être en ligne pour activer cette fonctionnalité.
        </p>
      )}

      {open && (
        <>
          {result && "error" in result && (
            <p className="mt-2 text-xs text-err">{result.error}</p>
          )}

          {result && "success" in result && !result.ready && (
            <p className="mt-2 text-xs text-warn">{result.message}</p>
          )}

          {result && "success" in result && result.ready && (
            <div className="mt-3 space-y-2">
              <p className="text-xs text-ok">
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
                  className="rounded border border-line-soft"
                />
              )}
              <div className="relative">
                <pre className="code-block p-2 pr-8 text-xs">
                  {result.wgConfig}
                </pre>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(result.wgConfig);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                  className="absolute right-1 top-1 rounded bg-slate-deep-line p-1 text-white hover:bg-slate-deep-line"
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function BackToHomeSection({ routers }: { routers: RouterRow[] }) {
  if (routers.length === 0) return null;

  return (
    <section
      aria-labelledby="back-to-home"
      className="flex flex-col rounded-2xl border border-line bg-paper p-5 sm:p-6"
    >
      <div className="flex items-start gap-3.5">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-line bg-clay text-ink"
        >
          <Smartphone className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h3 id="back-to-home" className="font-semibold text-ink">
            Back To Home
          </h3>
          <p className="mt-1 text-sm leading-6 text-ink-soft">
            L&apos;app officielle MikroTik (Android, iPhone) rejoint le routeur par le relais cloud
            de MikroTik, indépendamment de SafeLinkHub. On active le réglage côté routeur ; la
            première liaison se fait une fois, connecté à son Wi-Fi.
          </p>
          <p className="mt-2 text-xs text-ink-soft">
            Processeur ARM, ARM64 ou TILE · RouterOS 7.12 ou plus · la configuration WireGuard
            produite marche aussi avec l&apos;app WireGuard.
          </p>
        </div>
      </div>

      <div className="mt-5 space-y-4 border-t border-line-soft pt-4">
        {routers.map((r) => (
          <RouterBackToHome key={r.id} router={r} />
        ))}
      </div>
    </section>
  );
}
